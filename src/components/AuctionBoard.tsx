"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CountdownTimer } from "@/components/CountdownTimer";
import { SlotCard } from "@/components/SlotCard";
import { formatMoney } from "@/lib/format";
import type { Auction, Bid, DraftSlot, Profile } from "@/types/domain";

interface AuctionBoardProps {
  initialAuction: Auction;
  initialSlots: DraftSlot[];
  initialBids: Bid[];
  profilesById: Record<string, Profile>;
  currentUserId: string;
  canBid: boolean;
  serverNowIso: string;
}

export function AuctionBoard({
  initialAuction,
  initialSlots,
  initialBids,
  profilesById,
  currentUserId,
  canBid,
  serverNowIso,
}: AuctionBoardProps) {
  const [auction, setAuction] = useState(initialAuction);
  const [slots, setSlots] = useState(initialSlots);
  const [bids, setBids] = useState(initialBids);
  const [recentlyUpdated, setRecentlyUpdated] = useState<Set<string>>(new Set());

  // Lazy initializer: React explicitly allows impure work here since it only
  // ever runs once per mount, unlike doing this directly in the render body.
  const [clockOffsetMs] = useState(() => Date.now() - new Date(serverNowIso).getTime());

  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`auction-${initialAuction.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "draft_slots", filter: `auction_id=eq.${initialAuction.id}` },
        (payload) => {
          const updated = payload.new as DraftSlot;
          setSlots((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
          setRecentlyUpdated((prev) => new Set(prev).add(updated.id));
          setTimeout(() => {
            setRecentlyUpdated((prev) => {
              const next = new Set(prev);
              next.delete(updated.id);
              return next;
            });
          }, 900);
        }
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "bids", filter: `auction_id=eq.${initialAuction.id}` },
        (payload) => {
          const inserted = payload.new as Bid;
          setBids((prev) => [inserted, ...prev]);
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "bids", filter: `auction_id=eq.${initialAuction.id}` },
        (payload) => {
          const updated = payload.new as Bid;
          setBids((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "auctions", filter: `id=eq.${initialAuction.id}` },
        (payload) => {
          const updated = payload.new as Auction;
          setAuction((prev) => {
            if (updated.ends_at !== prev.ends_at && updated.status === "open") {
              toast.info("Anti-snipe: the auction was extended.");
            }
            if (updated.status !== prev.status) {
              toast.info(`Auction is now ${updated.status}.`);
            }
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [initialAuction.id]);

  const sortedSlots = useMemo(
    () => [...slots].sort((a, b) => a.slot_number - b.slot_number),
    [slots]
  );

  const bidsBySlot = useMemo(() => {
    const map = new Map<string, Bid[]>();
    for (const b of bids) {
      const list = map.get(b.draft_slot_id) ?? [];
      list.push(b);
      map.set(b.draft_slot_id, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    return map;
  }, [bids]);

  const totalRevenue = sortedSlots.reduce((sum, s) => sum + (s.current_bid ?? 0), 0);

  return (
    <div>
      <div className="mb-5 rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-muted">
              {auction.status === "open"
                ? "Auction closes in"
                : auction.status === "paused"
                  ? "Auction paused"
                  : auction.status === "closed"
                    ? "Auction closed"
                    : "Auction not yet open"}
            </div>
            {auction.status === "open" ? (
              <CountdownTimer endsAt={auction.ends_at} clockOffsetMs={clockOffsetMs} />
            ) : (
              <div className="text-lg font-semibold capitalize">{auction.status}</div>
            )}
          </div>
          <div className="text-right text-sm text-muted">
            Total bid volume
            <div className="text-lg font-bold text-foreground">{formatMoney(totalRevenue)}</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sortedSlots.map((slot) => (
          <SlotCard
            key={slot.id}
            slot={slot}
            auction={auction}
            bids={bidsBySlot.get(slot.id) ?? []}
            profilesById={profilesById}
            currentUserId={currentUserId}
            canBid={canBid}
            justUpdated={recentlyUpdated.has(slot.id)}
          />
        ))}
      </div>
    </div>
  );
}
