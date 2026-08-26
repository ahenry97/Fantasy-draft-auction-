"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatMoney, formatTime } from "@/lib/format";
import { parseRpcError, type Auction, type Bid, type DraftSlot, type Profile } from "@/types/domain";

interface SlotCardProps {
  slot: DraftSlot;
  auction: Auction;
  bids: Bid[]; // all bids for this slot, newest first
  profilesById: Record<string, Profile>;
  currentUserId: string;
  canBid: boolean;
  justUpdated: boolean;
}

export function SlotCard({
  slot,
  auction,
  bids,
  profilesById,
  currentUserId,
  canBid,
  justUpdated,
}: SlotCardProps) {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [placing, setPlacing] = useState(false);

  const minNext = useMemo(() => {
    return slot.current_bid === null || slot.current_bid === undefined
      ? Number(auction.starting_bid)
      : Number(slot.current_bid) + Number(auction.bid_increment);
  }, [slot.current_bid, auction.starting_bid, auction.bid_increment]);

  const [customAmount, setCustomAmount] = useState<string>("");
  const isWinning = slot.current_winner_id === currentUserId;
  const wasOutbid = useMemo(
    () => !isWinning && bids.some((b) => b.user_id === currentUserId && !b.invalidated_at),
    [bids, isWinning, currentUserId]
  );

  const leaderName = slot.current_winner_id
    ? profilesById[slot.current_winner_id]?.display_name ?? "Unknown"
    : null;

  const validBidCount = bids.filter((b) => !b.invalidated_at).length;
  const visibleHistory = bids.filter((b) => !b.invalidated_at).slice(0, historyOpen ? 10 : 3);

  async function placeBid(amount: number) {
    if (placing) return;
    setPlacing(true);
    const supabase = createClient();
    const { error } = await supabase.rpc("place_bid", {
      p_auction_id: auction.id,
      p_slot_number: slot.slot_number,
      p_amount: amount,
    });
    setPlacing(false);

    if (error) {
      const { code, message } = parseRpcError(error);
      if (code === "BID_TOO_LOW") {
        toast.error(`Too slow — the minimum just changed. ${message}`);
      } else if (code === "ALREADY_LEADING") {
        toast.info(message);
      } else {
        toast.error(message);
      }
      return;
    }

    toast.success(`Bid $${amount} placed on Pick ${slot.slot_number}`);
    setCustomAmount("");
  }

  const auctionActive = auction.status === "open";

  return (
    <div
      className={`rounded-2xl border border-border bg-surface p-4 shadow-sm transition-colors ${
        justUpdated ? "animate-flash" : ""
      } ${isWinning ? "ring-2 ring-winning" : wasOutbid ? "ring-2 ring-outbid/60" : ""}`}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-muted">Pick</div>
          <div className="text-3xl font-extrabold leading-none">{slot.slot_number}</div>
        </div>
        {isWinning && (
          <span className="rounded-full bg-winning/15 px-2.5 py-1 text-xs font-semibold text-winning">
            You are winning
          </span>
        )}
        {wasOutbid && (
          <span className="rounded-full bg-outbid/15 px-2.5 py-1 text-xs font-semibold text-outbid">
            You were outbid
          </span>
        )}
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <div className="text-xs text-muted">Current bid</div>
          <div className="text-2xl font-bold">{formatMoney(slot.current_bid)}</div>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted">Leader</div>
          <div className="font-medium">{leaderName ?? "No bids yet"}</div>
        </div>
      </div>

      <div className="mt-1 text-xs text-muted">
        {validBidCount} {validBidCount === 1 ? "bid" : "bids"} · min next {formatMoney(minNext)}
      </div>

      {canBid && (
        <div className="mt-3 flex gap-2">
          <button
            disabled={!auctionActive || placing || isWinning}
            onClick={() => placeBid(minNext)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-accent px-3 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            {placing ? <Loader2 size={16} className="animate-spin" /> : `Bid ${formatMoney(minNext)}`}
          </button>
          <input
            type="number"
            min={minNext}
            step="0.01"
            placeholder="Custom"
            value={customAmount}
            onChange={(e) => setCustomAmount(e.target.value)}
            disabled={!auctionActive || placing || isWinning}
            className="w-24 rounded-xl border border-border bg-surface-2 px-2 py-2.5 text-sm outline-none focus:ring-2 focus:ring-accent disabled:opacity-40"
          />
          <button
            disabled={!auctionActive || placing || isWinning || !customAmount}
            onClick={() => placeBid(Number(customAmount))}
            className="rounded-xl border border-border px-3 py-2.5 text-sm font-medium disabled:opacity-40"
          >
            Bid
          </button>
        </div>
      )}

      {bids.length > 0 && (
        <div className="mt-3 border-t border-border pt-2">
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex w-full items-center justify-between text-xs font-medium text-muted"
          >
            Bid history
            {historyOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <ul className="mt-1.5 flex flex-col gap-1">
            {visibleHistory.map((b) => (
              <li key={b.id} className="flex justify-between text-xs">
                <span className="text-foreground">
                  {profilesById[b.user_id]?.display_name ?? "Unknown"}
                </span>
                <span className="text-muted">
                  {formatMoney(b.amount)} · {formatTime(b.created_at)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
