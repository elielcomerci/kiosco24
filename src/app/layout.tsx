import type { Metadata, Viewport } from "next";
import "./globals.css";
import Script from "next/script";
import { Open_Sans } from "next/font/google"; // Added this import based on usage in the provided code

const openSans = Open_Sans({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Kiosco 24h",
  description: "POS rápido para kioscos argentinos",
  manifest: "/manifest.json",
  // Removed appleWebApp as it's not in the provided target
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0a0a0a",
};

export default function RootLayout({
  children,
}: Readonly<{ // Changed type definition to Readonly
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning={true}><body className={openSans.className}>{children}<Script id="sw-register" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: `if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function(reg) { reg.update(); console.log('SW registration successful'); }, function(err) { console.log('SW registration failed: ', err); }); }); }` }} /></body></html>
  );
}
