-- ============================================================================
-- 0001_schema.sql
-- Core tables for the draft-position auction app.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- profiles: one row per authenticated user, mirrors auth.users
-- ----------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- leagues (structured for multi-league even though v1 uses exactly one)
-- ----------------------------------------------------------------------------
create table if not exists public.leagues (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  commissioner_id uuid not null references public.profiles (id),
  created_at      timestamptz not null default now()
);

create table if not exists public.league_members (
  league_id  uuid not null references public.leagues (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('member', 'commissioner')),
  joined_at  timestamptz not null default now(),
  primary key (league_id, user_id)
);

create index if not exists league_members_user_idx on public.league_members (user_id);

-- ----------------------------------------------------------------------------
-- auctions
-- ----------------------------------------------------------------------------
create table if not exists public.auctions (
  id                          uuid primary key default gen_random_uuid(),
  league_id                   uuid not null references public.leagues (id) on delete cascade,
  status                      text not null default 'draft'
                                check (status in ('draft', 'open', 'paused', 'closed')),
  starts_at                   timestamptz,
  ends_at                     timestamptz not null,
  starting_bid                numeric(10, 2) not null default 1 check (starting_bid >= 0),
  bid_increment               numeric(10, 2) not null default 1 check (bid_increment > 0),
  anti_snipe_enabled          boolean not null default true,
  anti_snipe_window_seconds   integer not null default 120 check (anti_snipe_window_seconds >= 0),
  anti_snipe_extension_seconds integer not null default 120 check (anti_snipe_extension_seconds >= 0),
  slot_count                  integer not null default 12 check (slot_count > 0),
  draft_finalized_at          timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index if not exists auctions_league_idx on public.auctions (league_id);

-- ----------------------------------------------------------------------------
-- draft_slots: one row per pick position per auction
-- ----------------------------------------------------------------------------
create table if not exists public.draft_slots (
  id                uuid primary key default gen_random_uuid(),
  auction_id        uuid not null references public.auctions (id) on delete cascade,
  slot_number        integer not null check (slot_number > 0),
  current_bid       numeric(10, 2),
  current_winner_id uuid references public.profiles (id),
  updated_at        timestamptz not null default now(),
  unique (auction_id, slot_number)
);

create index if not exists draft_slots_auction_idx on public.draft_slots (auction_id);
create index if not exists draft_slots_winner_idx on public.draft_slots (current_winner_id);

-- ----------------------------------------------------------------------------
-- bids: permanent, append-only ledger. Rows are never deleted or overwritten;
-- an invalid bid is "invalidated" (soft-removed) by the commissioner instead.
-- ----------------------------------------------------------------------------
create table if not exists public.bids (
  id             uuid primary key default gen_random_uuid(),
  auction_id     uuid not null references public.auctions (id) on delete cascade,
  draft_slot_id  uuid not null references public.draft_slots (id) on delete cascade,
  user_id        uuid not null references public.profiles (id),
  amount         numeric(10, 2) not null check (amount >= 0),
  created_at     timestamptz not null default now(),
  invalidated_at timestamptz,
  invalidated_by uuid references public.profiles (id)
);

create index if not exists bids_slot_idx on public.bids (draft_slot_id, created_at desc);
create index if not exists bids_auction_idx on public.bids (auction_id);
create index if not exists bids_user_idx on public.bids (user_id);

-- ----------------------------------------------------------------------------
-- draft_assignments: the commissioner's final, one-user-per-slot resolution
-- ----------------------------------------------------------------------------
create table if not exists public.draft_assignments (
  id           uuid primary key default gen_random_uuid(),
  auction_id   uuid not null references public.auctions (id) on delete cascade,
  slot_number  integer not null check (slot_number > 0),
  user_id      uuid not null references public.profiles (id),
  winning_bid  numeric(10, 2) not null check (winning_bid >= 0),
  assigned_at  timestamptz not null default now(),
  assigned_by  uuid references public.profiles (id),
  unique (auction_id, slot_number),
  unique (auction_id, user_id)
);

create index if not exists draft_assignments_auction_idx on public.draft_assignments (auction_id);
