ALTER TABLE topup_requests ADD COLUMN gateway TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE topup_requests ADD COLUMN gateway_ref TEXT;
ALTER TABLE topup_requests ADD COLUMN gateway_external_ref TEXT;
ALTER TABLE topup_requests ADD COLUMN pay_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE topup_requests ADD COLUMN credit_amount INTEGER NOT NULL DEFAULT 0;
ALTER TABLE topup_requests ADD COLUMN paid_at INTEGER;
ALTER TABLE topup_requests ADD COLUMN failure_reason TEXT NOT NULL DEFAULT '';
ALTER TABLE topup_requests ADD COLUMN gateway_checked_at INTEGER NOT NULL DEFAULT 0;
CREATE UNIQUE INDEX topup_gateway_ref_unique ON topup_requests(gateway, gateway_ref) WHERE gateway_ref IS NOT NULL;
CREATE INDEX topup_gateway_pending ON topup_requests(gateway, status, created_at);
ALTER TABLE payment_methods ADD COLUMN gateway TEXT NOT NULL DEFAULT '';
UPDATE payment_methods SET kind='api', gateway='khalti' WHERE id='khalti';
UPDATE payment_methods SET kind='api', gateway='esewa' WHERE id='esewa';
UPDATE payment_methods SET kind='api', gateway='paytm' WHERE id IN ('paytm','upi');
UPDATE payment_methods SET name='UPI (via Paytm PG)', details='UPI is offered through your configured Paytm Payment Gateway account.', currency='INR' WHERE id='upi';
CREATE TABLE payment_gateway_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gateway TEXT NOT NULL,
  external_ref TEXT NOT NULL,
  request_id INTEGER NOT NULL,
  event_type TEXT NOT NULL,
  received_at INTEGER NOT NULL,
  UNIQUE(gateway, external_ref, event_type)
);
CREATE INDEX payment_gateway_events_request ON payment_gateway_events(request_id, received_at DESC);
CREATE TABLE provider_health (
  provider_id INTEGER PRIMARY KEY,
  last_check_at INTEGER NOT NULL DEFAULT 0,
  last_success_at INTEGER,
  last_error TEXT NOT NULL DEFAULT '',
  consecutive_failures INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER
);
