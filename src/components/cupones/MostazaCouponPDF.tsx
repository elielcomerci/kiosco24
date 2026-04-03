import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    width: 350,
    height: 700,
    padding: 0,
  },
  header: {
    height: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  headerText: {
    color: '#ffffff',
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  },
  heroImage: {
    height: 250,
    width: '100%',
    objectFit: 'cover',
  },
  heroFallback: {
    height: 250,
    width: '100%',
    backgroundColor: '#1E293B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: '#ffffff',
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
  },
  codeSection: {
    paddingTop: 30,
    alignItems: 'center',
    flex: 1,
  },
  label: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 15,
  },
  code: {
    fontSize: 28,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 30,
    letterSpacing: 2,
  },
  qrImage: {
    width: 200,
    height: 200,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 20,
  },
  footerText: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
  }
});

export interface PDFCouponItem {
  code: string;
  qrDataUrl: string; // Base64 png generated from qrcode lib
  expiresAt: string;
}

export interface MostazaCouponPDFProps {
  coupons: PDFCouponItem[];
  brandColor?: string;
  imageUrl?: string;
  promoTitle?: string;
}

export function MostazaCouponPDF({ coupons, brandColor = '#da251d', imageUrl, promoTitle }: MostazaCouponPDFProps) {
  return (
    <Document>
      {coupons.map((coupon, i) => (
        <Page key={i} size={[350, 700]} style={styles.page}>
          
          <View style={[styles.header, { backgroundColor: brandColor }]}>
            <Text style={styles.headerText}>CUPONES</Text>
          </View>

          {imageUrl ? (
            <Image source={imageUrl} style={styles.heroImage} />
          ) : (
            <View style={[styles.heroFallback, { backgroundColor: brandColor }]}>
              <Text style={styles.fallbackText}>{promoTitle || "CUPÓN ESPECIAL"}</Text>
            </View>
          )}

          <View style={styles.codeSection}>
            <Text style={styles.label}>Tu código es:</Text>
            <Text style={styles.code}>{coupon.code}</Text>
            
            <Image source={coupon.qrDataUrl} style={styles.qrImage} />
          </View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>
              Vence el {new Date(coupon.expiresAt).toLocaleDateString('es-AR')}
            </Text>
          </View>
          
        </Page>
      ))}
    </Document>
  );
}
