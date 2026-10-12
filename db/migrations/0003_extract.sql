-- Phase 3: per-episode extraction details (kept/dropped items) and a log of extraction runs.
alter table episodes add column extracted_at text;
alter table episodes add column extraction_stats text;

create table if not exists extract_runs (
  id text primary key default (lower(hex(randomblob(16)))),
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at text,
  processed integer not null default 0,
  extracted integer not null default 0,
  failed integer not null default 0,
  gemini_calls integer not null default 0,
  kept text not null default '{}',
  dropped text not null default '{}',
  stop_reason text,
  errors text not null default '[]'
);
