"use client";

import { useEffect } from "react";

/**
 * Sets a referral cookie when the user visits a partner's landing page.
 * This ensures attribution survives navigation away and return visits (30 days).
 */
export default function ReferralCookieSetter({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;

    // Set cookie for 30 days on the current domain
    document.cookie = `clikit_ref=${encodeURIComponent(slug)}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, [slug]);

  return null;
}
