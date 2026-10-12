# Podcast Ecosystem Radar — Build Spec

You (Claude Code) are building a working prototype for a university exam. Read this whole file before writing code. Work in the phases at the bottom and STOP at each checkpoint to show me results before continuing.

---

## 1. What we're building

A weekly intelligence system for a podcast host (Aditya) who runs an Indian startup-founder podcast. It monitors 10 podcasts and every Monday morning (IST) delivers a brief answering:

1. **Who to book** — guests appearing on 2+ monitored shows in the last 30 days ("media rounds"), plus "early" guests (first appearance on exactly one show in the last 30 days).
2. **What to cover** — topics rising or falling across shows vs. a 4-week baseline.
3. **Who to pitch for sponsorship** — brands with _paid_ placements (ad reads / sponsor disclosures) across shows, ranked by spread and recency.
4. **Outreach drafts** — editable pitch drafts for the top guests and brands, with a status tracker.

## 2. Hard constraints (non-negotiable)

- **All AI tasks use Gemini Flash** via the Google Gen AI SDK (`@google/genai`). **Never use the Claude/Anthropic API.** Read the model name from env var `GEMINI_MODEL`; do not hardcode it. Verify the current Flash model name in Google AI Studio docs before first use.
- **Deploy on Vercel.** Public URL + GitHub repo.
- **Live, real data only.** Never seed fake episodes, guests, brands, or numbers. If a source returns nothing, show an empty state — do not fabricate.
- **The monitored show list must be editable from the UI** (no code changes).
- **Brief must be generated every Monday morning IST**, plus an on-demand "Run now" button.
- Do NOT scrape LinkedIn. Do NOT use the X/Twitter API. Do NOT guess YouTube channel IDs, RSS URLs, or Spotify show IDs — resolve them via API and ask me to confirm.

## 3. Stack

- Next.js (App Router, TypeScript), deployed on Vercel
- Supabase Postgres (free tier) via `@supabase/supabase-js` (server-side service key only)
- Gemini Flash via `@google/genai` with JSON structured output (`responseMimeType: "application/json"` + `responseSchema`)
- Email via Resend
- RSS parsing: `rss-parser`
- Fuzzy matching: `fastest-levenshtein` or similar lightweight lib
- Vercel Cron (configured in `vercel.json`)

### Environment variables (`.env.example`, never commit real values)

```
GEMINI_API_KEY=
GEMINI_MODEL=
YOUTUBE_API_KEY=
PODCASTINDEX_API_KEY=
PODCASTINDEX_API_SECRET=
SPOTIFY_ENABLED=false
SPOTIFY_CLIENT_ID=
SPOTIFY_CLIENT_SECRET=
SPOTIFY_REFRESH_TOKEN=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
BRIEF_RECIPIENT_EMAIL=
CRON_SECRET=
```

## 4. Platform limits to design around

Check current Vercel docs before implementing and tell me if anything below has changed.

- Vercel Hobby crons fire **at most once per day**, UTC only, and timing is only guaranteed within the scheduled hour.
- Function execution time is limited — check the current Hobby max duration and set `maxDuration` accordingly. Design every job to process work in **capped batches** so no single invocation can time out.
- Protect cron routes: require `Authorization: Bearer ${CRON_SECRET}`.
- YouTube Data API default quota: 10,000 units/day; list calls cost 1 unit. Never use `search.list` for routine ingestion.
- Gemini free tier has per-minute and per-day request limits — add retry with exponential backoff on HTTP 429 and a per-run cap on Gemini calls.

## 5. Data model (Supabase SQL migrations in `/supabase/migrations`)

```
shows(id, name, youtube_channel_id, youtube_uploads_playlist_id, rss_url,
      spotify_show_id, podcastindex_feed_id, host_names text[], language,
      active bool, created_at)

episodes(id, show_id, title, description, published_at timestamptz,
         duration_seconds, kind  -- 'full' | 'clip' | 'trailer' | 'live_upcoming'
         youtube_video_id unique null, rss_guid null, spotify_episode_id null,
         audio_url, source_urls jsonb, status -- 'pending_extraction'|'extracted'|'failed'|'skipped'
         extraction_error, created_at)
  -- unique (show_id, rss_guid) where rss_guid not null

guests(id, canonical_name, normalized_key unique, company, role, aliases text[])
brands(id, canonical_name, normalized_key unique, category, aliases text[])
topics(id, slug unique, label)          -- fixed taxonomy, seeded (see §8)

appearances(id, episode_id, guest_id, evidence text, unique(episode_id, guest_id))
brand_mentions(id, episode_id, brand_id, mention_type -- 'paid_read'|'sponsor_disclosure'|'organic'
               evidence text)
episode_topics(episode_id, topic_id, primary key both)

enrichments(id, entity_type, entity_id, source, payload jsonb, fetched_at)
briefs(id, week_start date, generated_at, data jsonb, narrative text, emailed bool)
pipeline(id, entity_type -- 'guest'|'brand', entity_id, status -- 'suggested'|'pitched'|'replied'|'booked'|'declined'
         draft text, notes, updated_at)
ingest_runs(id, started_at, finished_at, per_show jsonb, errors jsonb)
scoring_config(key primary key, value numeric)   -- weights live here, editable
```

## 6. Pipeline

### Stage 1 — Config

`/admin/shows` (open, no login): add/edit/pause shows. On add, a "Resolve IDs" action:

- YouTube: find channel → store `youtube_channel_id` and `youtube_uploads_playlist_id` (from `channels.list` → `contentDetails.relatedPlaylists.uploads`).
- RSS: look up via Podcast Index search; show candidates; I confirm.
- Spotify (only if `SPOTIFY_ENABLED`): search show; I confirm.
- Host names: entered manually (used to exclude hosts from guest lists).

### Stage 2 — Ingest (daily)

Route `/api/jobs/ingest`. For each active show:

1. YouTube: `playlistItems.list` on uploads playlist (latest 50) → new video IDs → `videos.list` (batch ≤50) for duration, liveBroadcastContent, full description.
2. RSS: fetch feed; take items from the last 60 days.
3. Spotify (optional, see §7).
4. Drop anything already stored (by youtube_video_id / rss_guid / spotify_episode_id).
5. **Classify `kind`:** `live_upcoming` if live/upcoming; `clip` if duration < 15 min OR title/description contains `#shorts`; `trailer` if title matches trailer/teaser; else `full`. Only `full` episodes get extracted. (Indian shows post many clips — these MUST NOT inflate guest counts.) Make the 15-min threshold a config value.
6. **Cross-source matching:** the same episode often exists on YouTube, RSS and Spotify. Treat as one episode if same show AND normalized title similarity ≥ 0.85 AND published within ±3 days. Merge into one row; concatenate descriptions for richer extraction; keep all source URLs.
7. Insert with `status='pending_extraction'`. Log counts per show to `ingest_runs`.
   Idempotent: re-running must never create duplicates.

### Stage 3 — Extract (Gemini)

Route `/api/jobs/extract`, processes up to N pending episodes per call (N configurable, default 15).
Input to Gemini: show name, host names, title, merged description, chapters. Structured output schema:

```
{
  guests: [{ name, company, role, evidence }],
  topics: [slug],                          // ONLY from the provided taxonomy; else "other"
  brands: [{ name, mention_type, evidence }]
}
```

Prompt rules: exclude hosts; a guest must be a person interviewed in the episode, not merely mentioned; `paid_read`/`sponsor_disclosure` only when the text shows sponsorship ("sponsored by", "brought to you by", promo codes, "#ad", affiliate disclosures); otherwise `organic`.
**Evidence verification (mandatory):** after the response, check each `evidence` string appears (case-insensitive, whitespace-normalized) in the input text. Drop items that fail; count drops in logs. This is our hallucination guard.

### Stage 4 — Resolve entities

Normalize names deterministically: lowercase, strip honorifics (dr, mr, ms, shri), strip bracketed text, collapse whitespace → `normalized_key`. Exact key match → same entity. Levenshtein ratio ≥ 0.9 → same entity (add alias). Between 0.75 and 0.9 → ask Gemini "same person/company? yes/no" with both contexts. Below → new entity. Log every merge decision.

### Stage 5 — Score (SQL only — Gemini never computes numbers)

Postgres views/functions, all windows relative to the brief's `week_start` (Monday, IST):

- `media_rounds_guests`: distinct shows in last 30d ≥ 2.
- `early_guests`: exactly one appearance ever in our data, within last 30d.
- `topic_momentum`: episodes tagged this week vs. avg/week over prior 4 weeks; report ratio and absolute counts; suppress topics with < 2 episodes total (noise).
- `active_sponsors`: only paid_read + sponsor_disclosure; score = distinct_shows × w1 + placements × w2 + recency decay. Weights from `scoring_config`.

### Stage 6 — Enrich (shortlist only: top 10 guests, top 10 brands)

- Guests: Podcast Index `search/byperson` → appearances on podcasts outside our 10 shows (count + titles); startup-news RSS feeds (configurable list) → headlines mentioning the guest or company in last 30d.
- Brands: list of shows + dates of paid placements (from our DB).
  Cache in `enrichments`; refresh at most weekly.

### Stage 7 — Brief (Monday)

Route `/api/jobs/brief`. Build a JSON payload from Stage 5/6 results. Gemini writes ONLY the narrative prose using the payload; all numbers rendered in the UI/email come from the payload, never from Gemini text. Save to `briefs`, render at `/briefs/[id]`, email via Resend. Every item links to its evidence episodes.

### Stage 8 — Act

For top 5 guests and top 5 brands, Gemini drafts a short outreach message using the evidence (which shows, which topics, what's uncovered). Stored in `pipeline` as `suggested`. UI at `/pipeline`: edit draft, copy, change status. The system never sends outreach automatically.

## 7. Spotify (optional source)

- Spotify Development Mode requires the app owner to have Premium (I do), allows limited endpoints, and is for non-commercial use. Treat it as a **supplementary** source only.
- Use Authorization Code flow ONCE via a local script (`npm run spotify:auth`) to obtain a refresh token; store it in env. Server refreshes access tokens as needed.
- **Capability check first:** on startup of the ingest job, call the show-episodes endpoint for one configured show. If it returns 401/403/404 or the endpoint is unavailable, log it, mark Spotify disabled for the run, and continue without it. Never let Spotify failure break ingestion.
- Use it to: (a) fill episodes missing from RSS, (b) add description text for extraction, (c) store Spotify URLs for the brief.

## 8. Seed data

### Shows (resolve IDs via Stage 1 — do not guess)

1. The Neon Show
2. WTF is with Nikhil Kamath
3. The BarberShop with Shantanu
4. Founder Thesis
5. First Principles
6. The Indian Dream
7. Figuring Out
8. The Ranveer Show
9. Raw Talks With Vamshi Kurapati
10. SparX

### Topic taxonomy (seed; editable)

fundraising-vc, d2c-consumer-brands, quick-commerce, fintech, ai-genai, saas-b2b, deeptech-hardware, ev-climate, healthtech, edtech, creator-economy, media-content, manufacturing-make-in-india, ipo-public-markets, personal-finance-investing, founder-mental-health-burnout, hiring-culture-leadership, marketing-growth, gtm-sales, policy-regulation, bharat-tier2-3, gaming, real-estate-proptech, agritech-food, other

## 9. Pages

- `/` dashboard: latest brief summary, last ingest status, per-show episodes-in-last-30-days (to spot dormant shows).
- `/briefs` list + `/briefs/[id]` detail.
- `/admin/shows` config.
- `/pipeline` outreach tracker.
- `/admin/runs` ingest/extract logs with "Run now" buttons (ingest → extract → brief).

## 10. Cron (`vercel.json`)

- Daily `0 22 * * *` UTC (~03:30 IST): ingest, then extract a capped batch, then (if Monday IST) generate the brief.
  - Rationale: Hobby allows one run per day per job; one daily job that conditionally builds the brief on Mondays keeps it simple and lands before Aditya's morning.
- Also expose each stage as its own secured route for manual runs.

## 11. Backfill

`npm run backfill` — local script (no Vercel timeout) that ingests and extracts the last 6 weeks for all active shows, respecting Gemini rate limits. Must be run before submission so the deployed app has real data.

## 12. Deliverables

- Working Vercel URL, GitHub repo.
- `COMPONENTS.md`: Components Map with a Mermaid diagram of all stages, data sources, tables, and where Gemini is used, plus a table listing each component, its tech, inputs, and outputs.
- `README.md`: setup, env vars, how to run backfill, known limitations (be honest: e.g. sponsors only detected when disclosed in text; clips filtered by duration heuristic).

## 13. Build phases (STOP after each and show me results)

1. Scaffold, Supabase schema, `/admin/shows`, ID resolution. **Checkpoint:** show me the resolved IDs for all 10 shows for confirmation.
2. Ingest (YouTube + RSS) + classification + cross-source matching + backfill (ingest only). **Checkpoint:** per-show table: total items, full episodes, clips, matched across sources, episodes in last 30d.
3. Extraction with evidence verification. **Checkpoint:** 10 random extracted episodes side-by-side with source text; % of episodes with ≥1 guest; % with ≥1 paid brand; evidence-drop rate.
4. Entity resolution + scoring views. **Checkpoint:** list of merges, top media-rounds guests, top sponsors.
5. Brief generation + email + cron. **Checkpoint:** a real brief.
6. Enrichment + pipeline/outreach drafts.
7. Spotify (optional) behind feature flag.
8. COMPONENTS.md, README, deploy, final verification on the live URL.

## 14. Rules for you while building

- If a fact about an API (endpoint, limit, field) matters, check the official docs rather than assuming; tell me when docs contradict this spec.
- Prefer simple, readable code over abstractions.
- Write small tests for: name normalization, clip classification, cross-source matching, evidence verification.
- Never commit secrets.
