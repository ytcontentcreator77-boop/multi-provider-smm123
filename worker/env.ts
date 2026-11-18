import type { Settings } from "./settings";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  /** Request-local decrypted Telegram bot token, hydrated from encrypted D1 settings before routes run. */
  BOT_TOKEN: string;
  /** AES-GCM key used to encrypt the bot token entered in the first-run setup wizard. */
  APP_ENCRYPTION_KEY?: string;
  /** NotPanel API key. Optional: it can also be pasted in the setup page / admin panel (saved in settings). */
  NOTPANEL_API_KEY?: string;
  /** Overrides the webhook secret derived from BOT_TOKEN (keeps an already registered webhook working). */
  TG_WEBHOOK_SECRET?: string;
  /** Secret path segment for the legacy /setup/<secret> routes. Unset/empty = all /setup routes return 404. */
  SETUP_SECRET?: string;
  /** Optional comma-separated Telegram user IDs that are always admins (more can be claimed or added in the app). */
  OWNER_IDS?: string;
  /** Local development only: skip Telegram auth and act as this user id */
  DEV_FAKE_USER_ID?: string;
  /** Local development guard used by worker/orders.ts: allows placing real NotPanel orders */
  ALLOW_LIVE_ORDERS?: string;
  /** Payment gateway secrets are environment secrets only; never store merchant keys in D1 or expose them to the Mini App. */
  KHALTI_SECRET_KEY?: string;
  KHALTI_BASE_URL?: string;
  ESEWA_PRODUCT_CODE?: string;
  ESEWA_SECRET_KEY?: string;
  ESEWA_ENV?: string;
  PAYTM_MID?: string;
  PAYTM_MERCHANT_KEY?: string;
  PAYTM_WEBSITE?: string;
  PAYTM_ENV?: string;
  PAYTM_BASE_URL?: string;
}

/** "1, 2,x,3" → [1, 2, 3] (positive safe integers only) */
export function parseIds(v: string | undefined | null): number[] {
  const out: number[] = [];
  for (const part of (v ?? "").split(",")) {
    const n = Number(part.trim());
    if (part.trim() && Number.isSafeInteger(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out;
}

/** Admins fixed by the OWNER_IDS environment variable (read-only in the app) */
export const envOwners = (env: Env): number[] => parseIds(env.OWNER_IDS);
/** Admins claimed or added in the app (settings.owner_ids) */
export const addedOwners = (s: Pick<Settings, "owner_ids">): number[] => parseIds(s.owner_ids);
/** Everyone who can open the Admin panel */
export const ownerIds = (env: Env, s: Pick<Settings, "owner_ids">): number[] => [...new Set([...envOwners(env), ...addedOwners(s)])];

export function isOwner(env: Env, s: Pick<Settings, "owner_ids">, userId: number): boolean {
  return ownerIds(env, s).includes(userId);
}
