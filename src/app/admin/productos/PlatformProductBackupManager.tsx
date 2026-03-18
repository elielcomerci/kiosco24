"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface BackupImportSummary {
  created: number;
  updated: number;
  skipped: number;
  errors?: string[];
}

export default function PlatformProductBackupManager() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BackupImportSummary | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleExport = async () => {
    setMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/admin/platform-products/backup");
      if (!response.ok) {
        throw new Error("No se pudo exportar el backup.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `kiosco24-platform-catalog-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Backup descargado.");
    } catch (err) {
      console.error(err);
      setError("No se pudo exportar el backup.");
    }
  };

  const handleImport = async (file: File) => {
    setMessage(null);
    setError(null);
    setSummary(null);

    startTransition(async () => {
      try {
        const raw = await file.text();
        const parsed = JSON.parse(raw);

        const response = await fetch("/api/admin/platform-products/backup", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(parsed),
        });

        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          setError(typeof data.error === "string" ? data.error : "No se pudo importar el backup.");
          return;
        }

        setSummary({
          created: Number(data.created ?? 0),
          updated: Number(data.updated ?? 0),
          skipped: Number(data.skipped ?? 0),
          errors: Array.isArray(data.errors)
            ? data.errors.filter((item: unknown): item is string => typeof item === "string")
            : [],
        });
        setMessage("Backup importado.");
        router.refresh();
      } catch (err) {
        console.error(err);
        setError("El archivo no tiene un formato valido.");
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
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
      <div>
        <h2 style={{ margin: 0, fontSize: "24px" }}>Backup del catalogo</h2>
        <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
          Exporta el catalogo global con variantes a JSON y vuelve a cargarlo si necesitas recuperar la base.
        </div>
      </div>

      <div
        style={{
          display: "flex",
          gap: "10px",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <button type="button" className="btn btn-secondary" onClick={handleExport} disabled={isPending}>
          Descargar backup
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => fileInputRef.current?.click()}
          disabled={isPending}
        >
          Importar backup
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: "none" }}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void handleImport(file);
            }
          }}
        />
      </div>

      <div style={{ color: error ? "#fca5a5" : message ? "#86efac" : "#94a3b8", fontSize: "14px" }}>
        {error || message || "Guardalo fuera del sistema para tener una copia segura del catalogo global."}
      </div>

      {summary && (
        <div
          style={{
            padding: "14px 16px",
            borderRadius: "16px",
            background: "rgba(30,41,59,.8)",
            border: "1px solid rgba(148,163,184,.12)",
            display: "grid",
            gap: "6px",
            color: "#cbd5e1",
          }}
        >
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
    </section>
  );
}
