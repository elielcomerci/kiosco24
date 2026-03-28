"use client";

import { useEffect, useMemo, useState } from "react";

type PricingMode = "SHARED" | "BRANCH";
type CatalogImportScope = "everything" | "catalog" | "pricing" | "stock" | "display" | "lots";
type CatalogImportMode = "upsert" | "only_existing" | "overwrite_existing";

type BranchOption = {
  id: string;
  name: string;
};

type PreviewResponse = {
  branchId: string;
  branchName: string;
  pricingMode: PricingMode;
  scope: CatalogImportScope;
  mode: CatalogImportMode;
  summary: {
    productRows: number;
    lotRows: number;
    matchedProducts: number;
    skippedProducts: number;
    inventoryCreates: number;
    inventoryUpdates: number;
    variantInventoryCreates: number;
    variantInventoryUpdates: number;
    lotOwners: number;
  };
  items: Array<{
    key: string;
    name: string;
    action: "update" | "skip";
    detail: string;
    lotCount: number;
  }>;
  errors: string[];
  warnings: string[];
};

const scopeOptions: Array<{
  value: CatalogImportScope;
  label: string;
  description: string;
}> = [
  { value: "everything", label: "Todo de esta sucursal", description: "Catalogo, precios, stock, minimos y vencimientos." },
  { value: "pricing", label: "Solo precios y costos", description: "Actualiza solo importes." },
  { value: "stock", label: "Solo stock", description: "Actualiza solo cantidades." },
  { value: "display", label: "Stock minimo y visibilidad", description: "Minimo y mostrar en caja." },
  { value: "lots", label: "Solo vencimientos", description: "Reemplaza el desglose por lotes." },
  { value: "catalog", label: "Solo catalogo base", description: "Nombre, codigos, categoria y datos del producto." },
];

const modeOptions: Array<{
  value: CatalogImportMode;
  label: string;
  description: string;
}> = [
  { value: "upsert", label: "Crear y actualizar", description: "Completa lo que falte en la sucursal y actualiza coincidencias." },
  { value: "only_existing", label: "Solo actualizar", description: "No crea faltantes en la sucursal destino." },
  { value: "overwrite_existing", label: "Sobrescribir coincidencias", description: "Usa el archivo como fuente de verdad para lo elegido." },
];

export default function CatalogSpreadsheetModal({
  branchId,
  branches,
  pricingMode,
  onClose,
  onApplied,
}: {
  branchId: string;
  branches: BranchOption[];
  pricingMode: PricingMode;
  onClose: () => void;
  onApplied: (message: string) => void;
}) {
  const branchOptions = useMemo(
    () => (branches.length > 0 ? branches : [{ id: branchId, name: "Sucursal actual" }]),
    [branchId, branches],
  );

  const [file, setFile] = useState<File | null>(null);
  const [targetBranchId, setTargetBranchId] = useState(branchId);
  const [scope, setScope] = useState<CatalogImportScope>("everything");
  const [mode, setMode] = useState<CatalogImportMode>("upsert");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingApply, setLoadingApply] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPreview(null);
    setError(null);
  }, [file, targetBranchId, scope, mode]);

  async function handlePreview() {
    if (!file) {
      setError("Elegí un archivo XLSX primero.");
      return;
    }

    setLoadingPreview(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("targetBranchId", targetBranchId);
    formData.append("scope", scope);
    formData.append("mode", mode);

    try {
      const response = await fetch("/api/productos/import/preview", {
        method: "POST",
        headers: { "x-branch-id": branchId },
        body: formData,
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "No pudimos analizar el archivo.");
      }

      setPreview(data);
    } catch (previewError) {
      setPreview(null);
      setError(previewError instanceof Error ? previewError.message : "No pudimos analizar el archivo.");
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleApply() {
    if (!file || !preview || preview.errors.length > 0) {
      return;
    }

    setLoadingApply(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("targetBranchId", targetBranchId);
    formData.append("scope", scope);
    formData.append("mode", mode);

    try {
      const response = await fetch("/api/productos/import/apply", {
        method: "POST",
        headers: { "x-branch-id": branchId },
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(typeof data?.error === "string" ? data.error : "No pudimos importar el archivo.");
      }

      onApplied(
        `Archivo aplicado en ${data?.branchName ?? preview.branchName}. ${data?.appliedProducts ?? 0} producto${data?.appliedProducts === 1 ? "" : "s"} tocado${data?.appliedProducts === 1 ? "" : "s"}.`,
      );
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "No pudimos importar el archivo.");
    } finally {
      setLoadingApply(false);
    }
  }

  const pricingTouchesAllBranches = pricingMode === "SHARED" && (scope === "everything" || scope === "pricing");

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div
        className="modal animate-slide-up"
        onClick={(event) => event.stopPropagation()}
        style={{ maxWidth: "760px", width: "min(760px, calc(100vw - 24px))", maxHeight: "90dvh" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 800, margin: 0 }}>Importar plantilla</h2>
            <p style={{ margin: "6px 0 0", color: "var(--text-3)", fontSize: "13px" }}>
              Subí un XLSX exportado desde Kiosco24 y revisá el impacto antes de aplicar.
            </p>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={onClose}>Cerrar</button>
        </div>

        <div style={{ display: "grid", gap: "14px", marginTop: "18px" }}>
          <div style={{ display: "grid", gap: "8px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Archivo
            </label>
            <input
              className="input"
              type="file"
              accept=".xlsx"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
          </div>

          <div style={{ display: "grid", gap: "8px" }}>
            <label style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Sucursal destino
            </label>
            <select
              className="input"
              value={targetBranchId}
              onChange={(event) => setTargetBranchId(event.target.value)}
              style={{ background: "var(--surface)", cursor: "pointer" }}
            >
              {branchOptions.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Qué querés aplicar
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {scopeOptions.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: "flex",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: `1px solid ${scope === option.value ? "rgba(34,197,94,0.35)" : "var(--border)"}`,
                    background: scope === option.value ? "rgba(34,197,94,0.08)" : "var(--surface-2)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    style={{ marginTop: "3px" }}
                  />
                  <span>
                    <span style={{ display: "block", fontWeight: 700, color: "#fff" }}>{option.label}</span>
                    <span style={{ display: "block", marginTop: "4px", fontSize: "13px", color: "var(--text-3)" }}>
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
              Cómo querés aplicarlo
            </div>
            <div style={{ display: "grid", gap: "8px" }}>
              {modeOptions.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: "flex",
                    gap: "10px",
                    padding: "12px 14px",
                    borderRadius: "14px",
                    border: `1px solid ${mode === option.value ? "rgba(34,197,94,0.35)" : "var(--border)"}`,
                    background: mode === option.value ? "rgba(34,197,94,0.08)" : "var(--surface-2)",
                    cursor: "pointer",
                  }}
                >
                  <input
                    type="radio"
                    checked={mode === option.value}
                    onChange={() => setMode(option.value)}
                    style={{ marginTop: "3px" }}
                  />
                  <span>
                    <span style={{ display: "block", fontWeight: 700, color: "#fff" }}>{option.label}</span>
                    <span style={{ display: "block", marginTop: "4px", fontSize: "13px", color: "var(--text-3)" }}>
                      {option.description}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {pricingTouchesAllBranches && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(245,158,11,0.12)",
                border: "1px solid rgba(245,158,11,0.24)",
                color: "var(--amber)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              Este kiosco usa precios compartidos. Si importás precios, el cambio se replica a todas las sucursales.
            </div>
          )}

          {error && (
            <div
              style={{
                padding: "12px 14px",
                borderRadius: "14px",
                background: "rgba(239,68,68,0.12)",
                border: "1px solid rgba(239,68,68,0.24)",
                color: "var(--red)",
                fontSize: "13px",
                fontWeight: 600,
              }}
            >
              {error}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-green" onClick={handlePreview} disabled={!file || loadingPreview}>
              {loadingPreview ? "Analizando..." : "Analizar archivo"}
            </button>
          </div>

          {preview && (
            <div
              style={{
                display: "grid",
                gap: "14px",
                paddingTop: "6px",
                borderTop: "1px solid var(--border)",
              }}
            >
              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Resumen
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "8px" }}>
                  {[
                    ["Coinciden", preview.summary.matchedProducts],
                    ["Se omiten", preview.summary.skippedProducts],
                    ["Crea base", preview.summary.inventoryCreates],
                    ["Actualiza base", preview.summary.inventoryUpdates],
                    ["Crea variantes", preview.summary.variantInventoryCreates],
                    ["Lotes", preview.summary.lotOwners],
                  ].map(([label, value]) => (
                    <div
                      key={String(label)}
                      style={{
                        padding: "12px",
                        borderRadius: "14px",
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ fontSize: "11px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                        {label}
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "22px", fontWeight: 800, color: "#fff" }}>{value}</div>
                    </div>
                  ))}
                </div>
              </div>

              {preview.errors.length > 0 && (
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", color: "var(--red)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Revisar antes de importar
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {preview.errors.map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "12px",
                          background: "rgba(239,68,68,0.12)",
                          border: "1px solid rgba(239,68,68,0.24)",
                          color: "var(--red)",
                          fontSize: "13px",
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.warnings.length > 0 && (
                <div style={{ display: "grid", gap: "8px" }}>
                  <div style={{ fontSize: "12px", color: "var(--amber)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    Avisos
                  </div>
                  <div style={{ display: "grid", gap: "8px" }}>
                    {preview.warnings.slice(0, 8).map((item, index) => (
                      <div
                        key={`${item}-${index}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: "12px",
                          background: "rgba(245,158,11,0.12)",
                          border: "1px solid rgba(245,158,11,0.24)",
                          color: "var(--amber)",
                          fontSize: "13px",
                        }}
                      >
                        {item}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "grid", gap: "8px" }}>
                <div style={{ fontSize: "12px", color: "var(--text-3)", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                  Primeras filas
                </div>
                <div style={{ display: "grid", gap: "8px", maxHeight: "220px", overflowY: "auto" }}>
                  {preview.items.map((item) => (
                    <div
                      key={item.key}
                      style={{
                        padding: "12px 14px",
                        borderRadius: "14px",
                        border: "1px solid var(--border)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", alignItems: "center" }}>
                        <div style={{ fontWeight: 700, color: "#fff" }}>{item.name}</div>
                        <span
                          style={{
                            padding: "4px 8px",
                            borderRadius: "999px",
                            fontSize: "11px",
                            fontWeight: 700,
                            color: item.action === "update" ? "var(--green)" : "var(--amber)",
                            background: item.action === "update" ? "rgba(34,197,94,0.12)" : "rgba(245,158,11,0.12)",
                            border: `1px solid ${item.action === "update" ? "rgba(34,197,94,0.24)" : "rgba(245,158,11,0.24)"}`,
                          }}
                        >
                          {item.action === "update" ? "Aplicar" : "Omitir"}
                        </span>
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "13px", color: "var(--text-3)" }}>{item.detail}</div>
                      {item.lotCount > 0 && (
                        <div style={{ marginTop: "6px", fontSize: "12px", color: "var(--amber)", fontWeight: 600 }}>
                          {item.lotCount} vencimiento{item.lotCount === 1 ? "" : "s"}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <button className="btn btn-ghost" onClick={handlePreview} disabled={loadingPreview}>
                  Reanalizar
                </button>
                <button
                  className="btn btn-green"
                  onClick={handleApply}
                  disabled={loadingApply || preview.errors.length > 0 || preview.summary.matchedProducts === 0}
                >
                  {loadingApply ? "Importando..." : "Importar ahora"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
