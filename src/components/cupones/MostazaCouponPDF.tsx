import React from "react";
import { Document, Page, Text, View, StyleSheet, Image } from "@react-pdf/renderer";

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  page: {
    backgroundColor: "#ffffff",
    flexDirection: "column",
    padding: 0,
  },

  // ── Header ──
  header: {
    height: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 20,
    gap: 12,
  },
  logoImg: {
    width: 44,
    height: 44,
    borderRadius: 8,
    objectFit: "contain",
  },
  headerText: {
    color: "#ffffff",
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 0.5,
  },

  // ── Divider line ──
  divider: {
    height: 3,
    width: "100%",
  },

  // ── Promo section ──
  promoSection: {
    paddingHorizontal: 28,
    paddingVertical: 22,
    alignItems: "center",
  },
  promoTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    marginBottom: 8,
    color: "#1a202c",
  },
  promoDetail: {
    fontSize: 11,
    fontFamily: "Helvetica",
    textAlign: "center",
    color: "#4a5568",
    lineHeight: 1.5,
  },

  // ── Separator dashed ──
  dashed: {
    marginHorizontal: 24,
    borderBottomWidth: 1,
    borderBottomColor: "#cbd5e0",
    borderStyle: "dashed",
    marginVertical: 14,
  },

  // ── QR section ──
  qrSection: {
    alignItems: "center",
    paddingHorizontal: 28,
    paddingBottom: 18,
  },
  qrLabel: {
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#718096",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  qrImage: {
    width: 160,
    height: 160,
  },
  code: {
    fontSize: 22,
    fontFamily: "Helvetica-Bold",
    letterSpacing: 3,
    marginTop: 10,
    color: "#1a202c",
  },

  // ── Footer ──
  footer: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginTop: "auto",
  },
  footerText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
    letterSpacing: 0.5,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export interface PDFCouponItem {
  code: string;
  qrDataUrl: string;
  expiresAt: string;
}

export interface MostazaCouponPDFProps {
  coupons: PDFCouponItem[];
  brandColor?: string;
  /** Optional logo shown in the header bar */
  logoUrl?: string;
  /** Optional custom photo shown as full-width banner */
  heroImageUrl?: string;
  /** Line 1: branch name / headline shown in the header */
  line1?: string;
  /** Line 2: promo name / offer description */
  line2?: string;
  /** Line 3: detail / what's included / fine print */
  line3?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helper: hex → CMYK-safe rgb contrast check for text colour
// ─────────────────────────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}
function isDark(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance < 0.55;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function MostazaCouponPDF({
  coupons,
  brandColor = "#da251d",
  logoUrl,
  heroImageUrl,
  line1 = "CUPÓN ESPECIAL",
  line2,
  line3,
}: MostazaCouponPDFProps) {
  const textColor = isDark(brandColor) ? "#ffffff" : "#1a202c";

  return (
    <Document>
      {coupons.map((coupon, i) => (
        <Page key={i} size={[340, 520]} style={styles.page}>

          {/* ── Header ─────────────────────────────────────────────── */}
          <View style={[styles.header, { backgroundColor: brandColor }]}>
            {logoUrl ? (
              <Image source={logoUrl} style={styles.logoImg} />
            ) : null}
            <Text style={[styles.headerText, { color: textColor }]}>
              {line1}
            </Text>
          </View>

          {/* ── Top divider ─────────────────────────────────────────── */}
          <View style={[styles.divider, { backgroundColor: brandColor, opacity: 0.3 }]} />

          {/* ── Hero image ──────────────────────────────────────────── */}
          {heroImageUrl ? (
            <Image
              source={heroImageUrl}
              style={{ width: "100%", height: 160, objectFit: "cover" }}
            />
          ) : null}


          {/* ── Promo description ───────────────────────────────────── */}
          {(line2 || line3) ? (
            <View style={styles.promoSection}>
              {line2 ? (
                <Text style={styles.promoTitle}>{line2}</Text>
              ) : null}
              {line3 ? (
                <Text style={styles.promoDetail}>{line3}</Text>
              ) : null}
            </View>
          ) : (
            <View style={{ height: 16 }} />
          )}

          {/* ── Dashed separator ────────────────────────────────────── */}
          <View style={styles.dashed} />

          {/* ── QR + Code ───────────────────────────────────────────── */}
          <View style={styles.qrSection}>
            <Text style={styles.qrLabel}>Escaneá o presentá este código</Text>
            <Image source={coupon.qrDataUrl} style={styles.qrImage} />
            <Text style={[styles.code, { color: brandColor }]}>{coupon.code}</Text>
          </View>

          {/* ── Footer ──────────────────────────────────────────────── */}
          <View style={[styles.footer, { backgroundColor: brandColor }]}>
            <Text style={[styles.footerText, { color: textColor }]}>
              Válido hasta el {new Date(coupon.expiresAt).toLocaleDateString("es-AR")}
            </Text>
          </View>

        </Page>
      ))}
    </Document>
  );
}
