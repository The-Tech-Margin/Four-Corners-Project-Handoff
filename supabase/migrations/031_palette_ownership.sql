-- Last updated: 2026-04-10
-- 031_palette_ownership.sql
-- Add ownership tracking to persona_palettes.
-- Admins can CRUD only their own palettes; super_admins retain full access.

ALTER TABLE persona_palettes
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Backfill existing palettes to the first super_admin (if any)
UPDATE persona_palettes
SET created_by = (
  SELECT user_id FROM user_roles
  WHERE role = 'super_admin'
  ORDER BY created_at ASC
  LIMIT 1
)
WHERE created_by IS NULL;

CREATE INDEX IF NOT EXISTS idx_persona_palettes_created_by
  ON persona_palettes(created_by);
