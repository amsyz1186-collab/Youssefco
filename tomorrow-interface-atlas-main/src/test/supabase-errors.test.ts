import { describe, expect, it } from "vitest";
import { formatRpcError } from "@/lib/supabase-errors";

describe("Supabase RPC error messages", () => {
  it("points to the migration when a required RPC is missing from the schema cache", () => {
    expect(
      formatRpcError(
        { code: "PGRST202", message: "Could not find the function in the schema cache" },
        "consume_credits(integer)",
        "20261026130000_studio_credit_costs.sql",
      ),
    ).toContain("20261026130000_studio_credit_costs.sql");
  });

  it("preserves unrelated database errors", () => {
    expect(
      formatRpcError(
        { code: "42501", message: "new row violates row-level security policy" },
        "consume_credits(integer)",
        "20261026130000_studio_credit_costs.sql",
      ),
    ).toBe("new row violates row-level security policy");
  });
});
