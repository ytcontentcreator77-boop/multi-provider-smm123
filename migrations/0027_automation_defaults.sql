INSERT OR IGNORE INTO automation_jobs(job_key,enabled,config,updated_at) VALUES
('catalog_sync',1,'{}',unixepoch()),
('provider_price_sync',1,'{}',unixepoch()),
('payment_reconcile',1,'{}',unixepoch()),
('order_status_sync',1,'{}',unixepoch()),
('referral_retry',1,'{}',unixepoch()),
('broadcast_delivery',1,'{}',unixepoch()),
('housekeeping',1,'{}',unixepoch()),
('bot_commands',1,'{}',unixepoch());
