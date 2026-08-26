# Draft Auction

A private, mobile-friendly web app for a fantasy football league to auction
off **draft slot positions** (not players) before the real draft. League
members bid real dollars on whichever pick number they want; the commissioner
resolves the final order once bidding closes.

Built with Next.js (App Router) + TypeScript + Tailwind + Supabase
(Postgres, Auth, Realtime).

## How resolution actually works (read this before running an auction)

Bidding on each of the 12 slots is independent — the same person can be the
top bidder on several slots at once. When the auction closes:

1. Each slot's **outright winner** is whoever has the single highest valid
   bid on it.
2. If someone won more than one slot, they **keep exactly one** (their
   choice) and **force the rest onto members who won zero slots**
   ("unclaimed" members).
3. If two people who each won extra slots want to force the same unclaimed
   person, it comes down to bid amount on the specific slot in question —
   the app shows you the full bid hierarchy for every slot so you can apply
   that rule yourself; it does not try to auto-resolve that particular
   conflict, since it's a judgment call between two specific numbers, not a
   fixed formula.

This all happens on the commissioner-only **Resolve Draft Order** screen
(`/admin/resolve`). Nothing here is automatic beyond "assign this slot to
this person" — the app enforces the two hard invariants (one slot per
person, one person per slot) but every keep/force decision is a deliberate
click.

## Prerequisites

- Node.js 20+
- A free [Supabase](https://supabase.com) project (or the Supabase CLI for
  local development)
- The [Supabase CLI](https://supabase.com/docs/guides/cli) if you want to
  run this locally with `supabase start`

## 1. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) → **New
   project**.
2. Once it's provisioned, go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key

## 2. Environment variables

```bash
cp .env.example .env.local
```

Fill in:

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

(The other variables in `.env.example` are only used by
`scripts/concurrency-check.ts` — see Testing below.)

## 3. Run the database migrations

The schema, RLS policies, and all bidding/commissioner functions live in
`supabase/migrations/`, in order:

| File | What it does |
|---|---|
| `0001_schema.sql` | Tables, constraints, indexes |
| `0002_rls.sql` | Row Level Security — locks down every table to read-only for members except through the functions below |
| `0003_functions.sql` | `place_bid()` and every commissioner action, all `SECURITY DEFINER` and re-checking `auth.uid()` themselves |
| `0004_realtime.sql` | Adds the live tables to the Realtime publication |

**Option A — local development (recommended for hacking on this):**

```bash
supabase start          # spins up local Postgres + Auth + Realtime + Studio
supabase db reset       # applies all migrations AND supabase/seed.sql
```

`supabase start` prints a local API URL and anon key — put those in
`.env.local` instead of a hosted project's.

**Option B — a hosted Supabase project:**

```bash
supabase link --project-ref your-project-ref
supabase db push
```

This applies the migrations but **not** the seed data (seeding creates fake
auth users directly, which you generally don't want on a real project — see
below).

## 4. Seed data (local/dev only)

`supabase/seed.sql` creates 12 demo accounts (Matt, Trent, Garrett, Connor,
Alex, Brian, Casey, Derek, Evan, Finn, Grant, Hunter — all password
`password123`), one league (Matt is commissioner), and one **open** auction
with 12 slots and a few example bids already in.

Run it with `supabase db reset` (local only — it inserts directly into
`auth.users`, which only works against your own local Postgres, not a
hosted project's managed auth).

For a real league, skip the seed script and just have everyone sign up for
real through `/signup` — see "First commissioner account" below.

## 5. Run locally

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`. If you seeded data, sign in as
`matt@example.com` / `password123` to see the commissioner view, or any of
the other seeded emails for a member view.

## 6. Creating the first commissioner account (real league, not seeded)

The schema supports multiple leagues, but v1's sign-up flow auto-joins
whichever single league exists in the database — there's no UI for creating
a league yet. To stand up a real league:

1. Have **one** person sign up through `/signup` first — this becomes the
   only account in the system for a moment.
2. In Supabase Studio (or `psql`), run:
   ```sql
   insert into public.leagues (name, commissioner_id)
   values ('Your League Name', '<that user''s id from auth.users>');

   insert into public.league_members (league_id, user_id, role)
   values ('<the league id just created>', '<that user''s id>', 'commissioner');
   ```
3. Everyone else can now sign up normally through `/signup` —
   `join_only_league()` auto-attaches them as `member` since there's now
   exactly one league.
4. Also insert an `auctions` row (and 12 `draft_slots` rows via
   `generate_series`, same pattern as `seed.sql`) for the league — there's no
   "create auction" UI yet either; do this once per season the same way.

This is a deliberate v1 simplification — see "Important implementation
philosophy" in the original spec. A proper league/auction creation UI is the
natural next thing to build.

## 7. Deploying to Vercel

1. Push this repo to GitHub.
2. [Import it into Vercel](https://vercel.com/new).
3. Add the two `NEXT_PUBLIC_SUPABASE_*` environment variables in the Vercel
   project settings (same values as `.env.local`, pointed at your **hosted**
   Supabase project, not local).
4. Deploy. No other configuration needed — this is a standard Next.js App
   Router app.
5. In your Supabase project's **Auth → URL Configuration**, add your Vercel
   deployment URL to the allowed redirect URLs.

## Troubleshooting Supabase Realtime

- **Bids aren't showing up live for other users.** Confirm
  `supabase/migrations/0004_realtime.sql` actually ran — in Supabase Studio,
  go to **Database → Replication** and confirm `draft_slots`, `bids`,
  `auctions`, and `draft_assignments` are listed under the
  `supabase_realtime` publication.
- **Realtime works locally but not on the hosted project.** Hosted projects
  need Realtime enabled per-table the same way — `supabase db push` should
  have applied `0004_realtime.sql`, but double check under Replication in
  Studio.
- **A user doesn't see updates for a league they're not in.** That's
  expected — Realtime payloads are filtered through the same RLS policies as
  normal reads, so someone only receives changes for rows they could
  `SELECT` anyway.
- **Nothing updates and the browser console shows a WebSocket error.** Some
  corporate networks/VPNs block WebSocket upgrades. If it's fully blocked,
  users will need a different network.

## Resetting an auction for next season

1. As commissioner, on `/admin`, set the existing auction's status to
   `closed` if it isn't already (this is mostly cosmetic once a new auction
   exists, but keeps old data clearly separated).
2. Insert a **new** `auctions` row for the league (new `id`, fresh
   `ends_at`, whatever `starting_bid`/`bid_increment`/anti-snipe settings you
   want) and a fresh set of 12 `draft_slots` for it — same pattern as
   `seed.sql`'s auction/slot inserts. The app always shows the
   **most-recently-created** auction for a league, so the new one takes over
   automatically once inserted.
3. Old bids, slots, and the finalized draft order from the previous season
   stay in the database, scoped to the old `auction_id` — nothing is
   deleted. (A "past seasons" browsing UI isn't built yet; the data is all
   there if you want to query it directly.)

There's no in-app "start new season" button in v1 — this is a deliberate
simplification for a ~12-person league doing this once a year.

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run test         # vitest — pure logic (bid ranking, RPC error parsing)
```

**Database-level tests** (bid integrity, permissions, race conditions) live
in `supabase/tests/place_bid.test.sql` and run via the Supabase CLI's pgTAP
integration:

```bash
supabase test db
```

This covers: first bid at the minimum, a bid below minimum being rejected, a
valid higher bid being accepted, a user unable to bid against their own
leading bid, every bid being attributed to `auth.uid()` regardless of any
other input, bids rejected after close/while paused, the anti-snipe
extension actually firing, a regular member being blocked from a
commissioner-only action while the commissioner succeeds at the same call,
and duplicate-user/duplicate-slot draft assignment both being rejected.

**Concurrent bidding** (two users racing for the same slot) can't be
expressed inside a single pgTAP transaction, since pgTAP runs serially. Use
`scripts/concurrency-check.ts` against a running instance (local or
deployed) to fire two real simultaneous requests and confirm exactly one
wins:

```bash
npx tsx scripts/concurrency-check.ts
```

See the comment at the top of that file for the required environment
variables. This is what actually proves the `select ... for update` row lock
in `place_bid()` prevents both of two simultaneous $10 bids from "winning."

## Project structure

```
src/
  app/
    (app)/              # authenticated routes, share the Nav layout
      auction/           # main realtime bidding board
      my-bids/           # personal winning/outbid/activity dashboard
      draft-order/        # shareable finalized order
      admin/              # commissioner controls
      admin/resolve/       # keep/force draft-order resolution
      profile/
    login/, signup/, no-league/    # unauthenticated routes
  components/            # one file per UI piece; RPC calls live in the
                          # client components that trigger them
  lib/
    supabase/             # browser/server/middleware Supabase clients
    league-context.ts     # single server-side data loader for the v1
                           # single-league assumption
    standings.ts           # pure bid-ranking logic (unit tested)
    format.ts
  types/domain.ts          # types mirroring the DB schema + RPC error codes
supabase/
  migrations/              # schema, RLS, functions, realtime — run in order
  seed.sql                  # local dev only
  tests/place_bid.test.sql  # pgTAP integration tests
scripts/concurrency-check.ts
```

## Design decisions worth knowing about

- **All bid math happens in one Postgres function** (`place_bid`), which
  takes `select ... for update` on the parent `auctions` row before touching
  anything else. That serializes all bids across the *whole* auction, not
  just per-slot — a deliberate simplification since this is built for
  roughly a dozen friends, not a public auction site. It also means the
  anti-snipe extension (which also touches the `auctions` row) can never
  race against a bid.
- **RLS has almost no client-facing write policies.** Every mutation that
  matters goes through a `SECURITY DEFINER` function that re-checks
  `auth.uid()` and, for commissioner actions, `is_commissioner()` itself.
  Hiding a button in the UI is not what enforces any permission here.
- **"Second-highest bidder"** means second-highest *distinct person*, not
  the second row in the bids table — someone raising their own bid twice
  doesn't count as two bidders. See `rankSlotBidders` in
  `src/lib/standings.ts`.
- **Draft-order resolution is keep-one/force-the-rest, not an automatic
  cascade.** A multi-slot winner picks which slot to keep and manually
  forces the others onto members who won nothing — there's no "next highest
  bidder inherits the leftover slot" logic, because that's not how this
  league's rules work.
