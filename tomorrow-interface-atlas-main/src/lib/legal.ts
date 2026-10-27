export const TERMS_VERSION = "2026-10-27";
export const TERMS_CONSENT_PENDING_KEY = "youssefco:terms-consent-pending";

export function createTermsConsentMetadata(acceptedAt = new Date().toISOString()) {
  return {
    terms_accepted_at: acceptedAt,
    terms_version: TERMS_VERSION,
    privacy_notice_version: TERMS_VERSION,
  };
}
