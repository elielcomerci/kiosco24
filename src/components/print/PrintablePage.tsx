"use client";

import { useEffect, useState } from "react";
import BrandLogo from "@/components/branding/BrandLogo";
import { useBranchWorkspace } from "@/components/ui/BranchWorkspace";
import { LEGACY_PRINT_EVENT, PRINT_EVENT } from "@/lib/brand";

export default function PrintablePage({
  title,
  subtitle,
  meta = [],
  children,
}: {
  title: string;
  subtitle?: string;
  meta?: { label: string; value: string }[];
  children: React.ReactNode;
}) {
  const { branch } = useBranchWorkspace();
  const [printedAt, setPrintedAt] = useState(() => new Date());

  useEffect(() => {
    const refreshTimestamp = () => setPrintedAt(new Date());

    window.addEventListener("beforeprint", refreshTimestamp);
    window.addEventListener(PRINT_EVENT, refreshTimestamp as EventListener);
    window.addEventListener(LEGACY_PRINT_EVENT, refreshTimestamp as EventListener);

    return () => {
      window.removeEventListener("beforeprint", refreshTimestamp);
      window.removeEventListener(PRINT_EVENT, refreshTimestamp as EventListener);
      window.removeEventListener(LEGACY_PRINT_EVENT, refreshTimestamp as EventListener);
    };
  }, []);

  return (
    <section className="print-only print-sheet">
      <div
        className="print-sheet__header"
        style={{ borderTopColor: branch.primaryColor || "#22c55e" }}
      >
        <div className="print-sheet__brand">
          {branch.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branch.logoUrl} alt={branch.name} className="print-sheet__logo" />
          ) : (
            <div className="print-sheet__logo-fallback">
              {branch.name.slice(0, 1).toUpperCase()}
            </div>
          )}

          <div>
            <div className="print-sheet__eyebrow">
              <BrandLogo tone="blue" width={88} />
            </div>
            <h1 className="print-sheet__title">{title}</h1>
            <div className="print-sheet__subtitle">
              {branch.name}
              {subtitle ? ` · ${subtitle}` : ""}
            </div>
          </div>
        </div>

        <div className="print-sheet__meta">
          <div className="print-sheet__meta-item">
            <span>Emitido</span>
            <strong>
              {printedAt.toLocaleDateString("es-AR")} ·{" "}
              {printedAt.toLocaleTimeString("es-AR", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </strong>
          </div>
          {meta.map((item) => (
            <div key={`${item.label}-${item.value}`} className="print-sheet__meta-item">
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      </div>

      <div className="print-sheet__body">{children}</div>
    </section>
  );
}
