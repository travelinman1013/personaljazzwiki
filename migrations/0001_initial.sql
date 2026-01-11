-- ============================================================
-- MAIN ARTISTS TABLE (Heavy data - full content)
-- ============================================================
CREATE TABLE IF NOT EXISTS artists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  artist_type TEXT,
  birth_date TEXT,
  death_date TEXT,

  -- Heavy content fields
  bio_html TEXT,
  bio_markdown TEXT,

  -- Image reference (stored in R2, this is just the filename)
  image_filename TEXT,

  -- JSON blob fields (flexible metadata)
  genres TEXT DEFAULT '[]',           -- JSON array
  instruments TEXT DEFAULT '[]',      -- JSON array
  spotify_data TEXT DEFAULT '{}',     -- JSON object
  audio_profile TEXT DEFAULT '{}',    -- JSON object
  external_urls TEXT DEFAULT '{}',    -- JSON object
  musical_connections TEXT DEFAULT '{}', -- JSON object

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index for fast slug lookups
CREATE INDEX IF NOT EXISTS idx_artists_slug ON artists(slug);

-- Index for alphabetical browsing
CREATE INDEX IF NOT EXISTS idx_artists_title ON artists(title COLLATE NOCASE);

-- Index for filtering by type
CREATE INDEX IF NOT EXISTS idx_artists_type ON artists(artist_type);


-- ============================================================
-- SEARCH INDEX TABLE (Lightweight - for FTS5 queries only)
-- ============================================================
-- This table stores only the data needed for search, keeping FTS fast
CREATE TABLE IF NOT EXISTS search_index (
  id INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  bio_text TEXT,  -- Plain text, no HTML (for better search relevance)
  genres_text TEXT,  -- Flattened genre list for searching
  instruments_text TEXT,  -- Flattened instruments for searching
  FOREIGN KEY (id) REFERENCES artists(id) ON DELETE CASCADE
);

-- FTS5 virtual table for full-text search
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title,
  bio_text,
  genres_text,
  instruments_text,
  content=search_index,
  content_rowid=id,
  tokenize='porter unicode61'  -- Better search with stemming
);

-- Triggers to keep FTS in sync with search_index
CREATE TRIGGER IF NOT EXISTS search_index_ai AFTER INSERT ON search_index BEGIN
  INSERT INTO search_fts(rowid, title, bio_text, genres_text, instruments_text)
  VALUES (new.id, new.title, new.bio_text, new.genres_text, new.instruments_text);
END;

CREATE TRIGGER IF NOT EXISTS search_index_ad AFTER DELETE ON search_index BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, bio_text, genres_text, instruments_text)
  VALUES ('delete', old.id, old.title, old.bio_text, old.genres_text, old.instruments_text);
END;

CREATE TRIGGER IF NOT EXISTS search_index_au AFTER UPDATE ON search_index BEGIN
  INSERT INTO search_fts(search_fts, rowid, title, bio_text, genres_text, instruments_text)
  VALUES ('delete', old.id, old.title, old.bio_text, old.genres_text, old.instruments_text);
  INSERT INTO search_fts(rowid, title, bio_text, genres_text, instruments_text)
  VALUES (new.id, new.title, new.bio_text, new.genres_text, new.instruments_text);
END;


-- ============================================================
-- LOOKUP TABLES (For browse pages)
-- ============================================================
CREATE TABLE IF NOT EXISTS genres (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  artist_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_genres_slug ON genres(slug);
CREATE INDEX IF NOT EXISTS idx_genres_count ON genres(artist_count DESC);

CREATE TABLE IF NOT EXISTS instruments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  artist_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_instruments_slug ON instruments(slug);
CREATE INDEX IF NOT EXISTS idx_instruments_count ON instruments(artist_count DESC);


-- ============================================================
-- WWOZ TRACKS (Keep existing functionality)
-- ============================================================
CREATE TABLE IF NOT EXISTS wwoz_tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  time TEXT,
  artist TEXT,
  title TEXT,
  album TEXT,
  genres TEXT,
  show_name TEXT,
  host TEXT,
  spotify_url TEXT,
  status TEXT,
  confidence REAL,
  created_at TEXT DEFAULT (datetime('now')),
  UNIQUE(date, time, artist, title)
);

CREATE INDEX IF NOT EXISTS idx_wwoz_date ON wwoz_tracks(date DESC);
