-- Phase 5: YouTube engagement stats, viewer comments, and Gemini-written insights for the founder views.

alter table episodes add column view_count integer;
alter table episodes add column like_count integer;
alter table episodes add column comment_count integer;
alter table episodes add column stats_fetched_at text;

-- Top-level viewer comments (YouTube "relevance" order), used to surface what the audience is asking.
create table if not exists video_comments (
  id text primary key,
  episode_id text not null references episodes(id) on delete cascade,
  text text not null,
  like_count integer not null default 0,
  published_at text
);
create index if not exists video_comments_episode_idx on video_comments(episode_id);

-- One row per (entity, kind). payload is JSON written by Gemini; sources are the URLs it was grounded on.
--   guest/profile        web profile via Gemini + Google Search
--   guest/youtube        the guest's other YouTube videos via search.list
--   episode/analysis     Gemini watched the video: summary, highlights, quotes
--   topic/brief          top questions the monitored shows covered, what viewers ask, key points
create table if not exists insights (
  entity_type text not null check (entity_type in ('guest','topic','brand','episode')),
  entity_id text not null,
  kind text not null,
  payload text not null default '{}',
  sources text not null default '[]',
  error text,
  generated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  primary key (entity_type, entity_id, kind)
);

create table if not exists insight_runs (
  id text primary key default (lower(hex(randomblob(16)))),
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at text,
  stats_updated integer not null default 0,
  comments_fetched integer not null default 0,
  generated integer not null default 0,
  gemini_calls integer not null default 0,
  youtube_units integer not null default 0,
  stop_reason text,
  errors text not null default '[]'
);

insert or ignore into scoring_config (key, value) values
  ('insight_gemini_max_calls', 30),
  ('insight_refresh_days', 7),
  ('video_analysis_max_minutes', 40),
  ('engagement_w_like', 10),
  ('engagement_w_comment', 20);
