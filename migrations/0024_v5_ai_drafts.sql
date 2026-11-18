ALTER TABLE ai_order_drafts ADD COLUMN fields TEXT NOT NULL DEFAULT '{}';
ALTER TABLE ai_order_drafts ADD COLUMN drip_minutes INTEGER;
ALTER TABLE ai_order_drafts ADD COLUMN order_id INTEGER;
