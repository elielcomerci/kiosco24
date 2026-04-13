"use client";

import { useEffect } from "react";

/**
 * Sets a referral cookie when the user visits a partner's landing page.
 * This ensures attribution survives navigation away and return visits (30 days).
 */
export default function ReferralCookieSetter({ slug }: { slug: string }) {
  useEffect(() => {
    if (!slug) return;

    const hostname = window.location.hostname;
    const domainParts = hostname.split('.');
    const isLocalhost = hostname.includes('localhost') || hostname.includes('127.0.0.1');
    const rootDomain = domainParts.length > 2 && !isLocalhost
      ? `.${domainParts.slice(-2).join('.')}`
      : isLocalhost ? '' : `.${hostname}`;
      
    document.cookie = `clikit_ref=${encodeURIComponent(slug)}; path=/; ${rootDomain ? `domain=${rootDomain}; ` : ''}max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  }, [slug]);

  return null;
}
