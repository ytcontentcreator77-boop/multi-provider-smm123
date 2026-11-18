ALTER TABLE automation_jobs ADD COLUMN last_status TEXT NOT NULL DEFAULT 'never';
ALTER TABLE automation_jobs ADD COLUMN last_error TEXT;
ALTER TABLE automation_jobs ADD COLUMN run_count INTEGER NOT NULL DEFAULT 0;
