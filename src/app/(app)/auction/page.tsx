import { AuctionBoard } from "@/components/AuctionBoard";
import { getLeagueContext } from "@/lib/league-context";

export default async function AuctionPage() {
  const ctx = await getLeagueContext();

  if (!ctx.auction) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center">
        <h1 className="text-lg font-semibold">No auction yet</h1>
        <p className="mt-1 text-sm text-muted">
          Your commissioner hasn&apos;t created an auction for this league yet.
        </p>
      </div>
    );
  }

  const { data: serverTime } = await ctx.supabase.rpc("get_server_time");

  return (
    <AuctionBoard
      initialAuction={ctx.auction}
      initialSlots={ctx.slots}
      initialBids={ctx.bids}
      profilesById={ctx.profilesById}
      currentUserId={ctx.userId}
      canBid={true}
      serverNowIso={serverTime ?? new Date().toISOString()}
    />
  );
}
