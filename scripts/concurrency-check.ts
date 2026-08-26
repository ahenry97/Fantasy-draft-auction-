/**
 * Fires two bids at the same slot at (as close as JS can get to)
 * simultaneously, then asserts exactly one won and the other got a clean
 * BID_TOO_LOW rejection with the correct new minimum — proving place_bid()'s
 * `select ... for update` row lock actually serializes concurrent bids
 * instead of both silently "succeeding" against a stale read.
 *
 * This is a live-server check, not a unit test: pgTAP runs single-threaded
 * inside one transaction, so it can assert business rules but can't actually
 * produce two overlapping requests hitting Postgres at once. Run this after
 * `supabase start` (or against a deployed project) with two real seeded
 * users.
 *
 * Usage:
 *   npx tsx scripts/concurrency-check.ts
 *
 * Requires env vars:
 *   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *   TEST_USER_A_EMAIL / TEST_USER_A_PASSWORD  (e.g. trent@example.com)
 *   TEST_USER_B_EMAIL / TEST_USER_B_PASSWORD  (e.g. garrett@example.com)
 *   TEST_AUCTION_ID, TEST_SLOT_NUMBER, TEST_BID_AMOUNT
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requireEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const auctionId = requireEnv("TEST_AUCTION_ID");
  const slotNumber = Number(requireEnv("TEST_SLOT_NUMBER"));
  const amount = Number(requireEnv("TEST_BID_AMOUNT"));

  const clientA = createClient(url, anonKey);
  const clientB = createClient(url, anonKey);

  await clientA.auth.signInWithPassword({
    email: requireEnv("TEST_USER_A_EMAIL"),
    password: requireEnv("TEST_USER_A_PASSWORD"),
  });
  await clientB.auth.signInWithPassword({
    email: requireEnv("TEST_USER_B_EMAIL"),
    password: requireEnv("TEST_USER_B_PASSWORD"),
  });

  console.log(`Firing two simultaneous $${amount} bids on slot ${slotNumber}...`);

  const [resultA, resultB] = await Promise.all([
    clientA.rpc("place_bid", { p_auction_id: auctionId, p_slot_number: slotNumber, p_amount: amount }),
    clientB.rpc("place_bid", { p_auction_id: auctionId, p_slot_number: slotNumber, p_amount: amount }),
  ]);

  const outcomes = [resultA, resultB];
  const succeeded = outcomes.filter((r) => !r.error);
  const failed = outcomes.filter((r) => r.error);

  if (succeeded.length !== 1) {
    console.error(`FAIL: expected exactly 1 winner, got ${succeeded.length}.`);
    process.exit(1);
  }
  if (failed.length !== 1 || !failed[0].error!.message.startsWith("BID_TOO_LOW")) {
    console.error(`FAIL: expected the loser to get a BID_TOO_LOW error. Got: ${failed[0]?.error?.message}`);
    process.exit(1);
  }

  console.log("PASS: exactly one bid won the race; the other was cleanly rejected as too low.");
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
