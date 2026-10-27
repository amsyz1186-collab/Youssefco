import { describe, expect, it } from "vitest";
import { createTermsConsentMetadata, TERMS_CONSENT_PENDING_KEY, TERMS_VERSION } from "@/lib/legal";

describe("terms consent metadata", () => {
  it("records the same explicit version for terms and privacy", () => {
    expect(createTermsConsentMetadata("2026-10-26T00:00:00.000Z")).toEqual({
      terms_accepted_at: "2026-10-26T00:00:00.000Z",
      terms_version: TERMS_VERSION,
      privacy_notice_version: TERMS_VERSION,
    });
  });

  it("uses a versioned, first-party OAuth consent marker", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(TERMS_CONSENT_PENDING_KEY).toBe("youssefco:terms-consent-pending");
  });
});
