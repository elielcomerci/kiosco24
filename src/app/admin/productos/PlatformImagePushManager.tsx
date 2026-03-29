"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export default function PlatformImagePushManager() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handlePush = () => {
    setMessage(null);
    setError(null);

    startTransition(async () => {
      try {
        const response = await fetch("/api/admin/platform-products/push-images", {
          method: "POST",
        });
        const data = await response.json().catch(() => null);

        if (!response.ok) {
          setError(data?.error || "No se pudieron empujar las imagenes.");
          return;
        }

        setMessage(
          `Imagenes aplicadas en ${Number(data?.updatedProducts ?? 0)} producto${Number(data?.updatedProducts ?? 0) === 1 ? "" : "s"} locales desde ${Number(data?.processedSources ?? 0)} ficha${Number(data?.processedSources ?? 0) === 1 ? "" : "s"} globales.`,
        );
        router.refresh();
      } catch (pushError) {
        console.error(pushError);
        setError("No se pudieron empujar las imagenes.");
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
        gap: "14px",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: "12px", flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "24px" }}>Empujar imagenes a kioscos</h2>
          <div style={{ color: "#94a3b8", fontSize: "14px", marginTop: "4px" }}>
            Aplica la foto global aprobada sobre productos locales ya vinculados. No toca nombre, stock ni precios.
          </div>
        </div>
        <button type="button" className="btn btn-secondary" onClick={handlePush} disabled={isPending}>
          {isPending ? "Empujando..." : "Empujar imagenes"}
        </button>
      </div>

      <div style={{ color: error ? "#fca5a5" : message ? "#86efac" : "#94a3b8", fontSize: "14px" }}>
        {error || message || "Usalo cuando corrijas o completes fotos en la base colaborativa y quieras reflejarlas en kioscos existentes."}
      </div>
    </section>
  );
}
