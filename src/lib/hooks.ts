"use client";

import { useSyncExternalStore } from "react";

export function useIsDesktop(breakpoint = 1024) {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === "undefined") {
        return () => {};
      }

      window.addEventListener("resize", onStoreChange);
      return () => window.removeEventListener("resize", onStoreChange);
    },
    () => (typeof window !== "undefined" ? window.innerWidth >= breakpoint : false),
    () => false,
  );
}
