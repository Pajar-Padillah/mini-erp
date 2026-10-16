DROP INDEX IF EXISTS idx_companies_parent_id;
ALTER TABLE companies DROP COLUMN IF EXISTS parent_id;
