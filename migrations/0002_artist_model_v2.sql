-- ============================================================
-- Migration 0002: Artist Model V2
-- Enhanced metadata with roles, discography, and extensibility
-- ============================================================

-- Add new columns to artists table for enhanced metadata
ALTER TABLE artists ADD COLUMN roles TEXT DEFAULT '[]';
ALTER TABLE artists ADD COLUMN primary_role TEXT;
ALTER TABLE artists ADD COLUMN is_active INTEGER DEFAULT 1;
ALTER TABLE artists ADD COLUMN last_release_year INTEGER;
ALTER TABLE artists ADD COLUMN career_span TEXT;
ALTER TABLE artists ADD COLUMN discography_summary TEXT DEFAULT '{}';
ALTER TABLE artists ADD COLUMN social_links TEXT DEFAULT '{}';
ALTER TABLE artists ADD COLUMN touring_data TEXT DEFAULT '{}';
ALTER TABLE artists ADD COLUMN wikidata_id TEXT;

-- Create indexes for new queryable fields
CREATE INDEX IF NOT EXISTS idx_artists_active ON artists(is_active);
CREATE INDEX IF NOT EXISTS idx_artists_primary_role ON artists(primary_role);
CREATE INDEX IF NOT EXISTS idx_artists_last_release ON artists(last_release_year);

-- New lookup table for roles (replacing instruments)
CREATE TABLE IF NOT EXISTS roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  category TEXT,
  artist_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_roles_slug ON roles(slug);
CREATE INDEX IF NOT EXISTS idx_roles_category ON roles(category);
CREATE INDEX IF NOT EXISTS idx_roles_count ON roles(artist_count DESC);

-- Seed initial roles with categories
INSERT OR IGNORE INTO roles (name, slug, category) VALUES
  ('Singer', 'singer', 'performer'),
  ('Rapper', 'rapper', 'performer'),
  ('Vocalist', 'vocalist', 'performer'),
  ('Instrumentalist', 'instrumentalist', 'performer'),
  ('Multi-Instrumentalist', 'multi-instrumentalist', 'performer'),
  ('Bandleader', 'bandleader', 'performer'),
  ('DJ', 'dj', 'performer'),
  ('Band', 'band', 'group'),
  ('Orchestra', 'orchestra', 'group'),
  ('Ensemble', 'ensemble', 'group'),
  ('Producer', 'producer', 'creator'),
  ('Composer', 'composer', 'creator'),
  ('Songwriter', 'songwriter', 'creator'),
  ('Singer-Songwriter', 'singer-songwriter', 'creator'),
  ('Arranger', 'arranger', 'creator'),
  ('Beatmaker', 'beatmaker', 'creator'),
  ('Lyricist', 'lyricist', 'creator');
