import { getLeagueContext } from "@/lib/league-context";
import { formatMoney, formatDateTime } from "@/lib/format";

export default async function MyBidsPage() {
  const ctx = await getLeagueContext();

  if (!ctx.auction) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        No auction yet.
      </div>
    );
  }

  const slotsByNumber = new Map(ctx.slots.map((s) => [s.slot_number, s]));

  const winning = ctx.slots.filter((s) => s.current_winner_id === ctx.userId);

  const myValidBids = ctx.bids.filter((b) => b.user_id === ctx.userId && !b.invalidated_at);
  const mySlotIds = new Set(myValidBids.map((b) => b.draft_slot_id));

  const outbidSlots = ctx.slots.filter(
    (s) => mySlotIds.has(s.id) && s.current_winner_id !== ctx.userId
  );

  function myBestBidFor(slotId: string) {
    return myValidBids
      .filter((b) => b.draft_slot_id === slotId)
      .reduce((max, b) => Math.max(max, b.amount), 0);
  }

  const exposure = winning.reduce((sum, s) => sum + (s.current_bid ?? 0), 0);

  const allActivity = ctx.bids
    .filter((b) => b.user_id === ctx.userId)
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Current winning exposure
        </div>
        <div className="text-2xl font-bold">{formatMoney(exposure)}</div>
        <p className="mt-1 text-xs text-muted">
          Informational only — you can lead more than one slot while bidding is open, but you&apos;ll
          only be assigned one draft position when the commissioner resolves the order.
        </p>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          Currently Winning
        </h2>
        {winning.length === 0 ? (
          <p className="text-sm text-muted">You&apos;re not currently leading any slots.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {winning
              .sort((a, b) => a.slot_number - b.slot_number)
              .map((s) => (
                <li
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-border bg-surface p-3"
                >
                  <span className="font-medium">Pick {s.slot_number}</span>
                  <span className="font-semibold text-winning">{formatMoney(s.current_bid)}</span>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Outbid</h2>
        {outbidSlots.length === 0 ? (
          <p className="text-sm text-muted">No open bids you&apos;ve been outbid on.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {outbidSlots
              .sort((a, b) => a.slot_number - b.slot_number)
              .map((s) => (
                <li key={s.id} className="rounded-xl border border-outbid/40 bg-surface p-3">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">Pick {s.slot_number}</span>
                    <span className="text-xs text-outbid">Outbid</span>
                  </div>
                  <div className="mt-1 flex justify-between text-xs text-muted">
                    <span>Your last bid: {formatMoney(myBestBidFor(s.id))}</span>
                    <span>Current bid: {formatMoney(s.current_bid)}</span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
          All Activity
        </h2>
        {allActivity.length === 0 ? (
          <p className="text-sm text-muted">You haven&apos;t placed any bids yet.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {allActivity.map((b) => {
              const slot = ctx.slots.find((s) => s.id === b.draft_slot_id);
              return (
                <li
                  key={b.id}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                    b.invalidated_at ? "bg-surface-2 text-muted line-through" : "bg-surface"
                  } border border-border`}
                >
                  <span>Pick {slot ? slot.slot_number : slotsByNumber.size}</span>
                  <span>{formatMoney(b.amount)}</span>
                  <span className="text-xs text-muted">{formatDateTime(b.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
