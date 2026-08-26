-- ============================================================================
-- seed.sql
-- Development-only seed data: 12 demo members, one league, one OPEN auction
-- with 12 slots and a handful of example bids so the UI is immediately
-- testable. Run with `supabase db reset` (local) — never against production.
--
-- All demo accounts use the password: password123
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 12 demo auth users (inserted directly into auth.users, the standard way to
-- seed local Supabase auth). The on_auth_user_created trigger creates the
-- matching public.profiles row automatically for each one.
-- ----------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token
)
values
  ('00000000-0000-0000-0000-000000000000', '0a9a7f12-a07b-4842-bc5a-e3542d6e5c4d', 'authenticated', 'authenticated', 'matt@example.com',    crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Matt"}',    false, ''),
  ('00000000-0000-0000-0000-000000000000', '30c7dba8-a443-42ad-9029-d791073cbaab', 'authenticated', 'authenticated', 'trent@example.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Trent"}',   false, ''),
  ('00000000-0000-0000-0000-000000000000', '21d2f0e5-241a-4478-9db6-62bd9c141959', 'authenticated', 'authenticated', 'garrett@example.com', crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Garrett"}', false, ''),
  ('00000000-0000-0000-0000-000000000000', 'cc54a1ca-8407-47c3-8694-212386f4f4f1', 'authenticated', 'authenticated', 'connor@example.com',  crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Connor"}',  false, ''),
  ('00000000-0000-0000-0000-000000000000', '6404f094-05be-40c7-a263-d02a05688f6c', 'authenticated', 'authenticated', 'alex@example.com',    crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Alex"}',    false, ''),
  ('00000000-0000-0000-0000-000000000000', 'd6646bf3-b046-49c7-9f50-c6b07b8f4431', 'authenticated', 'authenticated', 'brian@example.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Brian"}',   false, ''),
  ('00000000-0000-0000-0000-000000000000', 'a43b540f-09c4-460b-ab7f-86475cfd3f02', 'authenticated', 'authenticated', 'casey@example.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Casey"}',   false, ''),
  ('00000000-0000-0000-0000-000000000000', '3d38a4ae-cbbc-414c-8dd2-fb7201dcd4ea', 'authenticated', 'authenticated', 'derek@example.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Derek"}',   false, ''),
  ('00000000-0000-0000-0000-000000000000', 'e449f927-932f-4018-9bda-c74362cf401d', 'authenticated', 'authenticated', 'evan@example.com',    crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Evan"}',    false, ''),
  ('00000000-0000-0000-0000-000000000000', '3d83b681-23ca-4c7c-a8a4-0d879cf8b614', 'authenticated', 'authenticated', 'finn@example.com',    crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Finn"}',    false, ''),
  ('00000000-0000-0000-0000-000000000000', '0ef0a333-3363-491e-b96f-2193edde636e', 'authenticated', 'authenticated', 'grant@example.com',   crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Grant"}',   false, ''),
  ('00000000-0000-0000-0000-000000000000', '34ba3342-c363-4108-bd29-2567055e96c9', 'authenticated', 'authenticated', 'hunter@example.com',  crypt('password123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{"display_name":"Hunter"}',  false, '')
on conflict (id) do nothing;

-- Matching identities rows (needed for email/password sign-in on some
-- Supabase versions).
insert into auth.identities (
  id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at
)
select gen_random_uuid(), id::text, id,
       jsonb_build_object('sub', id::text, 'email', email),
       'email', now(), now(), now()
from auth.users
where id in (
  '0a9a7f12-a07b-4842-bc5a-e3542d6e5c4d','30c7dba8-a443-42ad-9029-d791073cbaab',
  '21d2f0e5-241a-4478-9db6-62bd9c141959','cc54a1ca-8407-47c3-8694-212386f4f4f1',
  '6404f094-05be-40c7-a263-d02a05688f6c','d6646bf3-b046-49c7-9f50-c6b07b8f4431',
  'a43b540f-09c4-460b-ab7f-86475cfd3f02','3d38a4ae-cbbc-414c-8dd2-fb7201dcd4ea',
  'e449f927-932f-4018-9bda-c74362cf401d','3d83b681-23ca-4c7c-a8a4-0d879cf8b614',
  '0ef0a333-3363-491e-b96f-2193edde636e','34ba3342-c363-4108-bd29-2567055e96c9'
)
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- League + membership (Matt is commissioner)
-- ----------------------------------------------------------------------------
insert into public.leagues (id, name, commissioner_id)
values ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', 'The League', '0a9a7f12-a07b-4842-bc5a-e3542d6e5c4d')
on conflict (id) do nothing;

insert into public.league_members (league_id, user_id, role)
values
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '0a9a7f12-a07b-4842-bc5a-e3542d6e5c4d', 'commissioner'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '30c7dba8-a443-42ad-9029-d791073cbaab', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '21d2f0e5-241a-4478-9db6-62bd9c141959', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', 'cc54a1ca-8407-47c3-8694-212386f4f4f1', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '6404f094-05be-40c7-a263-d02a05688f6c', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', 'd6646bf3-b046-49c7-9f50-c6b07b8f4431', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', 'a43b540f-09c4-460b-ab7f-86475cfd3f02', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '3d38a4ae-cbbc-414c-8dd2-fb7201dcd4ea', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', 'e449f927-932f-4018-9bda-c74362cf401d', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '3d83b681-23ca-4c7c-a8a4-0d879cf8b614', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '0ef0a333-3363-491e-b96f-2193edde636e', 'member'),
  ('fdde2db0-3671-4b67-bf43-88a9a9b85bac', '34ba3342-c363-4108-bd29-2567055e96c9', 'member')
on conflict do nothing;

-- ----------------------------------------------------------------------------
-- One open auction, ending 3 days from now, 12 slots
-- ----------------------------------------------------------------------------
insert into public.auctions (
  id, league_id, status, starts_at, ends_at, starting_bid, bid_increment,
  anti_snipe_enabled, anti_snipe_window_seconds, anti_snipe_extension_seconds, slot_count
)
values (
  'cec236cc-6dd3-4d8e-be2a-99374493da7b',
  'fdde2db0-3671-4b67-bf43-88a9a9b85bac',
  'open',
  now(),
  now() + interval '3 days',
  1,
  1,
  true,
  120,
  120,
  12
)
on conflict (id) do nothing;

insert into public.draft_slots (auction_id, slot_number)
select 'cec236cc-6dd3-4d8e-be2a-99374493da7b', n
from generate_series(1, 12) as n
on conflict (auction_id, slot_number) do nothing;

-- ----------------------------------------------------------------------------
-- Example bids on the first few slots so the UI has data to show right away.
-- Inserted directly (not via place_bid) since this is trusted seed data; the
-- final current_bid/current_winner_id update below mirrors what place_bid
-- would have left behind.
-- ----------------------------------------------------------------------------
do $$
declare
  v_auction uuid := 'cec236cc-6dd3-4d8e-be2a-99374493da7b';
  v_matt    uuid := '0a9a7f12-a07b-4842-bc5a-e3542d6e5c4d';
  v_trent   uuid := '30c7dba8-a443-42ad-9029-d791073cbaab';
  v_garrett uuid := '21d2f0e5-241a-4478-9db6-62bd9c141959';
  v_connor  uuid := 'cc54a1ca-8407-47c3-8694-212386f4f4f1';
  v_slot1 uuid; v_slot2 uuid; v_slot3 uuid; v_slot4 uuid;
begin
  select id into v_slot1 from public.draft_slots where auction_id = v_auction and slot_number = 1;
  select id into v_slot2 from public.draft_slots where auction_id = v_auction and slot_number = 2;
  select id into v_slot3 from public.draft_slots where auction_id = v_auction and slot_number = 3;
  select id into v_slot4 from public.draft_slots where auction_id = v_auction and slot_number = 4;

  -- Pick 1: Trent leads at $9, over Garrett's $8 and $7
  insert into public.bids (auction_id, draft_slot_id, user_id, amount, created_at) values
    (v_auction, v_slot1, v_garrett, 7, now() - interval '20 minutes'),
    (v_auction, v_slot1, v_trent,   8, now() - interval '15 minutes'),
    (v_auction, v_slot1, v_garrett, 8, now() - interval '10 minutes'),
    (v_auction, v_slot1, v_trent,   9, now() - interval '5 minutes');
  update public.draft_slots set current_bid = 9, current_winner_id = v_trent where id = v_slot1;

  -- Pick 2: Matt leads at $4
  insert into public.bids (auction_id, draft_slot_id, user_id, amount, created_at) values
    (v_auction, v_slot2, v_connor, 2, now() - interval '30 minutes'),
    (v_auction, v_slot2, v_matt,   4, now() - interval '12 minutes');
  update public.draft_slots set current_bid = 4, current_winner_id = v_matt where id = v_slot2;

  -- Pick 3: Garrett leads at $18 (a contested, expensive slot)
  insert into public.bids (auction_id, draft_slot_id, user_id, amount, created_at) values
    (v_auction, v_slot3, v_matt,    12, now() - interval '40 minutes'),
    (v_auction, v_slot3, v_trent,   14, now() - interval '35 minutes'),
    (v_auction, v_slot3, v_garrett, 18, now() - interval '3 minutes');
  update public.draft_slots set current_bid = 18, current_winner_id = v_garrett where id = v_slot3;

  -- Pick 4: no bids yet — left untouched to show the "no bids" state.
  perform v_slot4;
end $$;
