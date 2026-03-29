"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface ImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors?: string[];
}

const EXAMPLE_ROWS = [
  "barcode;nombre;marca;categoria;presentacion;descripcion;imagen;estado",
  "7790895000998;Coca-Cola 500 ml;Coca-Cola;Bebidas;500 ml;Gaseosa cola;;APPROVED",
  "7790040171207;Papas Lays Clasicas;Lays;Snacks;150 g;Papas fritas clasicas;;APROBADO",
];

function countRows(raw: string) {
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

export default function PlatformProductBulkImporter() {
  const router = useRouter();
  const [raw, setRaw] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const rowsCount = useMemo(() => countRows(raw), [raw]);

  const handleSubmit = () => {
    setMessage(null);
    setError(null);
    setSummary(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/admin/platform-products/bulk", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ raw }),
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok) {
          setError(typeof data.error === "string" ? data.error : "No se pudo importar la lista.");
          return;
        }

        const nextSummary: ImportSummary = {
          created: Number(data.created ?? 0),
          updated: Number(data.updated ?? 0),
          skipped: Number(data.skipped ?? 0),
          errors: Array.isArray(data.errors)
            ? data.errors.filter((item: unknown): item is string => typeof item === "string")
            : [],
        };

        setSummary(nextSummary);
        setMessage("Importacion completada.");
        setRaw("");
        router.refresh();
      } catch (err) {
        console.error(err);
        setError("No se pudo importar la lista.");
      }
    });
  };

  return (
    <section
      style={{
        background: "rgba(15,23,42,.82)",
        border: "1px solid rgba(148,163,184,.18)",
        borderRadius: "22px",
        padding: "20px",
        display: "grid",
        gap: "16px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "24px" }}>Importacion masiva</h2>
          <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
            Crea o corrige varias fichas globales de una vez.
          </div>
        </div>
        <div style={{ color: "#94a3b8", fontSize: "14px" }}>{rowsCount} filas detectadas</div>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: "16px",
          background: "rgba(30,41,59,.8)",
          border: "1px solid rgba(148,163,184,.12)",
          color: "#cbd5e1",
          lineHeight: 1.6,
          display: "grid",
          gap: "8px",
        }}
      >
        <div>Formato recomendado: `barcode;nombre;marca;categoria;presentacion;descripcion;imagen;estado`</div>
        <div>Tambien acepta tabulaciones o comas. `estado` puede ser `APPROVED`, `APROBADO`, `HIDDEN` u `OCULTO`.</div>
        <div>No toca stock, precios ni configuracion de los kioscos.</div>
        <pre
          style={{
            margin: 0,
            padding: "12px",
            borderRadius: "12px",
            background: "rgba(2,6,23,.9)",
            color: "#cbd5e1",
            overflowX: "auto",
            whiteSpace: "pre-wrap",
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            fontSize: "12px",
          }}
        >
          {EXAMPLE_ROWS.join("\n")}
        </pre>
      </div>

      <textarea
        className="input"
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={10}
        placeholder="Pega aqui la lista de productos"
        style={{ resize: "vertical" }}
      />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: "12px",
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "grid", gap: "6px" }}>
          <div style={{ color: error ? "#fca5a5" : message ? "#86efac" : "#94a3b8", fontSize: "14px" }}>
            {error || message || "Ideal para pegar una lista curada desde una planilla."}
          </div>
          {summary && (
            <div style={{ color: "#cbd5e1", fontSize: "14px", display: "grid", gap: "4px" }}>
              <div>
                Creados: {summary.created} - Actualizados: {summary.updated} - Omitidos: {summary.skipped}
              </div>
              {summary.errors && summary.errors.length > 0 && (
                <div style={{ color: "#fca5a5", display: "grid", gap: "2px" }}>
                  {summary.errors.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              setRaw("");
              setMessage(null);
              setError(null);
              setSummary(null);
            }}
            disabled={isPending}
          >
            Limpiar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!raw.trim() || isPending}
          >
            {isPending ? "Importando..." : "Importar productos"}
          </button>
        </div>
      </div>
    </section>
  );
}
