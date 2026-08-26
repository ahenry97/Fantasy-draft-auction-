import { getLeagueContext } from "@/lib/league-context";
import { formatMoney } from "@/lib/format";

export default async function DraftOrderPage() {
  const ctx = await getLeagueContext();

  if (!ctx.auction) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        No auction yet.
      </div>
    );
  }

  if (!ctx.auction.draft_finalized_at) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold">Draft order not final yet</h1>
        <p className="mt-1 text-sm text-muted">
          {ctx.auction.status === "closed"
            ? "The auction has closed. Your commissioner still needs to resolve the final draft order."
            : "This will be posted once the auction closes and the commissioner resolves it."}
        </p>
      </div>
    );
  }

  const order = [...ctx.assignments].sort((a, b) => {
    // Presentation order: pick order is the natural read for "who picks
    // when" — slot 1 first, not by price.
    return a.slot_number - b.slot_number;
  });

  const totalRevenue = order.reduce((sum, a) => sum + Number(a.winning_bid), 0);

  return (
    <div className="mx-auto max-w-lg">
      <div className="rounded-3xl border border-border bg-surface p-6 text-center shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-widest text-accent">
          Final Draft Order
        </div>
        <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
          {new Date().getFullYear()} Fantasy Draft
        </h1>

        <ol className="mt-6 flex flex-col gap-2 text-left">
          {order.map((a) => (
            <li
              key={a.id}
              className="flex items-center justify-between rounded-xl border border-border bg-surface-2 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-sm font-bold text-accent-foreground">
                  {a.slot_number}
                </span>
                <span className="font-semibold">
                  {ctx.profilesById[a.user_id]?.display_name ?? "Unknown"}
                </span>
              </div>
              <span className="text-sm font-medium text-muted">{formatMoney(a.winning_bid)}</span>
            </li>
          ))}
        </ol>

        <div className="mt-6 border-t border-border pt-4 text-sm text-muted">
          Total auction revenue
          <div className="text-xl font-bold text-foreground">{formatMoney(totalRevenue)}</div>
        </div>
      </div>
      <p className="mt-3 text-center text-xs text-muted">
        Screenshot this and send it to the group chat.
      </p>
    </div>
  );
}
