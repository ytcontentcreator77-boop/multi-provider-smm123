// Generic SMM provider client (the common "key + action" v2 API) so any panel can be added from the admin.
import { usdToMicro } from "./notpanel";
import type { Env } from "./env";
import { bumpCatalogStmt, getSettings } from "./settings";
import { rebuildSummaryStmts } from "./catalog";
import { alertAdmins } from "./alerts";

export interface Provider { id: number; name: string; api_url: string; api_key: string; usd_rate: number; enabled: number }
export interface RemoteService { service: string | number; name: string; category: string; type?: string; rate: string | number; min: string | number; max: string | number; refill?: boolean; cancel?: boolean; dripfeed?: boolean }

const ID_SPACE = 10_000_000;
export const PROVIDER_ID_SPACE = ID_SPACE;
/** Provider status text ("In progress", "Canceled"...) → our status keys. */
export const providerStatusKey = (s: unknown): string => {
  const k = String(s ?? "").toLowerCase().trim().replace(/\s+/g, "_");
  return k === "canceled" || k === "refunded" || k === "fail" ? "cancelled" : k;
};
/** Local service id for a provider's service (NotPanel's own services keep their ids, provider 0). */
export const localId = (providerId: number, remoteId: string | number) => providerId * ID_SPACE + Number(remoteId);

function safeUrl(u: string): string {
  const url = new URL(u.trim());
  if (url.protocol !== "https:") throw new Error("API URL must be https");
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:"))
    throw new Error("Private addresses are not allowed");
  const octets = host.split(".").map(Number);
  if (octets.length === 4 && octets.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    const [a, b] = octets;
    if (a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168))
      throw new Error("Private addresses are not allowed");
  }
  if (!host.includes(".") && !host.includes(":")) throw new Error("A public host name is required");
  return url.toString();
}

export async function smm<T = any>(p: Pick<Provider, "api_url" | "api_key">, action: string, params: Record<string, string | number> = {}): Promise<T> {
  const body = new URLSearchParams({ key: p.api_key, action, ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])) });
  const res = await fetch(safeUrl(p.api_url), { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(25_000) });
  const data: any = await res.json().catch(() => { throw new Error(`Bad response (${res.status})`); });
  if (data?.error) throw new Error(String(data.error));
  return data as T;
}

export const getProvider = (env: Env, id: number) => env.DB.prepare("SELECT * FROM providers WHERE id = ?1").bind(id).first<Provider>();

export async function listRemote(p: Provider): Promise<RemoteService[]> {
  const items = await smm<RemoteService[]>(p, "services");
  return Array.isArray(items) ? items : [];
}

/** Imports the chosen remote services as local services (cost stored in micro-USD per 1,000). */
export async function importServices(env: Env, p: Provider, ids: (string | number)[], platform: string) {
  const all = await listRemote(p);
  const want = new Set(ids.map(String));
  const now = Date.now();
  const stmts = all.filter((s) => want.has(String(s.service))).map((s) => env.DB.prepare(
    `INSERT INTO services (id, platform, category, category_slug, name, type_key, rate, min, max, step, refill, cancel, dripfeed, hash, present, enabled, provider_id, remote_id, first_seen_at, updated_at)
     VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,1,?10,?11,?12,?13,1,1,?14,?15,?16,?16)
     ON CONFLICT(id) DO UPDATE SET rate = excluded.rate, min = excluded.min, max = excluded.max, name = excluded.name, present = 1, updated_at = excluded.updated_at`,
  ).bind(localId(p.id, s.service), platform, s.category, s.category.toLowerCase().replace(/[^a-z0-9]+/g, "-"), s.name, (s.type || "default").toLowerCase().replace(/\s+/g, "_"),
    usdToMicro(Number(s.rate) / (p.usd_rate || 1)), Number(s.min) || 1, Number(s.max) || 1_000_000, s.refill ? 1 : 0, s.cancel ? 1 : 0, s.dripfeed ? 1 : 0,
    `${p.id}:${s.service}:${s.rate}`, p.id, String(s.service), now));
  for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
  if (stmts.length) {
    const settings = await getSettings(env, { fresh: true });
    await env.DB.batch([...rebuildSummaryStmts(env, settings), bumpCatalogStmt(env)]);
  }
  return stmts.length;
}


/** Refresh imported provider prices and capabilities. Called in small scheduled batches. */
export async function syncImportedProviderPrices(env: Env, now = Math.floor(Date.now() / 1000)): Promise<{ providers: number; services: number }> {
  const due = await env.DB.prepare(
    "SELECT * FROM providers WHERE enabled = 1 AND last_sync_at < ?1 ORDER BY last_sync_at ASC, id ASC LIMIT 2",
  ).bind(now - 6 * 3600).all<Provider & { last_sync_at: number }>();
  let changed = 0;
  for (const p of due.results) {
    const started=Date.now();
    try {
      const remote = await listRemote(p);
      const statements = remote.filter((item) => Number.isFinite(Number(item.rate)) && Number(item.rate) > 0).map((item) => env.DB.prepare(
        `UPDATE services SET rate=?1, min=?2, max=?3, refill=?4, cancel=?5, dripfeed=?6,
           present=1, updated_at=?7 WHERE provider_id=?8 AND remote_id=?9`,
      ).bind(
        usdToMicro(Number(item.rate) / (p.usd_rate || 1)),
        Math.max(1, Number(item.min) || 1), Math.max(1, Number(item.max) || 1_000_000),
        item.refill ? 1 : 0, item.cancel ? 1 : 0, item.dripfeed ? 1 : 0, now, p.id, String(item.service),
      ));
      for (let i = 0; i < statements.length; i += 50) await env.DB.batch(statements.slice(i, i + 50));
      const latency=Date.now()-started;
      await env.DB.batch([
        env.DB.prepare("UPDATE providers SET last_sync_at=?1 WHERE id=?2").bind(now,p.id),
        env.DB.prepare(`INSERT INTO provider_health(provider_id,last_check_at,last_success_at,last_error,consecutive_failures,latency_ms)
          VALUES(?1,?2,?2,'',0,?3) ON CONFLICT(provider_id) DO UPDATE SET last_check_at=excluded.last_check_at,last_success_at=excluded.last_success_at,last_error='',consecutive_failures=0,latency_ms=excluded.latency_ms`).bind(p.id,now,latency),
      ]);
      changed += statements.length;
    } catch (e) {
      const message=String((e as Error).message||"Provider sync failed").slice(0,300);
      console.warn(`provider price sync failed for ${p.id}`, message);
      const old=await env.DB.prepare("SELECT consecutive_failures FROM provider_health WHERE provider_id=?1").bind(p.id).first<{consecutive_failures:number}>();
      const failures=(old?.consecutive_failures??0)+1;
      await env.DB.batch([
        env.DB.prepare("UPDATE providers SET last_sync_at=?1 WHERE id=?2").bind(now-5*3600,p.id),
        env.DB.prepare(`INSERT INTO provider_health(provider_id,last_check_at,last_error,consecutive_failures,latency_ms)
          VALUES(?1,?2,?3,?4,?5) ON CONFLICT(provider_id) DO UPDATE SET last_check_at=excluded.last_check_at,last_error=excluded.last_error,consecutive_failures=excluded.consecutive_failures,latency_ms=excluded.latency_ms`).bind(p.id,now,message,failures,Date.now()-started),
      ]);
      if(failures>=3) await alertAdmins(env,"provider",`Provider <b>${p.name.replace(/[&<>]/g,"")}</b> has failed ${failures} consecutive catalogue sync checks. Last error: <code>${message.replace(/[&<>]/g,"")}</code>`);
    }
  }
  if (changed) {
    const settings = await getSettings(env, { fresh: true });
    await env.DB.batch([...rebuildSummaryStmts(env, settings), bumpCatalogStmt(env)]);
  }
  return { providers: due.results.length, services: changed };
}
