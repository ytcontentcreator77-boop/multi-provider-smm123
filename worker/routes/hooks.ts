import { Hono } from "hono";
import { notpanelSignature, timingSafeEqual } from "../auth";
import type { Env } from "../env";
import type { NpStatus } from "../notpanel";
import { applyStatus, type OrderRow } from "../orders";
import { getSettings } from "../settings";
import { alertAdmins } from "../alerts";
import { markGatewayFailed, verifyGatewayReturn } from "../gateways";

export const hooks = new Hono<{ Bindings: Env }>();

/** Deletes webhook de-duplication rows older than 7 days. Called hourly from the cron job (not per request). */
export async function cleanupWebhookEvents(env: Env): Promise<void> {
  const cutoff = Math.floor(Date.now() / 1000) - 7 * 86400;
  await env.DB.prepare("DELETE FROM webhook_events WHERE received_at < ?1").bind(cutoff).run();
}

/** NotPanel order events. Signed with the secret we got from webhook.add; delivered at least once. */
hooks.post("/notpanel", async (c) => {
  const body = await c.req.text();
  const ts = c.req.header("x-webhook-timestamp") ?? "";
  const sig = (c.req.header("x-webhook-signature") ?? "").replace(/^sha256=/, "");
  const s = await getSettings(c.env);
  if (!s.np_webhook_secret || !ts || !sig) return c.text("forbidden", 403);
  const expected = await notpanelSignature(s.np_webhook_secret, ts, body);
  if (!timingSafeEqual(expected, sig)) return c.text("forbidden", 403);
  if (!(Math.abs(Date.now() / 1000 - Number(ts)) <= 3600)) return c.text("stale", 400);

  let evt: { id: string; type: string; data?: { order?: NpStatus & { order: number }; refill?: { refill: number; order: number; status_key: string } } };
  try {
    evt = JSON.parse(body);
  } catch {
    return c.text("bad request", 400);
  }
  if (!evt || typeof evt !== "object" || typeof evt.id !== "string" || !evt.id) return c.text("bad request", 400);
  const now = Math.floor(Date.now() / 1000);
  const fresh = await c.env.DB.prepare("INSERT INTO webhook_events (id, received_at) VALUES (?1, ?2) ON CONFLICT DO NOTHING")
    .bind(evt.id, now)
    .run();
  if (!fresh.meta.changes) return c.text("duplicate");

  const work = async () => {
    if (evt.data?.order?.order) {
      const o = await c.env.DB.prepare("SELECT * FROM orders WHERE np_order_id = ?1 AND provider_id = 0").bind(evt.data.order.order).first<OrderRow>();
      if (o) await applyStatus(c.env, o, evt.data.order);
    }
    if (evt.data?.refill?.refill) {
      const st = evt.data.refill.status_key === "completed" || evt.data.refill.status_key === "rejected" ? evt.data.refill.status_key : "pending";
      await c.env.DB.prepare("UPDATE orders SET refill_status = ?2 WHERE refill_id = ?1").bind(evt.data.refill.refill, st).run();
    }
  };
  c.executionCtx.waitUntil(work().catch((e) => console.error("webhook failed", e)));
  return c.text("ok");
});


const paymentReturn = async (c:any, gateway:"khalti"|"esewa"|"paytm") => {
  const id=Number(c.req.query("requestId"));
  if(!Number.isSafeInteger(id)||id<1) return c.text("Invalid payment reference",400);
  try{
    const result=await verifyGatewayReturn(c.env,gateway,id,c.req.raw);
    if(!result.ok && ["BAD_SIGNATURE","AMOUNT_MISMATCH","REFERENCE_MISMATCH","AMOUNT_OR_REFERENCE_MISMATCH"].includes(String(result.reason))) {
      await alertAdmins(c.env,"payment",`Payment gateway <b>${gateway}</b> returned an invalid signature, amount or reference for top-up #${id}. No wallet credit was made.`);
    }
    const target=new URL("/#/wallet",new URL(c.req.url).origin);
    target.hash=`/wallet?topup=${result.ok?"success":"pending"}&requestId=${id}`;
    return c.redirect(target.toString(),303);
  }catch(e){
    console.error("payment return verification failed",gateway,id,(e as Error).message);
    await alertAdmins(c.env,"payment",`Payment gateway <b>${gateway}</b> verification failed for top-up #${id}. Check merchant credentials and gateway status.`);
    const target=new URL("/#/wallet",new URL(c.req.url).origin);
    target.hash=`/wallet?topup=pending&requestId=${id}`;
    return c.redirect(target.toString(),303);
  }
};

// These routes are intentionally unauthenticated: every success is confirmed by a server-to-server lookup
// against the merchant account before a wallet credit is written.
hooks.get("/payments/khalti/return", (c)=>paymentReturn(c,"khalti"));
hooks.get("/payments/esewa/success", (c)=>paymentReturn(c,"esewa"));
hooks.get("/payments/esewa/failure", async (c)=>{
  const id=Number(c.req.query("requestId"));
  if(Number.isSafeInteger(id)&&id>0) await markGatewayFailed(c.env,id,"esewa");
  const target=new URL("/",new URL(c.req.url).origin); target.hash="/wallet?topup=failed";
  return c.redirect(target.toString(),303);
});
hooks.on(["GET","POST"],"/payments/paytm/return", (c)=>paymentReturn(c,"paytm"));
