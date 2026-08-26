import { redirect } from "next/navigation";
import { getLeagueContext } from "@/lib/league-context";
import { AdminPanel } from "@/components/AdminPanel";

export default async function AdminPage() {
  const ctx = await getLeagueContext();

  // Belt-and-suspenders: the UI hides this link for members, but every
  // mutation on this page is also re-checked server-side by is_commissioner()
  // inside the RPC functions themselves, so this redirect is just UX — it is
  // not what actually keeps a member from opening/closing the auction.
  if (ctx.role !== "commissioner") {
    redirect("/auction");
  }

  const { data: members } = await ctx.supabase
    .from("league_members")
    .select("user_id, role")
    .eq("league_id", ctx.league.id);

  return (
    <AdminPanel
      auction={ctx.auction}
      leagueId={ctx.league.id}
      slots={ctx.slots}
      bids={ctx.bids}
      profilesById={ctx.profilesById}
      members={members ?? []}
    />
  );
}
