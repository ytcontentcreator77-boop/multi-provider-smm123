-- V5 workflow integrity helpers. Additive-only migration.
CREATE TABLE IF NOT EXISTS membership_overrides (
 user_id INTEGER PRIMARY KEY, level_id INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '', expires_at INTEGER, actor_id INTEGER NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS loyalty_checkins (
 user_id INTEGER NOT NULL, checkin_date TEXT NOT NULL, points INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,checkin_date)
);
CREATE TABLE IF NOT EXISTS loyalty_settings (
 id INTEGER PRIMARY KEY CHECK(id=1), enabled INTEGER NOT NULL DEFAULT 0, daily_points INTEGER NOT NULL DEFAULT 0, purchase_points_per_usd INTEGER NOT NULL DEFAULT 0, redemption_rate INTEGER NOT NULL DEFAULT 0, min_redeem INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL
);
INSERT OR IGNORE INTO loyalty_settings(id,updated_at) VALUES(1,unixepoch());
CREATE TABLE IF NOT EXISTS user_notes (
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, actor_id INTEGER NOT NULL, note TEXT NOT NULL, created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS user_tags (
 user_id INTEGER NOT NULL, tag TEXT NOT NULL, actor_id INTEGER NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY(user_id,tag)
);
CREATE UNIQUE INDEX IF NOT EXISTS promotion_reward_once ON promotion_rewards(promotion_id,user_id);
CREATE UNIQUE INDEX IF NOT EXISTS cashback_order_once ON cashback_transactions(order_id) WHERE order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS audit_logs_recent ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS promotion_participants_review ON promotion_participants(status,joined_at);
