import type { Env } from "./env";

export interface CouponQuote {
  couponId: number;
  code: string;
  discount: number;
  finalAmount: number;
}

const parseList = (raw: string | null | undefined): unknown[] => {
  try { const v = JSON.parse(raw || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}

/** Server-side coupon quote. The caller supplies a server-calculated subtotal, never a client price. */
export async function quoteCoupon(env: Env, userId: number, codeRaw: string, subtotal: number, serviceId: number, category: string): Promise<CouponQuote | {error:string;details?:Record<string,unknown>}> {
  const code = codeRaw.trim().toUpperCase();
  const now = Math.floor(Date.now()/1000);
  if (!code || !Number.isSafeInteger(subtotal) || subtotal < 0) return {error:"INVALID_COUPON"};
  const coupon = await env.DB.prepare("SELECT * FROM coupons WHERE code=?1 AND enabled=1").bind(code).first<any>();
  if (!coupon) return {error:"COUPON_INVALID"};
  if ((coupon.starts_at && Number(coupon.starts_at)>now) || (coupon.expires_at && Number(coupon.expires_at)<=now)) return {error:"COUPON_EXPIRED"};
  if (subtotal < Number(coupon.min_purchase||0)) return {error:"MINIMUM_NOT_MET",details:{minimum:Number(coupon.min_purchase)}};
  const users=parseList(coupon.customer_ids).map(Number); if(users.length&&!users.includes(userId))return {error:"COUPON_NOT_FOR_USER"};
  const services=parseList(coupon.service_ids).map(Number); if(services.length&&!services.includes(serviceId))return {error:"COUPON_NOT_FOR_SERVICE"};
  const cats=parseList(coupon.category_rules).map(String); if(cats.length&&!cats.includes(category))return {error:"COUPON_NOT_FOR_CATEGORY"};
  if(coupon.first_order_only){const exists=await env.DB.prepare("SELECT 1 FROM orders WHERE user_id=?1 AND status NOT IN ('failed','cancelled') LIMIT 1").bind(userId).first();if(exists)return {error:"FIRST_ORDER_ONLY"};}
  const counts=await env.DB.prepare("SELECT COUNT(*) total,SUM(CASE WHEN user_id=?2 THEN 1 ELSE 0 END) mine FROM coupon_redemptions WHERE coupon_id=?1").bind(coupon.id,userId).first<{total:number;mine:number|null}>();
  if(coupon.total_limit!==null&&(counts?.total??0)>=Number(coupon.total_limit))return {error:"COUPON_LIMIT_REACHED"};
  if((counts?.mine??0)>=Number(coupon.per_user_limit||1))return {error:"USER_LIMIT_REACHED"};
  const raw=coupon.kind==="percent"?Math.floor(subtotal*Number(coupon.value)/100):Math.min(subtotal,Number(coupon.value));
  const discount=coupon.max_discount===null?raw:Math.min(raw,Number(coupon.max_discount));
  return {couponId:Number(coupon.id),code,discount:Math.max(0,discount),finalAmount:Math.max(1,subtotal-Math.max(0,discount))};
}

/** Conditional reservation. Limits are rechecked in the INSERT to protect concurrent checkout attempts. */
export async function reserveCoupon(env: Env, quote: CouponQuote, userId: number): Promise<number|null> {
  const ts=Math.floor(Date.now()/1000);
  const r=await env.DB.prepare(`INSERT INTO coupon_redemptions(coupon_id,user_id,order_id,discount_amount,reward_amount,redeemed_at,status)
    SELECT ?1,?2,NULL,?3,0,?4,'reserved' WHERE EXISTS(
      SELECT 1 FROM coupons c WHERE c.id=?1 AND c.enabled=1 AND (c.starts_at IS NULL OR c.starts_at<=?4) AND (c.expires_at IS NULL OR c.expires_at>?4)
      AND (c.total_limit IS NULL OR (SELECT COUNT(*) FROM coupon_redemptions x WHERE x.coupon_id=c.id)<c.total_limit)
      AND (SELECT COUNT(*) FROM coupon_redemptions x WHERE x.coupon_id=c.id AND x.user_id=?2)<CASE WHEN c.first_order_only=1 THEN 1 ELSE c.per_user_limit END
      AND (c.first_order_only=0 OR NOT EXISTS(SELECT 1 FROM orders o WHERE o.user_id=?2 AND o.status NOT IN ('failed','cancelled')))
    )`).bind(quote.couponId,userId,quote.discount,ts).run();
  return r.meta.changes ? Number(r.meta.last_row_id) : null;
}

export async function settleCoupon(env: Env, reservationId: number, orderId: number): Promise<void> {
  await env.DB.prepare("UPDATE coupon_redemptions SET order_id=?2,status='redeemed' WHERE id=?1 AND status='reserved'").bind(reservationId,orderId).run();
}
export async function releaseCoupon(env: Env, reservationId: number): Promise<void> {
  await env.DB.prepare("DELETE FROM coupon_redemptions WHERE id=?1 AND status='reserved'").bind(reservationId).run();
}
