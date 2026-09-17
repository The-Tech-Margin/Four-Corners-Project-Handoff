-- Last updated: 2026-01-19
-- ============================================================================
-- Refactor to JSONB-based schema (leverages field-registry.ts)
-- ============================================================================

-- Drop old projects table
DROP TABLE IF EXISTS projects CASCADE;

-- Create new projects table with JSONB metadata
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Searchable/indexable fields (extracted for performance)
  slug TEXT UNIQUE,
  title TEXT GENERATED ALWAYS AS (metadata->>'title') STORED,
  author TEXT GENERATED ALWAYS AS (metadata->'backStory'->>'author') STORED,
  date TEXT GENERATED ALWAYS AS (metadata->'backStory'->>'date') STORED,
  
  -- Main metadata as JSONB (validated against field-registry schema)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Main image reference
  main_image_url TEXT,
  main_image_storage_path TEXT,
  
  -- Publishing and metadata
  published BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate context_items (unchanged)
CREATE TABLE context_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  source_type TEXT NOT NULL CHECK (source_type IN ('upload', 'url')),
  filename TEXT,
  mime_type TEXT,
  caption TEXT,
  media_type TEXT CHECK (media_type IN ('image', 'video')),
  
  storage_path TEXT,
  thumbnail_storage_path TEXT,
  url TEXT,
  
  position INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate links (unchanged)
CREATE TABLE links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source TEXT,
  
  position INTEGER DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate voice_transcriptions (unchanged)
CREATE TABLE voice_transcriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  recording_id TEXT NOT NULL,
  text TEXT NOT NULL,
  transcribed_at TIMESTAMPTZ DEFAULT NOW(),
  
  audio_storage_path TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Recreate consent_documents (unchanged)
CREATE TABLE consent_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES (optimized for JSONB)
-- ============================================================================

CREATE INDEX idx_projects_user_id ON projects(user_id);
CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_published ON projects(published);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);

-- GIN index for JSONB queries
CREATE INDEX idx_projects_metadata ON projects USING GIN (metadata);

-- Indexes on generated columns for common queries
CREATE INDEX idx_projects_author ON projects(author);
CREATE INDEX idx_projects_date ON projects(date DESC);

-- JSONB path indexes for specific queries
CREATE INDEX idx_projects_backstory_text ON projects USING GIN ((metadata->'backStory'->'text'));
CREATE INDEX idx_projects_location ON projects USING GIN ((metadata->'location'));

CREATE INDEX idx_context_items_project_id ON context_items(project_id);
CREATE INDEX idx_context_items_position ON context_items(project_id, position);

CREATE INDEX idx_links_project_id ON links(project_id);
CREATE INDEX idx_links_position ON links(project_id, position);

CREATE INDEX idx_voice_transcriptions_project_id ON voice_transcriptions(project_id);
CREATE INDEX idx_consent_documents_project_id ON consent_documents(project_id);

-- ============================================================================
-- VALIDATION FUNCTION (validates against field-registry schema)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_project_metadata()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure required root fields exist
  IF NOT (NEW.metadata ? 'backStory') THEN
    RAISE EXCEPTION 'metadata must contain backStory field';
  END IF;
  
  IF NOT (NEW.metadata ? 'creativeCommons') THEN
    RAISE EXCEPTION 'metadata must contain creativeCommons field';
  END IF;
  
  IF NOT (NEW.metadata ? 'meta') THEN
    RAISE EXCEPTION 'metadata must contain meta field';
  END IF;
  
  -- Ensure arrays are arrays
  IF NEW.metadata ? 'context' AND jsonb_typeof(NEW.metadata->'context') != 'array' THEN
    RAISE EXCEPTION 'metadata.context must be an array';
  END IF;
  
  IF NEW.metadata ? 'links' AND jsonb_typeof(NEW.metadata->'links') != 'array' THEN
    RAISE EXCEPTION 'metadata.links must be an array';
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validate_metadata_before_insert_or_update
  BEFORE INSERT OR UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION validate_project_metadata();

-- ============================================================================
-- UPDATE TRIGGER
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_context_items_updated_at
  BEFORE UPDATE ON context_items
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE context_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE links ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_transcriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_documents ENABLE ROW LEVEL SECURITY;

-- Projects policies
CREATE POLICY "Users can view own projects"
  ON projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Anyone can view published projects"
  ON projects FOR SELECT
  USING (published = true);

CREATE POLICY "Users can insert own projects"
  ON projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON projects FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON projects FOR DELETE
  USING (auth.uid() = user_id);

-- Context items policies
CREATE POLICY "Users can view context items of own projects"
  ON context_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = context_items.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view context items of published projects"
  ON context_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = context_items.project_id
      AND projects.published = true
    )
  );

CREATE POLICY "Users can insert context items to own projects"
  ON context_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = context_items.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update context items of own projects"
  ON context_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = context_items.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete context items of own projects"
  ON context_items FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = context_items.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Links policies
CREATE POLICY "Users can view links of own projects"
  ON links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = links.project_id
      AND projects.user_id = auth.uid()
    )
  );

CREATE POLICY "Anyone can view links of published projects"
  ON links FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = links.project_id
      AND projects.published = true
    )
  );

CREATE POLICY "Users can manage links of own projects"
  ON links FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = links.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Voice transcriptions policies
CREATE POLICY "Users can manage voice transcriptions of own projects"
  ON voice_transcriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = voice_transcriptions.project_id
      AND projects.user_id = auth.uid()
    )
  );

-- Consent documents policies
CREATE POLICY "Users can manage consent documents of own projects"
  ON consent_documents FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.id = consent_documents.project_id
      AND projects.user_id = auth.uid()
    )
  );
