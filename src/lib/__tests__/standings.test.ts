import { describe, it, expect } from "vitest";
import { rankSlotBidders, topBidderForSlot } from "@/lib/standings";
import type { Bid } from "@/types/domain";

function bid(overrides: Partial<Bid>): Bid {
  return {
    id: crypto.randomUUID(),
    auction_id: "auction-1",
    draft_slot_id: "slot-1",
    user_id: "user-a",
    amount: 1,
    created_at: new Date().toISOString(),
    invalidated_at: null,
    invalidated_by: null,
    ...overrides,
  };
}

describe("rankSlotBidders", () => {
  it("ranks by each user's own best bid, not raw rows", () => {
    const bids: Bid[] = [
      bid({ user_id: "garrett", amount: 7, created_at: "2026-01-01T00:00:00Z" }),
      bid({ user_id: "trent", amount: 8, created_at: "2026-01-01T00:01:00Z" }),
      bid({ user_id: "garrett", amount: 8, created_at: "2026-01-01T00:02:00Z" }),
      bid({ user_id: "trent", amount: 9, created_at: "2026-01-01T00:03:00Z" }),
    ];

    const standings = rankSlotBidders(bids, "slot-1");

    expect(standings).toHaveLength(2); // one row per distinct user
    expect(standings[0].userId).toBe("trent");
    expect(standings[0].bestBid).toBe(9);
    expect(standings[1].userId).toBe("garrett");
    expect(standings[1].bestBid).toBe(8);
  });

  it("ignores invalidated bids", () => {
    const bids: Bid[] = [
      bid({ user_id: "trent", amount: 20, invalidated_at: "2026-01-01T00:00:00Z" }),
      bid({ user_id: "garrett", amount: 5 }),
    ];

    const standings = rankSlotBidders(bids, "slot-1");

    expect(standings).toHaveLength(1);
    expect(standings[0].userId).toBe("garrett");
  });

  it("breaks ties by whoever reached the amount first", () => {
    const bids: Bid[] = [
      bid({ user_id: "trent", amount: 10, created_at: "2026-01-01T00:05:00Z" }),
      bid({ user_id: "garrett", amount: 10, created_at: "2026-01-01T00:01:00Z" }),
    ];

    const standings = rankSlotBidders(bids, "slot-1");

    expect(standings[0].userId).toBe("garrett");
    expect(standings[1].userId).toBe("trent");
  });

  it("only considers bids for the requested slot", () => {
    const bids: Bid[] = [
      bid({ user_id: "trent", amount: 50, draft_slot_id: "slot-2" }),
      bid({ user_id: "garrett", amount: 5, draft_slot_id: "slot-1" }),
    ];

    const standings = rankSlotBidders(bids, "slot-1");

    expect(standings).toHaveLength(1);
    expect(standings[0].userId).toBe("garrett");
  });
});

describe("topBidderForSlot", () => {
  it("returns the single highest bidder", () => {
    const bids: Bid[] = [bid({ user_id: "trent", amount: 9 }), bid({ user_id: "garrett", amount: 8 })];
    expect(topBidderForSlot(bids, "slot-1")?.userId).toBe("trent");
  });

  it("returns null when there are no valid bids", () => {
    const bids: Bid[] = [bid({ user_id: "trent", amount: 9, invalidated_at: "2026-01-01T00:00:00Z" })];
    expect(topBidderForSlot(bids, "slot-1")).toBeNull();
  });
});
