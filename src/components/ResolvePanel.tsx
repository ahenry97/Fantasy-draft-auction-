"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatMoney } from "@/lib/format";
import { rankSlotBidders, topBidderForSlot } from "@/lib/standings";
import {
  parseRpcError,
  type Auction,
  type Bid,
  type DraftAssignment,
  type DraftSlot,
  type Profile,
} from "@/types/domain";

interface ResolvePanelProps {
  auction: Auction;
  slots: DraftSlot[];
  bids: Bid[];
  assignments: DraftAssignment[];
  profilesById: Record<string, Profile>;
}

export function ResolvePanel({ auction, slots, bids, assignments, profilesById }: ResolvePanelProps) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState<string | null>(null); // slot_number being acted on, as a string key
  const [forceTarget, setForceTarget] = useState<Record<number, string>>({});

  const sortedSlots = useMemo(() => [...slots].sort((a, b) => a.slot_number - b.slot_number), [slots]);

  const winnerBySlotNumber = useMemo(() => {
    const map = new Map<number, { userId: string; bestBid: number } | null>();
    for (const s of sortedSlots) {
      const winner = topBidderForSlot(bids, s.id);
      map.set(s.slot_number, winner ? { userId: winner.userId, bestBid: winner.bestBid } : null);
    }
    return map;
  }, [sortedSlots, bids]);

  const wonSlotsByUser = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const [slotNumber, winner] of winnerBySlotNumber) {
      if (!winner) continue;
      const list = map.get(winner.userId) ?? [];
      list.push(slotNumber);
      map.set(winner.userId, list);
    }
    return map;
  }, [winnerBySlotNumber]);

  const assignmentBySlotNumber = useMemo(() => {
    const map = new Map<number, DraftAssignment>();
    for (const a of assignments) map.set(a.slot_number, a);
    return map;
  }, [assignments]);

  const assignedUserIds = useMemo(() => new Set(assignments.map((a) => a.user_id)), [assignments]);

  const allMemberIds = Object.keys(profilesById);

  // "Unclaimed" per the league rule: won zero slots outright, and hasn't
  // already been handed a forced slot.
  const unclaimedMemberIds = useMemo(
    () => allMemberIds.filter((id) => !wonSlotsByUser.has(id) && !assignedUserIds.has(id)),
    [allMemberIds, wonSlotsByUser, assignedUserIds]
  );

  const totalSlots = sortedSlots.length;
  const allAssigned = assignments.length === totalSlots && totalSlots > 0;
  const totalRevenue = assignments.reduce((sum, a) => sum + Number(a.winning_bid), 0);

  async function assign(slotNumber: number, userId: string, winningBid: number) {
    setBusy(String(slotNumber));
    const { error } = await supabase.rpc("draft_assign", {
      p_auction_id: auction.id,
      p_slot_number: slotNumber,
      p_user_id: userId,
      p_winning_bid: winningBid,
    });
    setBusy(null);
    if (error) {
      toast.error(parseRpcError(error).message);
      return;
    }
    router.refresh();
  }

  async function unassign(slotNumber: number) {
    setBusy(String(slotNumber));
    const { error } = await supabase.rpc("draft_unassign", {
      p_auction_id: auction.id,
      p_slot_number: slotNumber,
    });
    setBusy(null);
    if (error) {
      toast.error(parseRpcError(error).message);
      return;
    }
    router.refresh();
  }

  async function finalize() {
    if (!confirm(`Finalize the draft order for all ${totalSlots} slots? This can be reopened later if needed.`))
      return;
    setBusy("finalize");
    const { error } = await supabase.rpc("draft_finalize", { p_auction_id: auction.id });
    setBusy(null);
    if (error) {
      toast.error(parseRpcError(error).message);
      return;
    }
    toast.success("Draft order finalized!");
    router.refresh();
  }

  async function reopen() {
    if (!confirm("Reopen the draft order for editing?")) return;
    setBusy("reopen");
    const { error } = await supabase.rpc("draft_reopen", { p_auction_id: auction.id });
    setBusy(null);
    if (error) {
      toast.error(parseRpcError(error).message);
      return;
    }
    router.refresh();
  }

  if (auction.draft_finalized_at) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-winning/40 bg-winning/10 p-4 text-center">
          <p className="font-semibold text-winning">Draft order is finalized.</p>
          <Link href="/draft-order" className="mt-1 inline-block text-sm underline">
            View the shareable page →
          </Link>
        </div>
        <button
          onClick={reopen}
          disabled={busy === "reopen"}
          className="rounded-xl border border-border px-4 py-2.5 text-sm font-medium disabled:opacity-50"
        >
          Reopen for editing
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 pb-8">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h1 className="text-lg font-semibold">Resolve Draft Order</h1>
        <p className="mt-1 text-sm text-muted">
          Each slot&apos;s outright winner is the top bidder. If someone won more than one slot, they
          keep exactly one and force the rest onto people who won zero slots.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <span>
            <strong className="text-foreground">{assignments.length}</strong>/{totalSlots} slots resolved
          </span>
          <span>
            <strong className="text-foreground">{unclaimedMemberIds.length}</strong> unclaimed member
            {unclaimedMemberIds.length === 1 ? "" : "s"} remaining
          </span>
        </div>
        {unclaimedMemberIds.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {unclaimedMemberIds.map((id) => (
              <span
                key={id}
                className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted"
              >
                {profilesById[id]?.display_name ?? "Unknown"}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {sortedSlots.map((slot) => {
          const winner = winnerBySlotNumber.get(slot.slot_number) ?? null;
          const assignment = assignmentBySlotNumber.get(slot.slot_number);
          const ownerWonCount = winner ? wonSlotsByUser.get(winner.userId)?.length ?? 0 : 0;
          const ownerHasKeptElsewhere = winner
            ? assignedUserIds.has(winner.userId) && assignment?.user_id !== winner.userId
            : false;
          const standings = rankSlotBidders(bids, slot.id).slice(0, 3);
          const isBusy = busy === String(slot.slot_number);

          return (
            <div key={slot.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs font-medium uppercase tracking-wide text-muted">Pick</div>
                  <div className="text-2xl font-extrabold leading-none">{slot.slot_number}</div>
                </div>
                <div className="text-right text-sm">
                  {winner ? (
                    <>
                      <div className="text-xs text-muted">Top bidder</div>
                      <div className="font-semibold">
                        {profilesById[winner.userId]?.display_name ?? "Unknown"}
                      </div>
                      <div className="text-xs text-muted">{formatMoney(winner.bestBid)}</div>
                    </>
                  ) : (
                    <div className="text-xs text-muted">No bids on this slot</div>
                  )}
                </div>
              </div>

              {standings.length > 1 && (
                <details className="mt-2 text-xs text-muted">
                  <summary className="cursor-pointer select-none">Full bid hierarchy</summary>
                  <ul className="mt-1 flex flex-col gap-0.5">
                    {standings.map((s, i) => (
                      <li key={s.userId} className="flex justify-between">
                        <span>
                          {i + 1}. {profilesById[s.userId]?.display_name ?? "Unknown"}
                        </span>
                        <span>{formatMoney(s.bestBid)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {assignment ? (
                <div className="mt-3 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
                  <div>
                    <span className="text-sm font-semibold">
                      → {profilesById[assignment.user_id]?.display_name ?? "Unknown"}
                    </span>
                    {winner && assignment.user_id !== winner.userId && (
                      <span className="ml-2 text-xs text-muted">
                        (forced from {profilesById[winner.userId]?.display_name})
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => unassign(slot.slot_number)}
                    disabled={isBusy}
                    className="rounded-full border border-border px-3 py-1 text-xs font-medium disabled:opacity-50"
                  >
                    Undo
                  </button>
                </div>
              ) : winner ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => assign(slot.slot_number, winner.userId, winner.bestBid)}
                    disabled={isBusy || ownerHasKeptElsewhere || assignedUserIds.has(winner.userId)}
                    className="rounded-xl bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40"
                    title={
                      assignedUserIds.has(winner.userId)
                        ? `${profilesById[winner.userId]?.display_name} already kept a different slot`
                        : undefined
                    }
                  >
                    Keep for {profilesById[winner.userId]?.display_name}
                  </button>

                  {(ownerWonCount > 1 || assignedUserIds.has(winner.userId)) && (
                    <div className="flex flex-1 items-center gap-2">
                      <select
                        value={forceTarget[slot.slot_number] ?? ""}
                        onChange={(e) =>
                          setForceTarget((prev) => ({ ...prev, [slot.slot_number]: e.target.value }))
                        }
                        className="flex-1 rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm"
                      >
                        <option value="">Force onto…</option>
                        {unclaimedMemberIds.map((id) => (
                          <option key={id} value={id}>
                            {profilesById[id]?.display_name ?? "Unknown"}
                          </option>
                        ))}
                      </select>
                      <button
                        disabled={isBusy || !forceTarget[slot.slot_number]}
                        onClick={() =>
                          assign(slot.slot_number, forceTarget[slot.slot_number], winner.bestBid)
                        }
                        className="rounded-xl border border-border px-3 py-2 text-sm font-medium disabled:opacity-40"
                      >
                        Force
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-3 flex items-center gap-2">
                  <select
                    value={forceTarget[slot.slot_number] ?? ""}
                    onChange={(e) =>
                      setForceTarget((prev) => ({ ...prev, [slot.slot_number]: e.target.value }))
                    }
                    className="flex-1 rounded-xl border border-border bg-surface-2 px-2 py-2 text-sm"
                  >
                    <option value="">Assign unclaimed pick to…</option>
                    {unclaimedMemberIds.map((id) => (
                      <option key={id} value={id}>
                        {profilesById[id]?.display_name ?? "Unknown"}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={isBusy || !forceTarget[slot.slot_number]}
                    onClick={() => assign(slot.slot_number, forceTarget[slot.slot_number], 0)}
                    className="rounded-xl border border-border px-3 py-2 text-sm font-medium disabled:opacity-40"
                  >
                    Assign
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {allAssigned && (
        <div className="rounded-2xl border border-accent bg-accent/10 p-4">
          <h2 className="font-semibold">Review before finalizing</h2>
          <ol className="mt-2 flex flex-col gap-1 text-sm">
            {[...assignments]
              .sort((a, b) => a.slot_number - b.slot_number)
              .map((a) => (
                <li key={a.id} className="flex justify-between">
                  <span>
                    {a.slot_number}. {profilesById[a.user_id]?.display_name ?? "Unknown"}
                  </span>
                  <span className="text-muted">{formatMoney(a.winning_bid)}</span>
                </li>
              ))}
          </ol>
          <div className="mt-2 text-sm font-medium">Total revenue: {formatMoney(totalRevenue)}</div>
          <button
            onClick={finalize}
            disabled={busy === "finalize"}
            className="mt-3 w-full rounded-xl bg-accent px-4 py-3 font-semibold text-accent-foreground disabled:opacity-60"
          >
            Finalize Draft Order
          </button>
        </div>
      )}
    </div>
  );
}
