-- Phase 4: entity resolution log + alias map, and scoring config.

-- A merged-away key points at the key it was merged into, so later extractions attach to the kept entity.
create table if not exists entity_aliases (
  entity_type text not null check (entity_type in ('guest','brand')),
  alias_key text not null,
  canonical_key text not null,
  primary key (entity_type, alias_key)
);

-- Every merge decision (and every "distinct" verdict from Gemini, so the same pair is never asked twice).
create table if not exists entity_decisions (
  id text primary key default (lower(hex(randomblob(16)))),
  entity_type text not null check (entity_type in ('guest','brand')),
  a_key text not null,
  b_key text not null,
  a_name text not null,
  b_name text not null,
  similarity real not null,
  method text not null check (method in ('levenshtein','gemini')),
  verdict text not null check (verdict in ('merged','distinct')),
  reason text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (entity_type, a_key, b_key)
);

create table if not exists resolve_runs (
  id text primary key default (lower(hex(randomblob(16)))),
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at text,
  candidates integer not null default 0,
  merged integer not null default 0,
  kept_distinct integer not null default 0,
  gemini_calls integer not null default 0,
  pending integer not null default 0,
  errors text not null default '[]'
);

insert or ignore into scoring_config (key, value) values
  ('sponsor_window_days', 60),
  ('resolve_gemini_max_calls', 30);
