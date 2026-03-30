"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";

export default function ProductsActionsMenu({
  isOwner,
  exporting,
  hasMultipleBranches,
  canExport,
  canPlatformSync,
  onExport,
  onImport,
  onPlatformSync,
  onReplicate,
  onTransfer,
  onCorrectInventory,
  onRestockHistory,
  onUpdatePrices,
  onSelectionMode,
}: {
  isOwner: boolean;
  exporting: boolean;
  hasMultipleBranches: boolean;
  canExport: boolean;
  canPlatformSync: boolean;
  onExport: () => void;
  onImport: () => void;
  onPlatformSync: () => void;
  onReplicate: () => void;
  onTransfer: () => void;
  onCorrectInventory: () => void;
  onRestockHistory: () => void;
  onUpdatePrices: () => void;
  onSelectionMode: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function run(action: () => void) {
    setOpen(false);
    action();
  }

  return (
    <div ref={rootRef} style={{ position: "relative" }}>
      <button
        className="btn btn-sm btn-ghost"
        style={{ border: "1px solid var(--border)", fontWeight: 700 }}
        onClick={() => setOpen((prev) => !prev)}
        title="Acciones"
      >
        Acciones
      </button>

      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: "absolute",
            top: "calc(100% + 8px)",
            right: 0,
            minWidth: "220px",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "16px",
            boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
            overflow: "hidden",
            zIndex: 120,
          }}
        >
          <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onUpdatePrices)}>
            Actualizar precios
          </button>
          <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onRestockHistory)}>
            Historial ingresos
          </button>
          <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onCorrectInventory)}>
            Corregir inventario
          </button>
          <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onSelectionMode)}>
            Seleccionar varios
          </button>

          {isOwner && (
            <>
              <div style={menuDividerStyle} />
              <button
                className="btn btn-ghost"
                style={menuButtonStyle}
                onClick={() => run(onExport)}
                disabled={!canExport || exporting}
              >
                {exporting ? "Exportando..." : "Exportar XLSX"}
              </button>
              <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onImport)}>
                Importar XLSX
              </button>
              <button
                className="btn btn-ghost"
                style={menuButtonStyle}
                onClick={() => run(onPlatformSync)}
                disabled={!canPlatformSync}
              >
                Sincronizar base general
              </button>

              {hasMultipleBranches && (
                <>
                  <div style={menuDividerStyle} />
                  <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onReplicate)}>
                    Replicar a sucursal
                  </button>
                  <button className="btn btn-ghost" style={menuButtonStyle} onClick={() => run(onTransfer)}>
                    Transferir stock
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

const menuButtonStyle: CSSProperties = {
  width: "100%",
  justifyContent: "flex-start",
  border: "none",
  borderRadius: 0,
  background: "transparent",
  padding: "13px 16px",
  fontWeight: 600,
};

const menuDividerStyle: CSSProperties = {
  height: "1px",
  background: "var(--border)",
  margin: "0 12px",
};
