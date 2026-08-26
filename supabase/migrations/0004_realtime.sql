-- ============================================================================
-- 0004_realtime.sql
-- Add the tables the UI needs live updates from to the supabase_realtime
-- publication. RLS still applies to realtime payloads, so a client only
-- receives changes for rows it's allowed to SELECT.
-- ============================================================================

alter publication supabase_realtime add table public.draft_slots;
alter publication supabase_realtime add table public.bids;
alter publication supabase_realtime add table public.auctions;
alter publication supabase_realtime add table public.draft_assignments;
