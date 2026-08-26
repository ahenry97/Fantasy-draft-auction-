"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { formatDateTime, formatMoney } from "@/lib/format";
import { parseRpcError, type Auction, type Bid, type DraftSlot, type Profile } from "@/types/domain";

interface AdminPanelProps {
  auction: Auction | null;
  leagueId: string;
  slots: DraftSlot[];
  bids: Bid[];
  profilesById: Record<string, Profile>;
  members: { user_id: string; role: string }[];
}

function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

export function AdminPanel({ auction, slots, bids, profilesById, members }: AdminPanelProps) {
  const router = useRouter();
  const supabase = createClient();
  const [busy, setBusy] = useState(false);

  const [endsAt, setEndsAt] = useState(auction ? toLocalInputValue(auction.ends_at) : "");
  const [startingBid, setStartingBid] = useState(auction ? String(auction.starting_bid) : "1");
  const [bidIncrement, setBidIncrement] = useState(auction ? String(auction.bid_increment) : "1");
  const [antiSnipeEnabled, setAntiSnipeEnabled] = useState(auction?.anti_snipe_enabled ?? true);
  const [antiSnipeWindow, setAntiSnipeWindow] = useState(
    auction ? String(auction.anti_snipe_window_seconds) : "120"
  );
  const [antiSnipeExtension, setAntiSnipeExtension] = useState(
    auction ? String(auction.anti_snipe_extension_seconds) : "120"
  );
  const [selectedSlotNumber, setSelectedSlotNumber] = useState<number | "">("");

  async function run(fn: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    const { error } = await fn();
    setBusy(false);
    if (error) {
      toast.error(parseRpcError(error).message);
      return false;
    }
    router.refresh();
    return true;
  }

  async function setStatus(status: string) {
    if (!auction) return;
    const ok = await run(() =>
      supabase.rpc("set_auction_status", { p_auction_id: auction.id, p_status: status })
    );
    if (ok) toast.success(`Auction ${status}.`);
  }

  async function saveConfig(e: React.FormEvent) {
    e.preventDefault();
    if (!auction) return;
    const ok = await run(() =>
      supabase.rpc("update_auction_config", {
        p_auction_id: auction.id,
        p_ends_at: new Date(endsAt).toISOString(),
        p_starting_bid: Number(startingBid),
        p_bid_increment: Number(bidIncrement),
        p_anti_snipe_enabled: antiSnipeEnabled,
        p_anti_snipe_window_seconds: Number(antiSnipeWindow),
        p_anti_snipe_extension_seconds: Number(antiSnipeExtension),
      })
    );
    if (ok) toast.success("Auction settings saved.");
  }

  async function extend(seconds: number) {
    if (!auction) return;
    const ok = await run(() => supabase.rpc("extend_auction", { p_auction_id: auction.id, p_seconds: seconds }));
    if (ok) toast.success(`Extended by ${seconds >= 60 ? `${seconds / 60}m` : `${seconds}s`}.`);
  }

  async function resetSlot() {
    if (!auction || selectedSlotNumber === "") return;
    if (!confirm(`Reset Pick ${selectedSlotNumber}? This clears its current bid and invalidates its bid history.`))
      return;
    const ok = await run(() =>
      supabase.rpc("reset_slot", { p_auction_id: auction.id, p_slot_number: selectedSlotNumber })
    );
    if (ok) toast.success(`Pick ${selectedSlotNumber} reset.`);
  }

  async function removeBid(bidId: string) {
    if (!confirm("Remove this bid? It will be struck from the record and the leader recalculated.")) return;
    const ok = await run(() => supabase.rpc("remove_bid", { p_bid_id: bidId }));
    if (ok) toast.success("Bid removed.");
  }

  if (!auction) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        No auction exists yet for this league. Create one via the seed script or Supabase Studio, then
        manage it here.
      </div>
    );
  }

  const validBids = bids.filter((b) => !b.invalidated_at);

  return (
    <div className="flex flex-col gap-6 pb-8">
      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Auction status: <span className="capitalize text-foreground">{auction.status}</span>
        </h2>
        <div className="flex flex-wrap gap-2">
          <button
            disabled={busy || auction.status === "open"}
            onClick={() => setStatus("open")}
            className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:opacity-40"
          >
            Open
          </button>
          <button
            disabled={busy || auction.status !== "open"}
            onClick={() => setStatus("paused")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Pause
          </button>
          <button
            disabled={busy || auction.status === "closed"}
            onClick={() => setStatus("closed")}
            className="rounded-full border border-danger/50 px-4 py-2 text-sm font-medium text-danger disabled:opacity-40"
          >
            Close
          </button>
          <button
            disabled={busy || auction.status !== "closed"}
            onClick={() => setStatus("open")}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium disabled:opacity-40"
          >
            Reopen
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            disabled={busy}
            onClick={() => extend(120)}
            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            +2 min
          </button>
          <button
            disabled={busy}
            onClick={() => extend(600)}
            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            +10 min
          </button>
          <button
            disabled={busy}
            onClick={() => extend(3600)}
            className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-medium disabled:opacity-40"
          >
            +1 hour
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Auction configuration
        </h2>
        <form onSubmit={saveConfig} className="flex flex-col gap-3">
          <label className="text-xs font-medium text-muted">Ends at</label>
          <input
            type="datetime-local"
            value={endsAt}
            onChange={(e) => setEndsAt(e.target.value)}
            className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted">Minimum starting bid ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={startingBid}
                onChange={(e) => setStartingBid(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted">Minimum increment ($)</label>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={bidIncrement}
                onChange={(e) => setBidIncrement(e.target.value)}
                className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between rounded-xl bg-surface-2 px-3 py-2">
            <span className="text-sm font-medium">Anti-sniping</span>
            <input
              type="checkbox"
              checked={antiSnipeEnabled}
              onChange={(e) => setAntiSnipeEnabled(e.target.checked)}
              className="h-5 w-5 accent-[var(--accent)]"
            />
          </div>
          {antiSnipeEnabled && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted">Trigger window (sec)</label>
                <input
                  type="number"
                  min={0}
                  value={antiSnipeWindow}
                  onChange={(e) => setAntiSnipeWindow(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted">Extension (sec)</label>
                <input
                  type="number"
                  min={0}
                  value={antiSnipeExtension}
                  onChange={(e) => setAntiSnipeExtension(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-foreground disabled:opacity-60"
          >
            Save configuration
          </button>
        </form>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">Reset a slot</h2>
        <div className="flex gap-2">
          <select
            value={selectedSlotNumber}
            onChange={(e) => setSelectedSlotNumber(e.target.value ? Number(e.target.value) : "")}
            className="flex-1 rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
          >
            <option value="">Select a pick…</option>
            {slots.map((s) => (
              <option key={s.id} value={s.slot_number}>
                Pick {s.slot_number}
              </option>
            ))}
          </select>
          <button
            disabled={busy || selectedSlotNumber === ""}
            onClick={resetSlot}
            className="rounded-xl border border-danger/50 px-4 py-2 text-sm font-medium text-danger disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          Complete bid history
        </h2>
        <div className="max-h-80 overflow-y-auto">
          <ul className="flex flex-col gap-1.5">
            {[...bids]
              .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
              .map((b) => {
                const slot = slots.find((s) => s.id === b.draft_slot_id);
                return (
                  <li
                    key={b.id}
                    className={`flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-xs ${
                      b.invalidated_at ? "bg-surface-2 text-muted line-through" : "bg-surface"
                    }`}
                  >
                    <span>Pick {slot?.slot_number ?? "?"}</span>
                    <span>{profilesById[b.user_id]?.display_name ?? "Unknown"}</span>
                    <span>{formatMoney(b.amount)}</span>
                    <span className="text-muted">{formatDateTime(b.created_at)}</span>
                    {!b.invalidated_at && (
                      <button
                        onClick={() => removeBid(b.id)}
                        disabled={busy}
                        className="rounded-full border border-danger/40 px-2 py-0.5 text-[11px] font-medium text-danger"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                );
              })}
            {validBids.length === 0 && <p className="text-sm text-muted">No bids yet.</p>}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">
          League members ({members.length})
        </h2>
        <ul className="flex flex-col gap-1.5">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center justify-between text-sm">
              <span>{profilesById[m.user_id]?.display_name ?? "Unknown"}</span>
              <span className="text-xs capitalize text-muted">{m.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href="/admin/resolve"
        className="rounded-2xl bg-accent px-4 py-3 text-center text-sm font-semibold text-accent-foreground"
      >
        Resolve Draft Order →
      </Link>
    </div>
  );
}
