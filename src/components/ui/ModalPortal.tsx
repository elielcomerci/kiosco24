"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { createPortal } from "react-dom";

function subscribeToMount() {
  return () => {};
}

export default function ModalPortal({ children }: { children: ReactNode }) {
  const mounted = useSyncExternalStore(subscribeToMount, () => true, () => false);

  if (!mounted) {
    return null;
  }

  return createPortal(children, document.body);
}
