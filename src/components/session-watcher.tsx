"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SessionWatcher() {
  const router = useRouter();

  useEffect(() => {
    const originalFetch = window.fetch;

    window.fetch = async (...args) => {
      const response = await originalFetch(...args);

      // Si el fetch era hacia nuestra API y devuelve 401
      if (
        response.status === 401 &&
        typeof args[0] === "string" &&
        args[0].startsWith("/api/") &&
        !args[0].startsWith("/api/auth") // ignorar endpoints auth
      ) {
        if (typeof window !== "undefined") {
          window.location.href = `/login?session_expired=true&callbackUrl=${encodeURIComponent(
            window.location.pathname
          )}`;
        }
      }

      return response;
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [router]);

  return null;
}
