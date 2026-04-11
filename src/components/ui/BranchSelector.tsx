"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Branch {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

const MIN_BRANCH_NAME_SCALE = 0.76;

export default function BranchSelector({
  branches,
  currentBranchId,
}: {
  branches: Branch[];
  currentBranchId: string;
}) {
  const [open, setOpen] = useState(false);
  const [nameScale, setNameScale] = useState(1);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);
  const branchNameSlotRef = useRef<HTMLSpanElement>(null);
  const branchNameTextRef = useRef<HTMLHeadingElement>(null);

  const currentBranch = branches.find((branch) => branch.id === currentBranchId) || branches[0];
  const branchName = currentBranch?.name ?? "Sucursal";

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  useEffect(() => {
    const slot = branchNameSlotRef.current;
    const text = branchNameTextRef.current;
    if (!slot || !text) return;

    const updateScale = () => {
      const availableWidth = slot.clientWidth;
      const contentWidth = text.scrollWidth;
      if (!availableWidth || !contentWidth) return;

      const nextScale = Math.max(
        MIN_BRANCH_NAME_SCALE,
        Math.min(1, availableWidth / contentWidth),
      );

      setNameScale((current) =>
        Math.abs(current - nextScale) < 0.01 ? current : nextScale,
      );
    };

    const frameId = window.requestAnimationFrame(updateScale);
    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScale) : null;

    resizeObserver?.observe(slot);
    resizeObserver?.observe(text);

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
    };
  }, [branchName]);

  const handleSelect = (branchId: string) => {
    setOpen(false);
    if (branchId !== currentBranchId) {
      router.push(`/${branchId}/caja`);
    }
  };

  const branchNameSlotStyle = {
    minWidth: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    flex: 1,
  };

  const branchNameTextStyle = {
    display: "inline-block",
    margin: 0,
    fontSize: "calc(18px * var(--device-font-scale, 1))",
    fontWeight: 800,
    whiteSpace: "nowrap" as const,
    lineHeight: 1.1,
    transform: `scale(${nameScale})`,
    transformOrigin: "left center",
  };

  const branchIcon = currentBranch?.logoUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentBranch.logoUrl}
      alt={currentBranch?.name}
      style={{
        width: "38px",
        height: "38px",
        borderRadius: "10px",
        objectFit: "cover",
        flexShrink: 0,
      }}
    />
  ) : (
    <span style={{ fontSize: "calc(20px * var(--device-font-scale, 1))" }}>🏪</span>
  );

  if (branches.length <= 1) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {branchIcon}
        <span ref={branchNameSlotRef} style={branchNameSlotStyle}>
          <h1 ref={branchNameTextRef} style={branchNameTextStyle}>
            {branchName}
          </h1>
        </span>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minWidth: 0, maxWidth: "100%" }} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: "4px 10px 4px 0",
          borderRadius: "10px",
          transition: "background 0.2s",
          minWidth: 0,
          maxWidth: "100%",
        }}
        className="hover-trigger"
      >
        {branchIcon}
        <span ref={branchNameSlotRef} style={branchNameSlotStyle}>
          <h1
            ref={branchNameTextRef}
            style={{
              ...branchNameTextStyle,
              color: "var(--text)",
            }}
          >
            {branchName}
          </h1>
        </span>
        <span
          style={{
            fontSize: "calc(12px * var(--device-font-scale, 1))",
            color: "var(--text-3)",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s",
            flexShrink: 0,
          }}
        >
          ▼
        </span>
      </button>

      {open ? (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            marginTop: "8px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            boxShadow: "0 10px 25px rgba(0,0,0,0.5)",
            width: "max-content",
            minWidth: "200px",
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
          }}
          className="animate-slide-up"
        >
          {branches.map((branch) => (
            <button
              key={branch.id}
              type="button"
              onClick={() => handleSelect(branch.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                padding: "12px 16px",
                background: branch.id === currentBranchId ? "var(--surface-2)" : "transparent",
                border: "none",
                textAlign: "left",
                cursor: "pointer",
                color: "var(--text)",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <div
                style={{
                  width: "24px",
                  height: "24px",
                  borderRadius: "4px",
                  background: branch.primaryColor || "var(--primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "calc(12px * var(--device-font-scale, 1))",
                }}
              >
                🏪
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: branch.id === currentBranchId ? 700 : 500 }}>
                  {branch.name}
                </div>
              </div>
              {branch.id === currentBranchId ? (
                <span style={{ color: "var(--green)" }}>✓</span>
              ) : null}
            </button>
          ))}
          <a
            href={`/${currentBranchId}/configuracion?tab=sucursales`}
            style={{
              display: "block",
              padding: "12px 16px",
              textAlign: "center",
              fontSize: "13px",
              color: "var(--text-2)",
              textDecoration: "none",
              background: "var(--surface-2)",
              fontWeight: 600,
            }}
          >
            + Administrar Sucursales
          </a>
        </div>
      ) : null}
    </div>
  );
}
