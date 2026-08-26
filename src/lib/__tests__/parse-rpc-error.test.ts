import { describe, it, expect } from "vitest";
import { parseRpcError } from "@/types/domain";

describe("parseRpcError", () => {
  it("splits the CODE: message convention used by every RPC function", () => {
    const result = parseRpcError({ message: "BID_TOO_LOW: Minimum bid is 6.00 (yours was 5.00)." });
    expect(result.code).toBe("BID_TOO_LOW");
    expect(result.message).toBe("Minimum bid is 6.00 (yours was 5.00).");
  });

  it("falls back to UNKNOWN for unrecognized error shapes", () => {
    const result = parseRpcError({ message: "some raw postgres error" });
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("some raw postgres error");
  });

  it("handles a null/undefined error gracefully", () => {
    const result = parseRpcError(null);
    expect(result.code).toBe("UNKNOWN");
    expect(result.message).toBe("Something went wrong.");
  });
});
