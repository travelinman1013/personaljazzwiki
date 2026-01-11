-- ============================================================
-- Migration 0003: Origin, Birth Place, and Research Sources
-- Adds dedicated columns for location data and Perplexity sources
-- ============================================================

-- Origin for bands (e.g., "Austin, Texas, United States")
ALTER TABLE artists ADD COLUMN origin TEXT;

-- Birth place for individuals (e.g., "Alton, Illinois, United States")
ALTER TABLE artists ADD COLUMN birth_place TEXT;

-- Research sources from Perplexity (JSON array of URLs)
ALTER TABLE artists ADD COLUMN research_sources TEXT DEFAULT '[]';

-- Index for origin-based queries (browse by city/region)
CREATE INDEX IF NOT EXISTS idx_artists_origin ON artists(origin);
