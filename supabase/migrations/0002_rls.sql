-- ============================================================================
-- 0002_rls.sql
-- Row Level Security. Default posture: deny everything, then open narrow,
-- read-mostly holes. Every write that matters (bids, auction config, slot
-- state, assignments) is done through SECURITY DEFINER functions in
-- 0003_functions.sql, NOT through direct table grants — so most tables get
-- SELECT policies only, and no client-facing INSERT/UPDATE/DELETE policy at
-- all. That is what makes "never trust a client-supplied user id" and
-- "commissioner-only enforced server-side" actually true rather than just UI
-- conventions.
-- ============================================================================

alter table public.profiles          enable row level security;
alter table public.leagues           enable row level security;
alter table public.league_members    enable row level security;
alter table public.auctions          enable row level security;
alter table public.draft_slots       enable row level security;
alter table public.bids              enable row level security;
alter table public.draft_assignments enable row level security;

-- Helper: does the current user share a league with target user / own a row?
create or replace function public.shares_league_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.league_members lm1
    join public.league_members lm2 on lm1.league_id = lm2.league_id
    where lm1.user_id = auth.uid() and lm2.user_id = p_user_id
  );
$$;

create or replace function public.is_league_member(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_commissioner(p_league_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.league_members
    where league_id = p_league_id and user_id = auth.uid() and role = 'commissioner'
  );
$$;

create or replace function public.league_id_for_auction(p_auction_id uuid)
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select league_id from public.auctions where id = p_auction_id;
$$;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
create policy "profiles_select_self_or_leaguemates"
  on public.profiles for select
  using (id = auth.uid() or public.shares_league_with(id));

create policy "profiles_update_self"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());
-- No role/commissioner-relevant columns live on profiles, so a plain
-- self-update policy is safe — it cannot be used to escalate privilege.

-- ----------------------------------------------------------------------------
-- leagues
-- ----------------------------------------------------------------------------
create policy "leagues_select_member"
  on public.leagues for select
  using (public.is_league_member(id));

-- No client-facing insert/update/delete policy: league creation happens via
-- the seed script / commissioner bootstrap function only.

-- ----------------------------------------------------------------------------
-- league_members
-- ----------------------------------------------------------------------------
create policy "league_members_select_fellow_members"
  on public.league_members for select
  using (public.is_league_member(league_id));

-- No client write policy. Role changes must go through an explicit
-- commissioner-checked function if ever needed post-v1.

-- ----------------------------------------------------------------------------
-- auctions
-- ----------------------------------------------------------------------------
create policy "auctions_select_member"
  on public.auctions for select
  using (public.is_league_member(league_id));

-- No client write policy — status/timing/increment changes go through
-- commissioner-checked RPCs only (0003_functions.sql).

-- ----------------------------------------------------------------------------
-- draft_slots
-- ----------------------------------------------------------------------------
create policy "draft_slots_select_member"
  on public.draft_slots for select
  using (public.is_league_member(public.league_id_for_auction(auction_id)));

-- No client write policy — current_bid / current_winner_id are only ever
-- mutated by place_bid() / commissioner reset functions.

-- ----------------------------------------------------------------------------
-- bids
-- ----------------------------------------------------------------------------
create policy "bids_select_member"
  on public.bids for select
  using (public.is_league_member(public.league_id_for_auction(auction_id)));

-- No client write policy — every bid is inserted by place_bid(), which runs
-- as SECURITY DEFINER and stamps user_id from auth.uid() itself.

-- ----------------------------------------------------------------------------
-- draft_assignments
-- ----------------------------------------------------------------------------
create policy "draft_assignments_select_member"
  on public.draft_assignments for select
  using (public.is_league_member(public.league_id_for_auction(auction_id)));

-- No client write policy — only draft_assign()/draft_unassign()/
-- draft_finalize(), all commissioner-checked, may write here.
