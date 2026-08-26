-- ============================================================================
-- 0003_functions.sql
-- All state-changing logic lives here as SECURITY DEFINER functions, called
-- via supabase.rpc(...) from the client with the user's normal session.
-- Nothing here trusts a client-supplied user id — every function reads
-- auth.uid() itself. Every commissioner-only function re-checks
-- is_commissioner() itself; it does not rely on the UI hiding a button.
--
-- Locking strategy: place_bid() takes `select ... for update` on the parent
-- auctions row before touching anything else. That serializes all bids
-- across the whole auction (not just the one slot), which is a deliberate,
-- documented simplification: at "~12 friends" scale the extra contention is
-- irrelevant, and it makes the anti-snipe extension (which mutates the same
-- auctions row) trivially race-free with no separate advisory lock needed.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- place_bid: the one and only way current_bid / current_winner_id change.
-- ----------------------------------------------------------------------------
create or replace function public.place_bid(
  p_auction_id uuid,
  p_slot_number integer,
  p_amount numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id  uuid := auth.uid();
  v_auction  public.auctions%rowtype;
  v_slot     public.draft_slots%rowtype;
  v_min_next numeric;
  v_now      timestamptz := clock_timestamp();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED: You must be signed in to bid.';
  end if;

  -- Lock the auction row first; this is what makes concurrent bids and the
  -- anti-snipe extension safe against each other.
  select * into v_auction from public.auctions where id = p_auction_id for update;
  if not found then
    raise exception 'NOT_FOUND: Auction not found.';
  end if;

  if not public.is_league_member(v_auction.league_id) then
    raise exception 'FORBIDDEN: You are not a member of this league.';
  end if;

  if v_auction.status = 'paused' then
    raise exception 'AUCTION_PAUSED: The auction is currently paused.';
  elsif v_auction.status = 'closed' then
    raise exception 'AUCTION_CLOSED: The auction is closed.';
  elsif v_auction.status <> 'open' then
    raise exception 'AUCTION_NOT_OPEN: The auction has not opened yet.';
  end if;

  if v_now >= v_auction.ends_at then
    raise exception 'AUCTION_ENDED: The auction has ended.';
  end if;

  select * into v_slot
  from public.draft_slots
  where auction_id = p_auction_id and slot_number = p_slot_number
  for update;

  if not found then
    raise exception 'NOT_FOUND: Draft slot not found.';
  end if;

  if v_slot.current_winner_id = v_user_id then
    raise exception 'ALREADY_LEADING: You are already the high bidder on this slot.';
  end if;

  v_min_next := case
    when v_slot.current_bid is null then v_auction.starting_bid
    else v_slot.current_bid + v_auction.bid_increment
  end;

  if p_amount < v_min_next then
    raise exception 'BID_TOO_LOW: Minimum bid is % (yours was %).', v_min_next, p_amount;
  end if;

  insert into public.bids (auction_id, draft_slot_id, user_id, amount)
  values (p_auction_id, v_slot.id, v_user_id, p_amount);

  update public.draft_slots
  set current_bid = p_amount, current_winner_id = v_user_id, updated_at = v_now
  where id = v_slot.id;

  -- Anti-snipe: if enabled and this bid landed inside the trigger window,
  -- push the WHOLE auction's end time back by the extension amount.
  if v_auction.anti_snipe_enabled
     and (v_auction.ends_at - v_now) <= make_interval(secs => v_auction.anti_snipe_window_seconds)
  then
    update public.auctions
    set ends_at = v_auction.ends_at + make_interval(secs => v_auction.anti_snipe_extension_seconds),
        updated_at = v_now
    where id = v_auction.id;
  end if;

  return jsonb_build_object(
    'success', true,
    'slot_number', p_slot_number,
    'amount', p_amount
  );
end;
$$;

grant execute on function public.place_bid(uuid, integer, numeric) to authenticated;

-- ----------------------------------------------------------------------------
-- Commissioner: auction lifecycle & configuration
-- ----------------------------------------------------------------------------
create or replace function public.set_auction_status(p_auction_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;
  if p_status not in ('draft', 'open', 'paused', 'closed') then
    raise exception 'INVALID_STATUS: %', p_status;
  end if;
  update public.auctions set status = p_status, updated_at = now() where id = p_auction_id;
end;
$$;
grant execute on function public.set_auction_status(uuid, text) to authenticated;

create or replace function public.update_auction_config(
  p_auction_id uuid,
  p_ends_at timestamptz default null,
  p_starting_bid numeric default null,
  p_bid_increment numeric default null,
  p_anti_snipe_enabled boolean default null,
  p_anti_snipe_window_seconds integer default null,
  p_anti_snipe_extension_seconds integer default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;

  update public.auctions set
    ends_at = coalesce(p_ends_at, ends_at),
    starting_bid = coalesce(p_starting_bid, starting_bid),
    bid_increment = coalesce(p_bid_increment, bid_increment),
    anti_snipe_enabled = coalesce(p_anti_snipe_enabled, anti_snipe_enabled),
    anti_snipe_window_seconds = coalesce(p_anti_snipe_window_seconds, anti_snipe_window_seconds),
    anti_snipe_extension_seconds = coalesce(p_anti_snipe_extension_seconds, anti_snipe_extension_seconds),
    updated_at = now()
  where id = p_auction_id;
end;
$$;
grant execute on function public.update_auction_config(uuid, timestamptz, numeric, numeric, boolean, integer, integer) to authenticated;

create or replace function public.extend_auction(p_auction_id uuid, p_seconds integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;
  update public.auctions
  set ends_at = ends_at + make_interval(secs => p_seconds), updated_at = now()
  where id = p_auction_id;
end;
$$;
grant execute on function public.extend_auction(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Commissioner: slot / bid corrections
-- ----------------------------------------------------------------------------
create or replace function public.reset_slot(p_auction_id uuid, p_slot_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
  v_slot_id uuid;
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;

  select id into v_slot_id from public.draft_slots
  where auction_id = p_auction_id and slot_number = p_slot_number;

  if v_slot_id is null then
    raise exception 'NOT_FOUND: Slot not found.';
  end if;

  update public.bids
  set invalidated_at = now(), invalidated_by = auth.uid()
  where draft_slot_id = v_slot_id and invalidated_at is null;

  update public.draft_slots
  set current_bid = null, current_winner_id = null, updated_at = now()
  where id = v_slot_id;
end;
$$;
grant execute on function public.reset_slot(uuid, integer) to authenticated;

-- Recompute a slot's current_bid/current_winner_id from its remaining valid
-- bids. Used after a single bid is invalidated (removed).
create or replace function public.recompute_slot_leader(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_best record;
begin
  select amount, user_id into v_best
  from public.bids
  where draft_slot_id = p_slot_id and invalidated_at is null
  order by amount desc, created_at asc
  limit 1;

  if v_best is null then
    update public.draft_slots
    set current_bid = null, current_winner_id = null, updated_at = now()
    where id = p_slot_id;
  else
    update public.draft_slots
    set current_bid = v_best.amount, current_winner_id = v_best.user_id, updated_at = now()
    where id = p_slot_id;
  end if;
end;
$$;

create or replace function public.remove_bid(p_bid_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bid public.bids%rowtype;
  v_league_id uuid;
begin
  select * into v_bid from public.bids where id = p_bid_id;
  if not found then
    raise exception 'NOT_FOUND: Bid not found.';
  end if;

  v_league_id := public.league_id_for_auction(v_bid.auction_id);
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;

  update public.bids
  set invalidated_at = now(), invalidated_by = auth.uid()
  where id = p_bid_id and invalidated_at is null;

  perform public.recompute_slot_leader(v_bid.draft_slot_id);
end;
$$;
grant execute on function public.remove_bid(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Commissioner: draft-order resolution
-- ----------------------------------------------------------------------------
create or replace function public.draft_assign(
  p_auction_id uuid,
  p_slot_number integer,
  p_user_id uuid,
  p_winning_bid numeric
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;

  if exists (
    select 1 from public.auctions where id = p_auction_id and draft_finalized_at is not null
  ) then
    raise exception 'ALREADY_FINALIZED: Draft order has already been finalized.';
  end if;

  if exists (
    select 1 from public.draft_assignments
    where auction_id = p_auction_id and slot_number = p_slot_number
  ) then
    raise exception 'SLOT_ALREADY_ASSIGNED: Slot % is already assigned.', p_slot_number;
  end if;

  if exists (
    select 1 from public.draft_assignments
    where auction_id = p_auction_id and user_id = p_user_id
  ) then
    raise exception 'USER_ALREADY_ASSIGNED: That user already has a draft position.';
  end if;

  insert into public.draft_assignments (auction_id, slot_number, user_id, winning_bid, assigned_by)
  values (p_auction_id, p_slot_number, p_user_id, p_winning_bid, auth.uid());
end;
$$;
grant execute on function public.draft_assign(uuid, integer, uuid, numeric) to authenticated;

create or replace function public.draft_unassign(p_auction_id uuid, p_slot_number integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;

  if exists (
    select 1 from public.auctions where id = p_auction_id and draft_finalized_at is not null
  ) then
    raise exception 'ALREADY_FINALIZED: Draft order has already been finalized.';
  end if;

  delete from public.draft_assignments
  where auction_id = p_auction_id and slot_number = p_slot_number;
end;
$$;
grant execute on function public.draft_unassign(uuid, integer) to authenticated;

create or replace function public.draft_finalize(p_auction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
  v_slot_count integer;
  v_assigned_count integer;
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;

  select slot_count into v_slot_count from public.auctions where id = p_auction_id;
  select count(*) into v_assigned_count from public.draft_assignments where auction_id = p_auction_id;

  if v_assigned_count < v_slot_count then
    raise exception 'INCOMPLETE: % of % slots are assigned.', v_assigned_count, v_slot_count;
  end if;

  update public.auctions set draft_finalized_at = now(), updated_at = now() where id = p_auction_id;
end;
$$;
grant execute on function public.draft_finalize(uuid) to authenticated;

create or replace function public.draft_reopen(p_auction_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_league_id uuid := public.league_id_for_auction(p_auction_id);
begin
  if not public.is_commissioner(v_league_id) then
    raise exception 'FORBIDDEN: Commissioner only.';
  end if;
  update public.auctions set draft_finalized_at = null, updated_at = now() where id = p_auction_id;
end;
$$;
grant execute on function public.draft_reopen(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- join_only_league: v1 auto-association. Called right after sign-up (and
-- harmlessly again on login) to attach the caller to "the" league, since v1
-- assumes exactly one exists. If zero or more than one league exist, this is
-- a no-op — multi-league support just means replacing this call with a real
-- picker later, no schema change required.
-- ----------------------------------------------------------------------------
create or replace function public.join_only_league()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_league_id uuid;
  v_league_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED: You must be signed in.';
  end if;

  select count(*) into v_league_count from public.leagues;
  if v_league_count <> 1 then
    return;
  end if;

  select id into v_league_id from public.leagues limit 1;

  insert into public.league_members (league_id, user_id, role)
  values (v_league_id, v_user_id, 'member')
  on conflict (league_id, user_id) do nothing;
end;
$$;
grant execute on function public.join_only_league() to authenticated;

-- ----------------------------------------------------------------------------
-- Server time, for the client's authoritative countdown sync.
-- ----------------------------------------------------------------------------
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
as $$
  select now();
$$;
grant execute on function public.get_server_time() to authenticated, anon;
