-- Last updated: 2026-05-14
-- ============================================================================
-- 044: One-gallery-project-per-user limit for non-admins.
--
-- Two visibility flags exist on `projects`:
--   • published   — share-link is live (private link, can be sent to anyone)
--   • in_gallery  — listed in the public /gallery for discovery
--
-- This trigger limits NON-ADMIN users to a single in_gallery=true project.
-- Sharing private links via `published` is NOT limited — only the public
-- gallery slot is.
--
-- Admins / super_admins (rows in user_roles) are exempt. Re-toggling an
-- already-in-gallery row, or any update that doesn't touch `in_gallery`,
-- is a no-op for this trigger. Pre-existing legacy users with multiple
-- gallery rows keep their existing state; the trigger only intercepts
-- new writes.
--
-- Runs SECURITY DEFINER so it can read user_roles regardless of caller RLS.
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_gallery_limit()
RETURNS TRIGGER AS $$
DECLARE
  is_admin BOOLEAN;
  other_count INTEGER;
BEGIN
  -- Re-toggling an already-in-gallery row is a no-op.
  IF TG_OP = 'UPDATE' AND OLD.in_gallery IS TRUE THEN
    RETURN NEW;
  END IF;

  -- Admin / super_admin bypass.
  SELECT EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = NEW.user_id
      AND role IN ('admin', 'super_admin')
  ) INTO is_admin;

  IF is_admin THEN
    RETURN NEW;
  END IF;

  -- Count this user's other currently-in-gallery projects.
  SELECT COUNT(*) INTO other_count
  FROM projects
  WHERE user_id = NEW.user_id
    AND in_gallery IS TRUE
    AND id IS DISTINCT FROM NEW.id;

  IF other_count >= 1 THEN
    -- Sentinel string the client maps to a friendly toast.
    RAISE EXCEPTION 'GALLERY_LIMIT_REACHED'
      USING HINT = 'Non-admin users may have at most one project listed in the gallery. Remove the existing one first.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS projects_enforce_gallery_limit ON projects;
CREATE TRIGGER projects_enforce_gallery_limit
  BEFORE INSERT OR UPDATE OF in_gallery ON projects
  FOR EACH ROW
  WHEN (NEW.in_gallery IS TRUE)
  EXECUTE FUNCTION enforce_gallery_limit();
