ALTER TABLE providers ADD COLUMN last_sync_at INTEGER NOT NULL DEFAULT 0;
CREATE TABLE topup_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  method_id TEXT NOT NULL,
  currency TEXT NOT NULL,
  amount REAL NOT NULL,
  reference TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL,
  reviewed_at INTEGER,
  reviewed_by INTEGER,
  admin_note TEXT NOT NULL DEFAULT ''
);
CREATE INDEX topup_requests_status ON topup_requests(status, id DESC);
CREATE INDEX topup_requests_user ON topup_requests(user_id, id DESC);
