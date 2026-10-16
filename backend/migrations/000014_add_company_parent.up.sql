-- A company with parent_id = NULL is a group (or a standalone company); its
-- children are branches. Selecting a group scopes reads to the group and all
-- of its branches.
ALTER TABLE companies ADD COLUMN parent_id BIGINT REFERENCES companies(id);
CREATE INDEX idx_companies_parent_id ON companies(parent_id);
