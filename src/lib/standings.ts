import type { Bid } from "@/types/domain";

export interface SlotStanding {
  userId: string;
  bestBid: number;
  bestBidAt: string;
}

/**
 * Ranks each distinct bidder on a slot by their own best (highest, then
 * earliest-at-that-amount) valid bid — not by raw bid rows, since one user
 * can appear many times as they raise their own bid. This is what "second
 * highest bidder" means throughout the resolve screen: the second-highest
 * *person*, not the second row in the ledger.
 */
export function rankSlotBidders(bids: Bid[], draftSlotId: string): SlotStanding[] {
  const bestByUser = new Map<string, SlotStanding>();

  for (const bid of bids) {
    if (bid.draft_slot_id !== draftSlotId) continue;
    if (bid.invalidated_at) continue;

    const existing = bestByUser.get(bid.user_id);
    if (!existing || bid.amount > existing.bestBid) {
      bestByUser.set(bid.user_id, {
        userId: bid.user_id,
        bestBid: bid.amount,
        bestBidAt: bid.created_at,
      });
    }
  }

  return Array.from(bestByUser.values()).sort((a, b) => {
    if (b.bestBid !== a.bestBid) return b.bestBid - a.bestBid;
    // Tie-break: whoever reached that amount first ranks higher.
    return new Date(a.bestBidAt).getTime() - new Date(b.bestBidAt).getTime();
  });
}

/**
 * Per-slot outright winner (top bidder), independent of any other slot.
 * League rule: bids aren't mutually exclusive during the auction, so one
 * person can be the top bidder on several slots at once — resolution is a
 * manual keep-one/force-the-rest decision, not an automatic cascade to the
 * next-highest bidder. See ResolvePanel.
 */
export function topBidderForSlot(bids: Bid[], draftSlotId: string): SlotStanding | null {
  const standings = rankSlotBidders(bids, draftSlotId);
  return standings[0] ?? null;
}
