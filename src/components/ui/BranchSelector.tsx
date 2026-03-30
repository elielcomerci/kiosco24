"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Branch {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
}

export default function BranchSelector({
  branches,
  currentBranchId,
}: {
  branches: Branch[];
  currentBranchId: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const menuRef = useRef<HTMLDivElement>(null);

  const currentBranch = branches.find((b) => b.id === currentBranchId) || branches[0];

  // Cerrar al clickear afuera
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

  const handleSelect = (branchId: string) => {
    setOpen(false);
    if (branchId !== currentBranchId) {
      // Al cambiar de sucursal, lo enviamos directamente a la caja de la nueva para evitar errores de contexto
      router.push(`/${branchId}/caja`);
    }
  };

  if (branches.length <= 1) {
    // Si solo hay 1 sucursal, mostramos el texto estático como antes para no confundir
    return (
      <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: 0 }}>
        {currentBranch?.logoUrl ? (
          <img 
            src={currentBranch.logoUrl} 
            alt={currentBranch?.name} 
            style={{ width: "38px", height: "38px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 }} 
          />
        ) : (
          <span style={{ fontSize: "calc(20px * var(--device-font-scale, 1))" }}>🏪</span>
        )}
        <h1
          style={{
            fontSize: "calc(18px * var(--device-font-scale, 1))",
            fontWeight: 800,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {currentBranch?.name}
        </h1>
      </div>
    );
  }

  return (
    <div style={{ position: "relative", minWidth: 0 }} ref={menuRef}>
      <button
        onClick={() => setOpen(!open)}
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
        }}
        className="hover-trigger"
      >
        {currentBranch?.logoUrl ? (
          <img 
            src={currentBranch.logoUrl} 
            alt={currentBranch?.name} 
            style={{ width: "38px", height: "38px", borderRadius: "10px", objectFit: "cover", flexShrink: 0 }} 
          />
        ) : (
          <span style={{ fontSize: "calc(18px * var(--device-font-scale, 1))" }}>🏪</span>
        )}
        <h1
          style={{
            fontSize: "calc(18px * var(--device-font-scale, 1))",
            fontWeight: 800,
            color: "var(--text)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            maxWidth: "180px",
          }}
        >
          {currentBranch?.name}
        </h1>
        <span style={{ fontSize: "calc(12px * var(--device-font-scale, 1))", color: "var(--text-3)", transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>
          ▼
        </span>
      </button>

      {open && (
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
              {branch.id === currentBranchId && (
                <span style={{ color: "var(--green)" }}>✓</span>
              )}
            </button>
          ))}
          <a 
            href={`/${currentBranchId}/configuracion`}
            style={{
              display: "block",
              padding: "12px 16px",
              textAlign: "center",
              fontSize: "13px",
              color: "var(--text-2)",
              textDecoration: "none",
              background: "var(--surface-2)",
              fontWeight: 600
            }}
          >
            + Administrar Sucursales
          </a>
        </div>
      )}
    </div>
  );
}
