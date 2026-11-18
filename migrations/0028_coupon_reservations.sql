-- Coupon reservations prevent concurrent orders from overspending redemption limits.
ALTER TABLE coupon_redemptions ADD COLUMN status TEXT NOT NULL DEFAULT 'redeemed';
CREATE INDEX IF NOT EXISTS coupon_redemptions_status ON coupon_redemptions(coupon_id,status,user_id);

CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemption_order_once ON coupon_redemptions(order_id) WHERE order_id IS NOT NULL;
