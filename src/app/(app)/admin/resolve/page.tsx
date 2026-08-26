import { redirect } from "next/navigation";
import { getLeagueContext } from "@/lib/league-context";
import { ResolvePanel } from "@/components/ResolvePanel";

export default async function ResolvePage() {
  const ctx = await getLeagueContext();

  if (ctx.role !== "commissioner") {
    redirect("/auction");
  }

  if (!ctx.auction) {
    return (
      <div className="rounded-2xl border border-border bg-surface p-6 text-center text-sm text-muted">
        No auction yet.
      </div>
    );
  }

  return (
    <ResolvePanel
      auction={ctx.auction}
      slots={ctx.slots}
      bids={ctx.bids}
      assignments={ctx.assignments}
      profilesById={ctx.profilesById}
    />
  );
}
