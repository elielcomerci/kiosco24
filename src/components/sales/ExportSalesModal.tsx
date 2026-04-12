"use client";

import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";

export default function ExportSalesModal({
  branchId,
  open,
  onOpenChange,
}: {
  branchId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setUTCDate(1);
    return d.toISOString().slice(0, 10);
  });
  
  const [to, setTo] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  const [includeFacturadas, setIncludeFacturadas] = useState(true);
  const [includeTickets, setIncludeTickets] = useState(true);
  const [includeLibres, setIncludeLibres] = useState(true);

  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);

    const types = [];
    if (includeFacturadas) types.push("FACTURADA");
    if (includeTickets) types.push("TICKET");
    if (includeLibres) types.push("LIBRE");

    if (types.length === 0) {
      setError("Debes seleccionar al menos un tipo de venta para exportar.");
      return;
    }

    if (!from || !to) {
      setError("Selecciona el rango de fechas.");
      return;
    }

    setExporting(true);

    try {
      const sp = new URLSearchParams();
      sp.set("from", from);
      sp.set("to", to);
      sp.set("types", types.join(","));

      // Redirect into the download URL so the browser downloads it
      window.location.assign(`/api/ventas/export?${sp.toString()}`);
      
      // Close after a brief moment
      setTimeout(() => {
        onOpenChange(false);
      }, 1000);

    } catch (err) {
      setError("Hubo un error iniciando la descarga.");
    } finally {
      setTimeout(() => setExporting(false), 2000);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.5)",
            backdropFilter: "blur(2px)",
            zIndex: 9999,
          }}
        />
        <Dialog.Content
          style={{
            position: "fixed",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            background: "var(--surface)",
            padding: "24px",
            borderRadius: "var(--radius-lg)",
            width: "90%",
            maxWidth: "420px",
            zIndex: 10000,
            border: "1px solid var(--border)",
            boxShadow: "0 12px 24px rgba(0,0,0,0.3)",
          }}
        >
          <Dialog.Title style={{ margin: "0 0 16px", fontSize: "20px", fontWeight: 800 }}>
            Exportar XLS (Excel)
          </Dialog.Title>

          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            <div style={{ display: "flex", gap: "12px" }}>
               <div style={{ flex: 1 }}>
                 <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)", marginBottom: 4, display: "block" }}>DESDE</label>
                 <input className="input" type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ width: "100%" }} />
               </div>
               <div style={{ flex: 1 }}>
                 <label style={{ fontSize: "12px", fontWeight: 700, color: "var(--text-3)", marginBottom: 4, display: "block" }}>HASTA</label>
                 <input className="input" type="date" value={to} onChange={e => setTo(e.target.value)} style={{ width: "100%" }} />
               </div>
            </div>

            <div style={{ background: "var(--bg)", border: "1px solid var(--border)", borderRadius: "var(--radius-md)", padding: "16px" }}>
              <h4 style={{ fontSize: "13px", fontWeight: 700, margin: "0 0 12px 0", color: "var(--text-2)" }}>SELECCIONAR GRUPOS</h4>
              
              <label style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={includeFacturadas} 
                  onChange={e => setIncludeFacturadas(e.target.checked)} 
                  style={{ width: 18, height: 18, accentColor: "var(--primary)" }} 
                />
                <span style={{ fontSize: "14px", fontWeight: 600 }}>C/ Factura AFIP (Emitidas)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={includeTickets} 
                  onChange={e => setIncludeTickets(e.target.checked)} 
                  style={{ width: 18, height: 18, accentColor: "var(--primary)" }} 
                />
                <span style={{ fontSize: "14px", fontWeight: 600 }}>Técnicas (Ticket No Fiscal)</span>
              </label>

              <label style={{ display: "flex", alignItems: "center", gap: "12px", cursor: "pointer" }}>
                <input 
                  type="checkbox" 
                  checked={includeLibres} 
                  onChange={e => setIncludeLibres(e.target.checked)} 
                  style={{ width: 18, height: 18, accentColor: "var(--primary)" }} 
                />
                <span style={{ fontSize: "14px", fontWeight: 600 }}>Libres (Sin comprobante)</span>
              </label>
            </div>

            {error && (
              <div style={{ color: "var(--red)", fontSize: "13px", padding: "8px", background: "rgba(239,68,68,0.1)", borderRadius: "var(--radius-sm)" }}>
                {error}
              </div>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "12px", marginTop: "24px" }}>
            <button
              className="btn btn-secondary"
              onClick={() => onOpenChange(false)}
              disabled={exporting}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              onClick={handleExport}
              disabled={exporting || (!includeFacturadas && !includeLibres && !includeTickets)}
            >
              {exporting ? "Generando..." : "Descargar XLSX"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
