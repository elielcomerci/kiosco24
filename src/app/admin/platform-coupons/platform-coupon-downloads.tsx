"use client";

import { pdf } from "@react-pdf/renderer";
import QRCode from "qrcode";

import { MostazaCouponPDF, type PDFCouponItem } from "@/components/cupones/MostazaCouponPDF";
import { getPlatformCouponRegisterPath } from "@/lib/platform-coupons";

export type PlatformCouponAssetItem = {
  code: string;
  expiresAt: string;
  note?: string | null;
  registerPath?: string | null;
};

type DownloadPlatformCouponPdfInput = {
  coupons: PlatformCouponAssetItem[];
  benefitLabel?: string | null;
  note?: string | null;
  filename?: string;
};

function getCouponRegisterPath(coupon: PlatformCouponAssetItem) {
  return coupon.registerPath || getPlatformCouponRegisterPath(coupon.code);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

export function getPlatformCouponAbsoluteRegisterUrl(coupon: PlatformCouponAssetItem) {
  return new URL(getCouponRegisterPath(coupon), window.location.origin).toString();
}

export async function getPlatformCouponQrPreviewDataUrl(
  coupon: PlatformCouponAssetItem,
  width = 400,
) {
  return QRCode.toDataURL(getPlatformCouponAbsoluteRegisterUrl(coupon), {
    width,
    margin: 1,
    errorCorrectionLevel: "M",
  });
}

export async function downloadPlatformCouponQr(coupon: PlatformCouponAssetItem) {
  const qrDataUrl = await getPlatformCouponQrPreviewDataUrl(coupon, 720);
  downloadDataUrl(qrDataUrl, `platform-coupon-${coupon.code}.png`);
  return qrDataUrl;
}

export async function downloadPlatformCouponsPdf({
  coupons,
  benefitLabel,
  note,
  filename,
}: DownloadPlatformCouponPdfInput) {
  const pdfItems: PDFCouponItem[] = await Promise.all(
    coupons.map(async (coupon) => ({
      code: coupon.code,
      expiresAt: coupon.expiresAt,
      qrDataUrl: await getPlatformCouponQrPreviewDataUrl(coupon),
    })),
  );

  const doc = (
    <MostazaCouponPDF
      coupons={pdfItems}
      brandColor="#16a34a"
      line1="CLIKIT"
      line2={benefitLabel || "Cupon de plataforma"}
      line3={
        note?.trim() || "Escanea el QR o ingresa este codigo al registrarte para activar el beneficio."
      }
    />
  );

  const blob = await pdf(doc).toBlob();
  downloadBlob(blob, filename || `platform-coupons-${Date.now()}.pdf`);
  return blob;
}
