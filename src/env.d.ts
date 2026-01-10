/// <reference path="../.astro/types.d.ts" />
/// <reference types="@cloudflare/workers-types" />

type D1Database = import('@cloudflare/workers-types').D1Database;
type R2Bucket = import('@cloudflare/workers-types').R2Bucket;

interface RuntimeEnv {
  DB: D1Database;
  PORTRAITS?: R2Bucket;
  CACHE_TTL?: string;
  R2_PUBLIC_URL?: string;
}

declare namespace App {
  interface Locals {
    runtime: {
      env: RuntimeEnv;
      ctx: ExecutionContext;
      caches: CacheStorage;
    };
  }
}

// Artist type from database
interface Artist {
  id: number;
  slug: string;
  title: string;
  artist_type: string | null;
  birth_date: string | null;
  death_date: string | null;
  bio_html: string;
  bio_markdown: string;
  image_filename: string | null;
  genres: string; // JSON string
  instruments: string; // JSON string
  spotify_data: string; // JSON string
  audio_profile: string; // JSON string
  external_urls: string; // JSON string
  musical_connections: string; // JSON string
  created_at: string;
  updated_at: string;
}

// Search result type
interface SearchResult {
  slug: string;
  title: string;
  bio_snippet: string;
  artist_type: string | null;
  genres: string;
  image_filename?: string;
}
