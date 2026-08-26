-- ============================================================================
-- supabase/tests/place_bid.test.sql
-- Run with: supabase test db  (requires the Supabase CLI + local Postgres;
-- see README "Running tests"). Uses pgTAP, which `supabase test db` installs
-- automatically in the test database.
--
-- These tests exercise the SQL layer directly (as different authenticated
-- roles, via `set local role` + a mocked auth.uid()) rather than through the
-- JS client, so they cover exactly the integrity guarantees place_bid() and
-- the commissioner RPCs are supposed to provide, independent of any UI bug.
-- ============================================================================

begin;
select plan(14);

-- ----------------------------------------------------------------------------
-- Fixtures: two members + a commissioner, one league, one open auction,
-- one slot.
-- ----------------------------------------------------------------------------
insert into auth.users (id, email, encrypted_password, email_confirmed_at, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'commish@test.dev', crypt('x', gen_salt('bf')), now(), '{"display_name":"Commish"}'),
  ('22222222-2222-2222-2222-222222222222', 'trent@test.dev', crypt('x', gen_salt('bf')), now(), '{"display_name":"Trent"}'),
  ('33333333-3333-3333-3333-333333333333', 'garrett@test.dev', crypt('x', gen_salt('bf')), now(), '{"display_name":"Garrett"}');

insert into public.leagues (id, name, commissioner_id)
values ('44444444-4444-4444-4444-444444444444', 'Test League', '11111111-1111-1111-1111-111111111111');

insert into public.league_members (league_id, user_id, role) values
  ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111', 'commissioner'),
  ('44444444-4444-4444-4444-444444444444', '22222222-2222-2222-2222-222222222222', 'member'),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 'member');

insert into public.auctions (id, league_id, status, ends_at, starting_bid, bid_increment)
values (
  '55555555-5555-5555-5555-555555555555',
  '44444444-4444-4444-4444-444444444444',
  'open',
  now() + interval '1 day',
  1,
  1
);

insert into public.draft_slots (auction_id, slot_number)
select '55555555-5555-5555-5555-555555555555', n from generate_series(1, 2) n;

-- Helper: impersonate a user for the rest of the transaction the way
-- PostgREST/Supabase does (a local `request.jwt.claims` setting read by
-- auth.uid()).
create or replace function test_auth_as(p_user_id uuid) returns void as $$
  select set_config('request.jwt.claims', json_build_object('sub', p_user_id::text)::text, true);
$$ language sql;

-- ----------------------------------------------------------------------------
-- 1. First bid on a slot must meet the starting bid.
-- ----------------------------------------------------------------------------
select test_auth_as('22222222-2222-2222-2222-222222222222');
select lives_ok(
  $$ select place_bid('55555555-5555-5555-5555-555555555555', 1, 1) $$,
  'first bid at the starting bid is accepted'
);

select is(
  (select current_bid from draft_slots where auction_id = '55555555-5555-5555-5555-555555555555' and slot_number = 1),
  1::numeric,
  'slot now shows the starting bid as current_bid'
);

-- ----------------------------------------------------------------------------
-- 2. Bid below the required minimum is rejected.
-- ----------------------------------------------------------------------------
select test_auth_as('33333333-3333-3333-3333-333333333333');
select throws_like(
  $$ select place_bid('55555555-5555-5555-5555-555555555555', 1, 1) $$,
  'BID_TOO_LOW:%',
  'bid equal to current bid (below min increment) is rejected'
);

-- ----------------------------------------------------------------------------
-- 3. A valid higher bid is accepted and becomes the new leader.
-- ----------------------------------------------------------------------------
select lives_ok(
  $$ select place_bid('55555555-5555-5555-5555-555555555555', 1, 2) $$,
  'valid higher bid (meets increment) is accepted'
);
select is(
  (select current_winner_id from draft_slots where auction_id = '55555555-5555-5555-5555-555555555555' and slot_number = 1),
  '33333333-3333-3333-3333-333333333333'::uuid,
  'garrett is now the leader after outbidding'
);

-- ----------------------------------------------------------------------------
-- 4. A user cannot bid against themselves while already leading.
-- ----------------------------------------------------------------------------
select throws_like(
  $$ select place_bid('55555555-5555-5555-5555-555555555555', 1, 3) $$,
  'ALREADY_LEADING:%',
  'the current leader cannot raise their own leading bid'
);

-- ----------------------------------------------------------------------------
-- 5. A member cannot place a bid on another user's behalf: place_bid always
-- attributes the bid to auth.uid(), never a client-supplied id, so there is
-- no parameter through which to even attempt this — verify the inserted row
-- is stamped with the caller, not anyone else.
-- ----------------------------------------------------------------------------
select test_auth_as('22222222-2222-2222-2222-222222222222');
select place_bid('55555555-5555-5555-5555-555555555555', 1, 3);
select is(
  (select user_id from bids where draft_slot_id = (select id from draft_slots where auction_id='55555555-5555-5555-5555-555555555555' and slot_number=1) order by created_at desc limit 1),
  '22222222-2222-2222-2222-222222222222'::uuid,
  'the inserted bid is always attributed to auth.uid(), regardless of any other id'
);

-- ----------------------------------------------------------------------------
-- 6. Bid after the auction has closed is rejected.
-- ----------------------------------------------------------------------------
update auctions set status = 'closed' where id = '55555555-5555-5555-5555-555555555555';
select test_auth_as('33333333-3333-3333-3333-333333333333');
select throws_like(
  $$ select place_bid('55555555-5555-5555-5555-555555555555', 1, 10) $$,
  'AUCTION_CLOSED:%',
  'bid after auction closed is rejected'
);

-- ----------------------------------------------------------------------------
-- 7. Bid while auction is paused is rejected.
-- ----------------------------------------------------------------------------
update auctions set status = 'paused' where id = '55555555-5555-5555-5555-555555555555';
select throws_like(
  $$ select place_bid('55555555-5555-5555-5555-555555555555', 1, 10) $$,
  'AUCTION_PAUSED:%',
  'bid while auction is paused is rejected'
);
update auctions set status = 'open' where id = '55555555-5555-5555-5555-555555555555';

-- ----------------------------------------------------------------------------
-- 8. Anti-snipe: a valid bid inside the trigger window extends ends_at.
-- ----------------------------------------------------------------------------
update auctions
set ends_at = now() + interval '30 seconds',
    anti_snipe_enabled = true,
    anti_snipe_window_seconds = 120,
    anti_snipe_extension_seconds = 120
where id = '55555555-5555-5555-5555-555555555555';

select test_auth_as('22222222-2222-2222-2222-222222222222');
select place_bid('55555555-5555-5555-5555-555555555555', 2, 1);

select ok(
  (select ends_at from auctions where id = '55555555-5555-5555-5555-555555555555') > now() + interval '100 seconds',
  'a bid inside the anti-snipe window extends the whole auction end time'
);

-- ----------------------------------------------------------------------------
-- 9. A normal user cannot perform a commissioner-only action.
-- ----------------------------------------------------------------------------
select throws_like(
  $$ select set_auction_status('55555555-5555-5555-5555-555555555555', 'closed') $$,
  'FORBIDDEN:%',
  'a regular member cannot change auction status'
);

-- ----------------------------------------------------------------------------
-- 10. The commissioner CAN perform the same action.
-- ----------------------------------------------------------------------------
select test_auth_as('11111111-1111-1111-1111-111111111111');
select lives_ok(
  $$ select set_auction_status('55555555-5555-5555-5555-555555555555', 'closed') $$,
  'the commissioner can change auction status'
);

-- ----------------------------------------------------------------------------
-- 11 & 12. Final draft assignment prevents duplicate users / duplicate slots.
-- ----------------------------------------------------------------------------
select draft_assign('55555555-5555-5555-5555-555555555555', 1, '33333333-3333-3333-3333-333333333333', 3);

select throws_like(
  $$ select draft_assign('55555555-5555-5555-5555-555555555555', 2, '33333333-3333-3333-3333-333333333333', 1) $$,
  'USER_ALREADY_ASSIGNED:%',
  'a user who already has a draft position cannot be assigned a second one'
);

select throws_like(
  $$ select draft_assign('55555555-5555-5555-5555-555555555555', 1, '22222222-2222-2222-2222-222222222222', 1) $$,
  'SLOT_ALREADY_ASSIGNED:%',
  'a slot that is already assigned cannot be assigned to someone else'
);

select * from finish();
rollback;
