"use client";

import { startTransition, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import PlatformCouponQrActions from "./PlatformCouponQrActions";
import {
  downloadPlatformCouponsPdf,
  type PlatformCouponAssetItem,
} from "./platform-coupon-downloads";
import {
  getPlatformCouponBenefitLabel,
  normalizePlatformCouponCode,
} from "@/lib/platform-coupons";

type CouponType = "TRIAL_DAYS" | "SUBSCRIPTION_DISCOUNT";
type CouponDuration = "ONCE" | "FOR_MONTHS" | "RECURRING";

type CreatedPlatformCoupon = PlatformCouponAssetItem & {
  registerPath: string;
};

type PlatformCouponGeneratorProps = {
  defaultExpiresAt: string;
  placeholderCode: string;
};

function buildSeriesPreview(baseCode: string, count: number) {
  const normalized = normalizePlatformCouponCode(baseCode).replace(/-+$/g, "");
  if (!normalized || count <= 1) {
    return null;
  }

  const width = Math.max(2, String(count).length);
  return `${normalized}-01 ... ${normalized}-${String(count).padStart(width, "0")}`;
}

export default function PlatformCouponGenerator({
  defaultExpiresAt,
  placeholderCode,
}: PlatformCouponGeneratorProps) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [count, setCount] = useState("1");
  const [type, setType] = useState<CouponType>("SUBSCRIPTION_DISCOUNT");
  const [trialDays, setTrialDays] = useState("");
  const [discountPct, setDiscountPct] = useState("50");
  const [duration, setDuration] = useState<CouponDuration>("FOR_MONTHS");
  const [durationMonths, setDurationMonths] = useState("3");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresAt, setExpiresAt] = useState(defaultExpiresAt);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [generatedCoupons, setGeneratedCoupons] = useState<CreatedPlatformCoupon[]>([]);
  const [generatedBenefitLabel, setGeneratedBenefitLabel] = useState("");
  const [generatedNote, setGeneratedNote] = useState<string | null>(null);
  const [linksCopied, setLinksCopied] = useState(false);

  const safeCount = Math.max(1, Math.min(Number.parseInt(count || "1", 10) || 1, 500));
  const safeTrialDays = Number.parseInt(trialDays || "0", 10) || null;
  const safeDiscountPct = Number.parseInt(discountPct || "0", 10) || null;
  const safeDurationMonths = Number.parseInt(durationMonths || "0", 10) || null;

  const benefitPreview = useMemo(
    () =>
      getPlatformCouponBenefitLabel({
        trialDays: type === "TRIAL_DAYS" ? safeTrialDays : null,
        discountPct: type === "SUBSCRIPTION_DISCOUNT" ? safeDiscountPct : null,
        duration: type === "SUBSCRIPTION_DISCOUNT" ? duration : "ONCE",
        durationMonths: type === "SUBSCRIPTION_DISCOUNT" ? safeDurationMonths : null,
      }) || "Cupon de plataforma",
    [duration, safeDiscountPct, safeDurationMonths, safeTrialDays, type],
  );

  const seriesPreview = useMemo(() => buildSeriesPreview(code, safeCount), [code, safeCount]);

  const handleGenerate = async (downloadPdfOnSuccess: boolean) => {
    setStatus("submitting");
    setErrorMessage("");
    setSuccessMessage("");
    setLinksCopied(false);

    try {
      const response = await fetch("/api/admin/platform-coupons", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          count: safeCount,
          type,
          trialDays: type === "TRIAL_DAYS" ? safeTrialDays : null,
          discountPct: type === "SUBSCRIPTION_DISCOUNT" ? safeDiscountPct : null,
          duration: type === "SUBSCRIPTION_DISCOUNT" ? duration : "ONCE",
          durationMonths:
            type === "SUBSCRIPTION_DISCOUNT" && duration === "FOR_MONTHS"
              ? safeDurationMonths
              : null,
          maxUses,
          expiresAt,
          note,
        }),
      });

      const data = (await response.json()) as {
        error?: string;
        benefitLabel?: string;
        coupons?: CreatedPlatformCoupon[];
      };

      if (!response.ok || !data.coupons) {
        throw new Error(data.error || "No pudimos generar los cupones.");
      }

      setGeneratedCoupons(data.coupons);
      setGeneratedBenefitLabel(data.benefitLabel || benefitPreview);
      setGeneratedNote(note.trim() || null);
      setSuccessMessage(
        data.coupons.length === 1
          ? "Cupon generado y listo para compartir."
          : `Serie generada con ${data.coupons.length} cupones.`,
      );
      setStatus("success");

      startTransition(() => {
        router.refresh();
      });

      if (downloadPdfOnSuccess) {
        try {
          await downloadPlatformCouponsPdf({
            coupons: data.coupons,
            benefitLabel: data.benefitLabel || benefitPreview,
            note: note.trim() || null,
            filename:
              data.coupons.length === 1
                ? `platform-coupon-${data.coupons[0].code}.pdf`
                : `platform-coupons-${Date.now()}.pdf`,
          });
        } catch (pdfError) {
          console.error(pdfError);
          setErrorMessage("Los cupones se generaron, pero no pudimos descargar el PDF.");
        }
      }
    } catch (error) {
      console.error(error);
      setStatus("error");
      setErrorMessage(
        error instanceof Error ? error.message : "No pudimos generar los cupones.",
      );
    }
  };

  const handleCopyLinks = async () => {
    if (generatedCoupons.length === 0) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        generatedCoupons
          .map((coupon) => new URL(coupon.registerPath, window.location.origin).toString())
          .join("\n"),
      );
      setLinksCopied(true);
    } catch {
      setErrorMessage("No pudimos copiar los links generados.");
    }
  };

  return (
    <div style={{ display: "grid", gap: "18px" }}>
      <div style={{ display: "grid", gap: "6px" }}>
        <h2 style={{ margin: 0, fontSize: "24px" }}>Crear cupon o serie</h2>
        <div style={{ color: "#94a3b8", lineHeight: 1.6 }}>
          Genera uno o varios cupones con QR listo para compartir, descargar o convertir a PDF
          en el mismo paso.
        </div>
      </div>

      <div
        style={{
          padding: "14px 16px",
          borderRadius: "16px",
          border: "1px solid rgba(34,197,94,.22)",
          background: "rgba(22,163,74,.08)",
          color: "#dcfce7",
          lineHeight: 1.6,
        }}
      >
        Si completas un codigo y pides mas de un cupon, se usa como prefijo de serie.
        Si lo dejas vacio, Clikit genera los codigos automaticamente.
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px",
        }}
      >
        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>
            Codigo o prefijo
          </span>
          <input
            value={code}
            onChange={(event) => setCode(normalizePlatformCouponCode(event.target.value))}
            className="input"
            placeholder={placeholderCode}
            autoComplete="off"
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>
            Cantidad
          </span>
          <input
            value={count}
            onChange={(event) => setCount(event.target.value)}
            name="count"
            type="number"
            min={1}
            max={500}
            className="input"
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Tipo</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value as CouponType)}
            className="input"
          >
            <option value="SUBSCRIPTION_DISCOUNT">Descuento</option>
            <option value="TRIAL_DAYS">Trial</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Trial days</span>
          <input
            value={trialDays}
            onChange={(event) => setTrialDays(event.target.value)}
            type="number"
            min={1}
            className="input"
            placeholder="30"
            disabled={type !== "TRIAL_DAYS"}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Discount %</span>
          <input
            value={discountPct}
            onChange={(event) => setDiscountPct(event.target.value)}
            type="number"
            min={1}
            max={100}
            className="input"
            placeholder="50"
            disabled={type !== "SUBSCRIPTION_DISCOUNT"}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Duracion</span>
          <select
            value={duration}
            onChange={(event) => setDuration(event.target.value as CouponDuration)}
            className="input"
            disabled={type !== "SUBSCRIPTION_DISCOUNT"}
          >
            <option value="ONCE">Una vez</option>
            <option value="FOR_MONTHS">Por meses</option>
            <option value="RECURRING">Recurrente</option>
          </select>
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>
            Meses de duracion
          </span>
          <input
            value={durationMonths}
            onChange={(event) => setDurationMonths(event.target.value)}
            type="number"
            min={1}
            className="input"
            placeholder="3"
            disabled={type !== "SUBSCRIPTION_DISCOUNT" || duration !== "FOR_MONTHS"}
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Usos maximos</span>
          <input
            value={maxUses}
            onChange={(event) => setMaxUses(event.target.value)}
            type="number"
            min={1}
            className="input"
          />
        </label>

        <label style={{ display: "grid", gap: "6px" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Expira</span>
          <input
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            type="datetime-local"
            className="input"
            required
          />
        </label>

        <label style={{ display: "grid", gap: "6px", gridColumn: "1 / -1" }}>
          <span style={{ fontSize: "12px", fontWeight: 700, color: "#cbd5e1" }}>Nota interna</span>
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            className="input"
            rows={3}
            placeholder="Campana, partner, origen o condicion comercial"
            style={{ resize: "vertical" }}
          />
        </label>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "12px",
        }}
      >
        <div
          style={{
            padding: "14px",
            borderRadius: "16px",
            background: "rgba(15,23,42,.72)",
            border: "1px solid rgba(148,163,184,.12)",
            display: "grid",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase" }}>
            Beneficio
          </span>
          <strong style={{ fontSize: "16px" }}>{benefitPreview}</strong>
        </div>

        <div
          style={{
            padding: "14px",
            borderRadius: "16px",
            background: "rgba(15,23,42,.72)",
            border: "1px solid rgba(148,163,184,.12)",
            display: "grid",
            gap: "4px",
          }}
        >
          <span style={{ fontSize: "12px", color: "#94a3b8", textTransform: "uppercase" }}>
            Vista previa de serie
          </span>
          <strong style={{ fontSize: "16px" }}>
            {seriesPreview || (safeCount > 1 ? "Serie automatica" : "Cupon individual")}
          </strong>
        </div>
      </div>

      {errorMessage ? (
        <div
          style={{
            borderRadius: "16px",
            padding: "12px 14px",
            background: "rgba(239,68,68,.12)",
            color: "#fecaca",
            border: "1px solid rgba(239,68,68,.2)",
          }}
        >
          {errorMessage}
        </div>
      ) : null}

      {successMessage ? (
        <div
          style={{
            borderRadius: "16px",
            padding: "12px 14px",
            background: "rgba(34,197,94,.12)",
            color: "#bbf7d0",
            border: "1px solid rgba(34,197,94,.2)",
          }}
        >
          {successMessage}
        </div>
      ) : null}

      <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", flexWrap: "wrap" }}>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void handleGenerate(false)}
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Generando..." : "Crear cupones"}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => void handleGenerate(true)}
          disabled={status === "submitting"}
        >
          {status === "submitting" ? "Preparando..." : "Crear y descargar PDF"}
        </button>
      </div>

      {generatedCoupons.length > 0 ? (
        <section
          style={{
            display: "grid",
            gap: "16px",
            padding: "18px",
            borderRadius: "20px",
            background: "rgba(15,23,42,.75)",
            border: "1px solid rgba(34,197,94,.16)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "12px",
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <div style={{ display: "grid", gap: "4px" }}>
              <h3 style={{ margin: 0, fontSize: "20px" }}>Ultima serie generada</h3>
              <span style={{ color: "#94a3b8" }}>
                {generatedCoupons.length} cupon(es) listos para compartir.
              </span>
            </div>
            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  void downloadPlatformCouponsPdf({
                    coupons: generatedCoupons,
                    benefitLabel: generatedBenefitLabel,
                    note: generatedNote,
                  })
                }
              >
                Descargar PDF de la serie
              </button>
              <button type="button" className="btn btn-ghost" onClick={handleCopyLinks}>
                {linksCopied ? "Links copiados" : "Copiar links"}
              </button>
            </div>
          </div>

          <div style={{ display: "grid", gap: "10px" }}>
            {generatedCoupons.map((coupon) => (
              <article
                key={coupon.code}
                style={{
                  padding: "14px 16px",
                  borderRadius: "16px",
                  background: "rgba(30,41,59,.82)",
                  display: "grid",
                  gap: "10px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px",
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ display: "grid", gap: "4px" }}>
                    <strong style={{ fontSize: "18px" }}>{coupon.code}</strong>
                    <span style={{ color: "#94a3b8" }}>{generatedBenefitLabel}</span>
                  </div>
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                    <a
                      href={coupon.registerPath}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost"
                      style={{ textDecoration: "none" }}
                    >
                      Abrir link
                    </a>
                    <PlatformCouponQrActions
                      code={coupon.code}
                      expiresAt={coupon.expiresAt}
                      benefitLabel={generatedBenefitLabel}
                      note={generatedNote}
                      registerPath={coupon.registerPath}
                    />
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
