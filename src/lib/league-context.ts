import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type {
  Auction,
  Bid,
  DraftAssignment,
  DraftSlot,
  League,
  MemberRole,
  Profile,
} from "@/types/domain";

export interface LeagueContext {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  profile: Profile;
  league: League;
  role: MemberRole;
  auction: Auction | null;
  slots: DraftSlot[];
  bids: Bid[];
  assignments: DraftAssignment[];
  profilesById: Record<string, Profile>;
}

/**
 * v1 assumes a single league per signed-in user. If someone belongs to more
 * than one (schema supports it for later), we take the earliest-joined one —
 * documented simplification, revisit with a league switcher post-v1.
 */
export async function getLeagueContext(): Promise<LeagueContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (!profile) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("league_members")
    .select("league_id, role, joined_at")
    .eq("user_id", user.id)
    .order("joined_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    redirect("/no-league");
  }

  const { data: league } = await supabase
    .from("leagues")
    .select("*")
    .eq("id", membership.league_id)
    .single();

  if (!league) {
    redirect("/no-league");
  }

  const { data: auction } = await supabase
    .from("auctions")
    .select("*")
    .eq("league_id", league.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let slots: DraftSlot[] = [];
  let bids: Bid[] = [];
  let assignments: DraftAssignment[] = [];

  if (auction) {
    const [{ data: slotsData }, { data: bidsData }, { data: assignmentsData }] =
      await Promise.all([
        supabase
          .from("draft_slots")
          .select("*")
          .eq("auction_id", auction.id)
          .order("slot_number", { ascending: true }),
        supabase
          .from("bids")
          .select("*")
          .eq("auction_id", auction.id)
          .order("created_at", { ascending: false }),
        supabase.from("draft_assignments").select("*").eq("auction_id", auction.id),
      ]);
    slots = slotsData ?? [];
    bids = bidsData ?? [];
    assignments = assignmentsData ?? [];
  }

  const { data: leagueMembers } = await supabase
    .from("league_members")
    .select("user_id")
    .eq("league_id", league.id);

  const memberIds = (leagueMembers ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase.from("profiles").select("*").in("id", memberIds);

  const profilesById: Record<string, Profile> = {};
  for (const p of profiles ?? []) profilesById[p.id] = p;

  return {
    supabase,
    userId: user.id,
    profile,
    league,
    role: membership.role as MemberRole,
    auction: auction ?? null,
    slots,
    bids,
    assignments,
    profilesById,
  };
}