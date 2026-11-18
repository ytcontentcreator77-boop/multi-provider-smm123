ALTER TABLE free_service_claims ADD COLUMN claim_date TEXT NOT NULL DEFAULT '';
UPDATE free_service_claims SET claim_date=date(claimed_at,'unixepoch') WHERE claim_date='';
CREATE UNIQUE INDEX IF NOT EXISTS free_claim_user_day ON free_service_claims(campaign_id,user_id,claim_date);
CREATE INDEX IF NOT EXISTS free_claim_campaign_day ON free_service_claims(campaign_id,claim_date);
