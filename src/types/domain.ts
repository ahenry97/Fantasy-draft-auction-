export type AuctionStatus = "draft" | "open" | "paused" | "closed";
export type MemberRole = "member" | "commissioner";

export interface Profile {
  id: string;
  email: string;
  display_name: string;
  created_at: string;
}

export interface League {
  id: string;
  name: string;
  commissioner_id: string;
  created_at: string;
}

export interface LeagueMember {
  league_id: string;
  user_id: string;
  role: MemberRole;
  joined_at: string;
}

export interface Auction {
  id: string;
  league_id: string;
  status: AuctionStatus;
  starts_at: string | null;
  ends_at: string;
  starting_bid: number;
  bid_increment: number;
  anti_snipe_enabled: boolean;
  anti_snipe_window_seconds: number;
  anti_snipe_extension_seconds: number;
  slot_count: number;
  draft_finalized_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DraftSlot {
  id: string;
  auction_id: string;
  slot_number: number;
  current_bid: number | null;
  current_winner_id: string | null;
  updated_at: string;
}

export interface Bid {
  id: string;
  auction_id: string;
  draft_slot_id: string;
  user_id: string;
  amount: number;
  created_at: string;
  invalidated_at: string | null;
  invalidated_by: string | null;
}

export interface DraftAssignment {
  id: string;
  auction_id: string;
  slot_number: number;
  user_id: string;
  winning_bid: number;
  assigned_at: string;
  assigned_by: string | null;
}

/** Error codes raised by place_bid() / commissioner RPCs, parsed from the
 * "CODE: message" convention used in supabase/migrations/0003_functions.sql */
export const RPC_ERROR_CODES = [
  "NOT_AUTHENTICATED",
  "NOT_FOUND",
  "FORBIDDEN",
  "AUCTION_PAUSED",
  "AUCTION_CLOSED",
  "AUCTION_NOT_OPEN",
  "AUCTION_ENDED",
  "ALREADY_LEADING",
  "BID_TOO_LOW",
  "ALREADY_FINALIZED",
  "SLOT_ALREADY_ASSIGNED",
  "USER_ALREADY_ASSIGNED",
  "INCOMPLETE",
  "INVALID_STATUS",
] as const;

export function parseRpcError(error: { message: string } | null | undefined): {
  code: string;
  message: string;
} {
  const raw = error?.message ?? "Something went wrong.";
  const match = raw.replace(/\n/g, " ").match(/^([A-Z_]+):\s*(.*)$/);
  if (match) {
    return { code: match[1], message: match[2] };
  }
  return { code: "UNKNOWN", message: raw };
}
