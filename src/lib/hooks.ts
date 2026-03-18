"use client";

import { useState, useEffect } from "react";

export function useIsDesktop(breakpoint = 1024) {
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    // Evitar errores de SSR
    if (typeof window !== "undefined") {
      setIsDesktop(window.innerWidth >= breakpoint);

      const handleResize = () => {
        setIsDesktop(window.innerWidth >= breakpoint);
      };

      window.addEventListener("resize", handleResize);
      return () => window.removeEventListener("resize", handleResize);
    }
  }, [breakpoint]);

  return isDesktop;
}
