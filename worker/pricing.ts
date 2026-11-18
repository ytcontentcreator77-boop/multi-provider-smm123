import type { QuantityMode, ServiceField } from "../shared/types";
import { linkProblem, normalizeLink, type LinkNeed } from "../shared/links";
import { platformName } from "../shared/platforms";

const FIXED = new Set(["package", "custom_comments_package"]);
const LINES: Record<string, string> = {
  custom_comments: "comments",
  mentions_custom_list: "usernames",
  comment_replies: "comments",
};

export function quantityMode(typeKey: string): QuantityMode {
  return FIXED.has(typeKey) ? "fixed" : LINES[typeKey] ? "lines" : "free";
}

export function linesField(typeKey: string): string | null {
  return LINES[typeKey] ?? null;
}

/**
 * Sell price per 1,000 (micro-USD). A fixed price wins; otherwise cost plus the markup that applies
 * (service → category → platform → default). Rounded up to $0.0001.
 */
export function sellRate(cost: number, markupPct: number, fixedRate: number | null): number {
  if (fixedRate !== null && fixedRate !== undefined) return fixedRate;
  const raw = cost * (1 + Math.max(0, markupPct) / 100);
  return Math.ceil(raw / 100 - 1e-9) * 100;
}

/**
 * Total charge in micro-USD for a quantity, at least $0.000001. `rate` is the sell price per 1,000 in micro-USD;
 * fixed-quantity types (packages) cost the rate as a whole. Users see it as Stars (shared/stars.ts).
 */
export function orderCharge(rate: number, quantity: number, mode: QuantityMode): number {
  if (mode === "fixed") return Math.max(1, rate);
  return Math.max(1, Math.ceil((rate * quantity) / 1000 - 1e-9));
}

export function countLines(text: string | undefined): number {
  return (text ?? "").split("\n").map((l) => l.trim()).filter(Boolean).length;
}

const MAX_FIELD_LENGTH = 2000; // single-value fields without their own max_length
const MAX_LINES = 10_000;

export interface DraftCheck {
  /** The link to send, normalized (shared/links.ts) */
  link: string;
  quantity: number;
  fields: Record<string, string>;
}

/** Validates a draft against the service and returns the normalized quantity and fields, or an error code. */
export function checkDraft(
  svc: { type_key: string; platform?: string; linkNeed?: LinkNeed; min: number; max: number; step: number; fields: ServiceField[]; dripfeed: boolean; dripMax: number | null },
  draft: { link?: string; quantity?: number; fields?: Record<string, string>; dripMinutes?: number },
): DraftCheck | { error: string; details?: Record<string, unknown> } {
  // The draft comes straight from user JSON, so check types at runtime rather than trusting the declared ones
  if (typeof draft.link !== "string" || draft.link.trim().length < 2 || draft.link.length > 2048) return { error: "INVALID_LINK" };
  const link = normalizeLink(svc.platform ?? "", draft.link);
  const bad = linkProblem(svc.platform ?? "", svc.linkNeed ?? "any", link);
  if (bad) return { error: bad.code, details: bad.platform ? { platform: platformName(bad.platform) } : undefined };
  const mode = quantityMode(svc.type_key);
  const fields: Record<string, string> = {};
  const raw = draft.fields as unknown;
  if (raw !== undefined && raw !== null) {
    if (typeof raw !== "object" || Array.isArray(raw)) return { error: "INVALID_FIELD" };
    for (const [k, val] of Object.entries(raw)) if (typeof val !== "string") return { error: "INVALID_FIELD", details: { field: k } };
  }
  for (const f of svc.fields) {
    const given = raw && Object.hasOwn(raw, f.key) ? (raw as Record<string, string>)[f.key] : "";
    const v = given.trim();
    if (!v) {
      if (f.required) return { error: "MISSING_FIELD", details: { field: f.key } };
      continue;
    }
    if (f.kind === "integer") {
      const n = Number(v);
      if (!Number.isInteger(n) || (f.min !== undefined && n < f.min) || (f.max !== undefined && n > f.max))
        return { error: "INVALID_FIELD", details: { field: f.key } };
    }
    if (f.kind === "choice" && f.choices && !f.choices.includes(v)) return { error: "INVALID_FIELD", details: { field: f.key } };
    if (f.kind !== "lines" && v.length > (f.max_length || MAX_FIELD_LENGTH)) return { error: "INVALID_FIELD", details: { field: f.key } };
    if (f.kind === "lines") {
      const lines = v.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > MAX_LINES) return { error: "INVALID_FIELD", details: { field: f.key } };
      if (f.max_length && lines.some((l) => l.length > f.max_length!)) return { error: "INVALID_FIELD", details: { field: f.key } };
      fields[f.key] = lines.join("\n");
      continue;
    }
    fields[f.key] = v;
  }
  let quantity: number;
  if (mode === "fixed") quantity = svc.min;
  else if (mode === "lines") quantity = countLines(fields[linesField(svc.type_key)!]);
  else quantity = Math.floor(Number(draft.quantity));
  if (mode !== "fixed") {
    if (!Number.isFinite(quantity) || quantity < svc.min) return { error: "MINIMUM_QUANTITY", details: { n: svc.min } };
    if (quantity > svc.max) return { error: "MAXIMUM_QUANTITY", details: { n: svc.max } };
    if (svc.step > 1 && quantity % svc.step !== 0) return { error: "QUANTITY_STEP", details: { n: svc.step } };
  }
  if (draft.dripMinutes !== undefined && draft.dripMinutes !== null) {
    if (!svc.dripfeed || !svc.dripMax) return { error: "DRIP_FEED_NOT_AVAILABLE" };
    if (!Number.isInteger(draft.dripMinutes) || draft.dripMinutes < 1 || draft.dripMinutes > svc.dripMax) return { error: "DRIP_FEED_INVALID" };
  }
  return { link, quantity, fields };
}

/** Membership discount percentage computed from eligible completed purchases, never wallet deposits. */
export async function membershipDiscountPct(env: import("./env").Env, userId: number, serviceId: number, category?: string): Promise<number> {
  const ts = Math.floor(Date.now() / 1000);
  const override = await env.DB.prepare("SELECT level_id FROM membership_overrides WHERE user_id=?1 AND (expires_at IS NULL OR expires_at>?2)").bind(userId,ts).first<{level_id:number}>();
  let level: {discount_pct:number;service_ids:string;category_rules:string} | null = null;
  if (override) level = await env.DB.prepare("SELECT discount_pct,service_ids,category_rules FROM membership_levels WHERE id=?1 AND enabled=1").bind(override.level_id).first<{discount_pct:number;service_ids:string;category_rules:string}>();
  if (!level) {
    const spend = await env.DB.prepare("SELECT COALESCE(SUM(charge-refunded),0) AS spent FROM orders WHERE user_id=?1 AND status IN ('completed','partial')").bind(userId).first<{spent:number}>();
    level = await env.DB.prepare("SELECT discount_pct,service_ids,category_rules FROM membership_levels WHERE enabled=1 AND threshold_usd*1000000<=?1 ORDER BY threshold_usd DESC,sort DESC LIMIT 1").bind(spend?.spent ?? 0).first<{discount_pct:number;service_ids:string;category_rules:string}>();
  }
  if (!level) return 0;
  try { const ids=JSON.parse(level.service_ids||"[]"); if(Array.isArray(ids)&&ids.length&&!ids.map(Number).includes(serviceId)) return 0; const cats=JSON.parse(level.category_rules||"[]"); if(Array.isArray(cats)&&cats.length&&(!category||!cats.includes(category)))return 0; } catch { return 0; }
  return Math.max(0,Math.min(100,Number(level.discount_pct)||0));
}
