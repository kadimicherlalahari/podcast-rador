create table if not exists shows (
  id text primary key default (lower(hex(randomblob(16)))),
  name text not null unique,
  youtube_channel_id text,
  youtube_uploads_playlist_id text,
  rss_url text,
  spotify_show_id text,
  podcastindex_feed_id integer,
  host_names text not null default '[]',
  language text,
  active integer not null default 1 check (active in (0,1)),
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

create table if not exists episodes (
  id text primary key default (lower(hex(randomblob(16)))),
  show_id text not null references shows(id) on delete cascade,
  title text not null,
  description text,
  published_at text,
  duration_seconds integer,
  kind text not null default 'full' check (kind in ('full','clip','trailer','live_upcoming')),
  youtube_video_id text,
  rss_guid text,
  spotify_episode_id text,
  audio_url text,
  source_urls text not null default '{}',
  status text not null default 'pending_extraction'
    check (status in ('pending_extraction','extracted','failed','skipped')),
  extraction_error text,
  created_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create unique index if not exists episodes_youtube_video_id_key on episodes(youtube_video_id) where youtube_video_id is not null;
create unique index if not exists episodes_show_rss_guid_key on episodes(show_id, rss_guid) where rss_guid is not null;
create unique index if not exists episodes_spotify_episode_id_key on episodes(spotify_episode_id) where spotify_episode_id is not null;
create index if not exists episodes_show_published_idx on episodes(show_id, published_at);
create index if not exists episodes_status_idx on episodes(status);

create table if not exists guests (
  id text primary key default (lower(hex(randomblob(16)))),
  canonical_name text not null,
  normalized_key text not null unique,
  company text,
  role text,
  aliases text not null default '[]'
);

create table if not exists brands (
  id text primary key default (lower(hex(randomblob(16)))),
  canonical_name text not null,
  normalized_key text not null unique,
  category text,
  aliases text not null default '[]'
);

create table if not exists topics (
  id text primary key default (lower(hex(randomblob(16)))),
  slug text not null unique,
  label text not null
);

create table if not exists appearances (
  id text primary key default (lower(hex(randomblob(16)))),
  episode_id text not null references episodes(id) on delete cascade,
  guest_id text not null references guests(id) on delete cascade,
  evidence text,
  unique (episode_id, guest_id)
);

create table if not exists brand_mentions (
  id text primary key default (lower(hex(randomblob(16)))),
  episode_id text not null references episodes(id) on delete cascade,
  brand_id text not null references brands(id) on delete cascade,
  mention_type text not null check (mention_type in ('paid_read','sponsor_disclosure','organic')),
  evidence text,
  unique (episode_id, brand_id, mention_type)
);

create table if not exists episode_topics (
  episode_id text not null references episodes(id) on delete cascade,
  topic_id text not null references topics(id) on delete cascade,
  primary key (episode_id, topic_id)
);

create table if not exists enrichments (
  id text primary key default (lower(hex(randomblob(16)))),
  entity_type text not null check (entity_type in ('guest','brand')),
  entity_id text not null,
  source text not null,
  payload text not null default '{}',
  fetched_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
create index if not exists enrichments_entity_idx on enrichments(entity_type, entity_id, source);

create table if not exists briefs (
  id text primary key default (lower(hex(randomblob(16)))),
  week_start text not null,
  generated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  data text not null default '{}',
  narrative text,
  emailed integer not null default 0 check (emailed in (0,1))
);

create table if not exists pipeline (
  id text primary key default (lower(hex(randomblob(16)))),
  entity_type text not null check (entity_type in ('guest','brand')),
  entity_id text not null,
  status text not null default 'suggested'
    check (status in ('suggested','pitched','replied','booked','declined')),
  draft text,
  notes text,
  updated_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  unique (entity_type, entity_id)
);

create table if not exists ingest_runs (
  id text primary key default (lower(hex(randomblob(16)))),
  started_at text not null default (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  finished_at text,
  per_show text not null default '{}',
  errors text not null default '[]'
);

create table if not exists scoring_config (
  key text primary key,
  value real not null
);
