-- Phase 5b: only startup/business episodes are watched by Gemini and counted in the founder rankings.
-- Set during extraction (same Gemini call). null = extracted before this check existed.
alter table episodes add column business_related integer check (business_related in (0,1));
alter table episodes add column business_reason text;
