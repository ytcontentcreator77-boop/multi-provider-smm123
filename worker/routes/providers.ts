import { Hono } from "hono";
import { isOwner } from "../env";
import { getProvider, importServices, listRemote, smm, type Provider } from "../providers";
import { usdToMicro } from "../notpanel";
import { gatewayReady } from "../gateways";
import { type AppEnv, err } from "./app";

export const providers = new Hono<AppEnv>();
providers.use("*", async (c, next) => (isOwner(c.env, c.get("settings"), c.get("user").id) ? next() : err(c, 403, "FORBIDDEN")));

const mask = (p: Provider) => ({ ...p, api_key: p.api_key.slice(0, 4) + "••••" });

providers.get("/providers", async (c) => c.json({ items: (await c.env.DB.prepare("SELECT * FROM providers ORDER BY id").all<Provider>()).results.map(mask) }));

providers.post("/providers", async (c) => {
  const b = await c.req.json<{ name: string; api_url: string; api_key: string; usd_rate?: number }>().catch(() => null);
  if (!b?.name || !b.api_url || !b.api_key) return err(c, 400, "BAD_REQUEST");
  try { await smm({ api_url: b.api_url, api_key: b.api_key }, "balance"); } catch (e) { return err(c, 400, "PROVIDER_REJECTED"); }
  const r = await c.env.DB.prepare("INSERT INTO providers (name, api_url, api_key, usd_rate, created_at) VALUES (?1,?2,?3,?4,?5)").bind(b.name.slice(0, 60), b.api_url, b.api_key, b.usd_rate || 1, Date.now()).run();
  return c.json({ ok: true, id: r.meta.last_row_id });
});


providers.put("/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const current = await getProvider(c.env, id);
  if (!current) return err(c, 404, "NOT_FOUND");
  const b = await c.req.json<{ name?: string; api_url?: string; api_key?: string; usd_rate?: number; enabled?: boolean }>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  const next = { ...current, ...b };
  const credentialsChanged = (b.api_url !== undefined && b.api_url !== current.api_url) || (b.api_key !== undefined && b.api_key !== current.api_key);
  if (credentialsChanged) {
    const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE provider_id = ?1 AND status IN ('submitting','pending','processing','in_progress')").bind(id).first<{n:number}>();
    if ((active?.n ?? 0) > 0) return err(c, 409, "PROVIDER_HAS_OPEN_ORDERS", { count: active?.n });
    try { await smm({ api_url: next.api_url, api_key: next.api_key }, "balance"); }
    catch { return err(c, 400, "PROVIDER_REJECTED"); }
  }
  if (b.usd_rate !== undefined && (!Number.isFinite(b.usd_rate) || b.usd_rate <= 0)) return err(c, 400, "BAD_REQUEST");
  await c.env.DB.prepare("UPDATE providers SET name=?1,api_url=?2,api_key=?3,usd_rate=?4,enabled=?5 WHERE id=?6")
    .bind((next.name || current.name).slice(0,60), next.api_url || current.api_url, next.api_key || current.api_key, next.usd_rate || current.usd_rate, b.enabled === undefined ? current.enabled : +b.enabled, id).run();
  return c.json({ ok: true });
});

providers.delete("/providers/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const active = await c.env.DB.prepare("SELECT COUNT(*) AS n FROM orders WHERE provider_id = ?1 AND status IN ('submitting','pending','processing','in_progress')").bind(id).first<{n:number}>();
  if ((active?.n ?? 0) > 0) return err(c, 409, "PROVIDER_HAS_OPEN_ORDERS", { count: active?.n });
  await c.env.DB.prepare("UPDATE services SET enabled = 0 WHERE provider_id = ?1").bind(id).run();
  await c.env.DB.prepare("DELETE FROM providers WHERE id = ?1").bind(id).run();
  return c.json({ ok: true });
});

/** Categories (with counts and cheapest rate) of one provider, to pick from before importing. */
providers.get("/providers/:id/catalog", async (c) => {
  const p = await getProvider(c.env, Number(c.req.param("id")));
  if (!p) return err(c, 404, "NOT_FOUND");
  const q = (c.req.query("category") ?? "").toLowerCase();
  const all = await listRemote(p);
  const cats = new Map<string, number>();
  for (const s of all) cats.set(s.category, (cats.get(s.category) ?? 0) + 1);
  const services = q ? all.filter((s) => s.category.toLowerCase() === q).slice(0, 500) : [];
  return c.json({ categories: [...cats].map(([name, count]) => ({ name, count })), services });
});

providers.post("/providers/:id/import", async (c) => {
  const p = await getProvider(c.env, Number(c.req.param("id")));
  const b = await c.req.json<{ ids: (string | number)[]; platform: string }>().catch(() => null);
  if (!p || !p.enabled || !b?.ids?.length) return err(c, 400, "BAD_REQUEST");
  return c.json({ ok: true, imported: await importServices(c.env, p, b.ids.slice(0, 500), b.platform || "other") });
});

providers.put("/icons/service/:id", async (c) => {
  const b = await c.req.json<{ icon: string }>().catch(() => null);
  await c.env.DB.prepare("UPDATE services SET icon = ?1 WHERE id = ?2").bind((b?.icon ?? "").slice(0, 300), Number(c.req.param("id"))).run();
  return c.json({ ok: true });
});

providers.put("/icons/category", async (c) => {
  const b = await c.req.json<{ platform: string; category: string; icon: string }>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  await c.env.DB.prepare("INSERT INTO category_icons (platform, category, icon) VALUES (?1,?2,?3) ON CONFLICT DO UPDATE SET icon = excluded.icon").bind(b.platform, b.category, b.icon.slice(0, 300)).run();
  return c.json({ ok: true });
});

providers.get("/currencies", async (c) => c.json({ items: (await c.env.DB.prepare("SELECT * FROM currencies ORDER BY code").all()).results }));
providers.put("/currencies/:code", async (c) => {
  const b = await c.req.json<{ per_usd?: number; enabled?: boolean }>().catch(() => null);
  if (!b || (b.per_usd!==undefined && (!Number.isFinite(Number(b.per_usd)) || Number(b.per_usd)<=0))) return err(c, 400, "BAD_REQUEST");
  await c.env.DB.prepare("UPDATE currencies SET per_usd = COALESCE(?1, per_usd), enabled = COALESCE(?2, enabled) WHERE code = ?3").bind(b.per_usd ?? null, b.enabled === undefined ? null : +b.enabled, c.req.param("code")).run();
  return c.json({ ok: true });
});

providers.get("/payment-methods", async (c) => {
  const rows=(await c.env.DB.prepare("SELECT id,name,kind,currency,details,min_amount,fee_pct,icon,enabled,sort,gateway FROM payment_methods ORDER BY sort").all<any>()).results;
  return c.json({items:rows.map((m:any)=>({...m,gateway_ready:m.kind!=="api"?true:gatewayReady(c.env,m.gateway)}))});
});
providers.put("/payment-methods/:id", async (c) => {
  const b = await c.req.json<Record<string, any>>().catch(() => null);
  if (!b) return err(c, 400, "BAD_REQUEST");
  const current=await c.env.DB.prepare("SELECT kind,gateway FROM payment_methods WHERE id=?1").bind(c.req.param("id")).first<{kind:string;gateway:string}>();
  if(!current) return err(c,404,"NOT_FOUND");
  const enabled=b.enabled===undefined?undefined:!!b.enabled;
  if(enabled && current.kind==="api" && !gatewayReady(c.env,current.gateway as "khalti"|"esewa"|"paytm")) return err(c,409,"GATEWAY_NOT_CONFIGURED");
  if(b.min_amount!==undefined&&(!Number.isFinite(Number(b.min_amount))||Number(b.min_amount)<0)) return err(c,400,"BAD_REQUEST");
  if(b.fee_pct!==undefined&&(!Number.isFinite(Number(b.fee_pct))||Number(b.fee_pct)<0||Number(b.fee_pct)>100)) return err(c,400,"BAD_REQUEST");
  await c.env.DB.prepare("UPDATE payment_methods SET name=COALESCE(?1,name), details=COALESCE(?2,details), currency=COALESCE(?3,currency), min_amount=COALESCE(?4,min_amount), fee_pct=COALESCE(?5,fee_pct), icon=COALESCE(?6,icon), enabled=COALESCE(?7,enabled) WHERE id=?8")
    .bind(b.name ?? null, b.details ?? null, b.currency ?? null, b.min_amount ?? null, b.fee_pct ?? null, b.icon ?? null, enabled === undefined ? null : +enabled, c.req.param("id")).run();
  return c.json({ ok: true });
});


// Manual top-up review queue. Balance is credited only after an owner approves a pending request.
providers.get("/topup-requests", async (c) => {
  const requested=c.req.query("status")??"pending";
  const status = ["pending","approved","rejected","paid","failed"].includes(requested) ? requested : "pending";
  const rows = await c.env.DB.prepare(
    `SELECT r.*, u.first_name, u.username, m.name AS method_name
     FROM topup_requests r JOIN users u ON u.id=r.user_id LEFT JOIN payment_methods m ON m.id=r.method_id
     WHERE r.status=?1 ORDER BY r.id DESC LIMIT 100`,
  ).bind(status).all();
  return c.json({ items: rows.results });
});

providers.post("/topup-requests/:id/approve", async (c) => {
  const id = Number(c.req.param("id"));
  if (!Number.isSafeInteger(id) || id < 1) return err(c, 400, "BAD_REQUEST");
  const row = await c.env.DB.prepare(
    `SELECT r.*, c.per_usd FROM topup_requests r JOIN currencies c ON c.code=r.currency WHERE r.id=?1 AND r.status='pending' AND r.gateway='manual'`,
  ).bind(id).first<{id:number;user_id:number;amount:number;currency:string;per_usd:number}>();
  if (!row || !Number.isFinite(row.per_usd) || row.per_usd <= 0) return err(c, 404, "NOT_FOUND");
  const now = Math.floor(Date.now()/1000);
  const credit = usdToMicro(row.amount / row.per_usd);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE topup_requests SET status='approved',reviewed_at=?1,reviewed_by=?2 WHERE id=?3 AND status='pending'").bind(now,c.get("user").id,id),
    c.env.DB.prepare("UPDATE users SET balance=balance+?1 WHERE id=(SELECT user_id FROM topup_requests WHERE id=?2 AND status='approved' AND reviewed_at=?3) AND changes()=1").bind(credit,id,now),
    c.env.DB.prepare("INSERT INTO ledger(user_id,delta,kind,ref,note,created_at) SELECT user_id,?1,'topup_manual',id,?2,?3 FROM topup_requests WHERE id=?4 AND status='approved' AND reviewed_at=?3 AND changes()=1").bind(credit,`Manual top-up ${row.amount} ${row.currency}`,now,id),
  ]);
  const check = await c.env.DB.prepare("SELECT status,reviewed_at FROM topup_requests WHERE id=?1").bind(id).first<{status:string;reviewed_at:number}>();
  return c.json({ ok: true, status: check?.status });
});

providers.post("/topup-requests/:id/reject", async (c) => {
  const id = Number(c.req.param("id"));
  const b = await c.req.json<{ note?: string }>().catch(() => ({} as {note?:string}));
  const r = await c.env.DB.prepare("UPDATE topup_requests SET status='rejected',reviewed_at=?1,reviewed_by=?2,admin_note=?3 WHERE id=?4 AND status='pending' AND gateway='manual'")
    .bind(Math.floor(Date.now()/1000),c.get("user").id,String(b?.note ?? "").slice(0,300),id).run();
  if (!r.meta.changes) return err(c, 404, "NOT_FOUND");
  return c.json({ ok: true });
});


providers.get("/provider-health", async (c)=>{
  const rows=await c.env.DB.prepare(`SELECT p.id,p.name,p.enabled,h.last_check_at,h.last_success_at,h.last_error,h.consecutive_failures,h.latency_ms
    FROM providers p LEFT JOIN provider_health h ON h.provider_id=p.id ORDER BY p.name`).all();
  return c.json({items:rows.results});
});
