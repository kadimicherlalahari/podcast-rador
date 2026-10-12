# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: Aditya, host of an Indian startup-founder podcast. On Monday morning (IST) he opens the app to decide who to book, what to cover, and which brands to pitch. He is not interested in the ingest machinery except to trust it.
Secondary: the operator (the builder / exam evaluator), who configures monitored shows and triggers runs.

## Product Purpose

Podcast Ecosystem Radar monitors 10 Indian podcasts and produces a weekly brief: guests doing media rounds, early guests, rising/falling topics, brands with paid placements, and editable outreach drafts. Success: Aditya can act on the brief in minutes and trace every claim back to the source episodes.

## Positioning

Every number comes from real ingested episodes and SQL scoring; Gemini only extracts (with evidence checks) and writes prose. Each item links to its evidence episodes.

## Capabilities and Constraints

- Stages: shows config → ingest (YouTube + RSS, clip filtering, cross-source merge) → extract (Gemini) → resolve → score → enrich → brief → outreach.
- Built so far (Phase 2): shows config, ID resolution, ingest, episodes browser, runs log. Briefs, extraction, and pipeline are not built yet; their pages explain what they will show.
- Live, real data only. Never show fake episodes, guests, brands, or numbers; empty states instead.
- Admin pages are open, no login.
- Outreach is never sent automatically.

## Evidence on Hand

Real data in the DB: 10 shows (8 active), ~1,150 ingested items (mostly clips, skipped), ~90 full episodes awaiting extraction. No briefs, guests, or brands yet.

## Product Principles

- Insight first, machinery second.
- Plain language over internal status codes.
- Every claim traceable to episodes.
- Empty states say what will appear and what has to happen first.
