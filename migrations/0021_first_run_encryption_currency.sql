ALTER TABLE users ADD COLUMN preferred_currency TEXT NOT NULL DEFAULT 'USDT';
INSERT OR IGNORE INTO currencies (code, name, symbol, per_usd, enabled) VALUES ('USDT','Tether USD','₮',1,1);
UPDATE users SET preferred_currency='USDT' WHERE preferred_currency IS NULL OR preferred_currency='';
