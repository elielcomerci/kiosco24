import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { GeistSans } from "geist/font/sans";
import { BRAND_ICON_SRC } from "@/lib/brand";

import "./globals.css";

export const metadata: Metadata = {
  title: "Clikit",
  description: "POS rapido para kioscos y comercios argentinos",
  manifest: "/manifest.json",
  icons: {
    icon: [{ url: BRAND_ICON_SRC, type: "image/svg+xml" }],
    apple: "/apple-touch-icon.png",
  },
  appleWebApp: {
    capable: true,
    title: "Clikit",
    statusBarStyle: "default",
  },
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
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={GeistSans.variable} suppressHydrationWarning>
      <body>
        {children}
        <Script
          id="sw-register"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html:
              "if ('serviceWorker' in navigator) { window.addEventListener('load', function() { navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function(reg) { reg.update(); console.log('SW registration successful'); }, function(err) { console.log('SW registration failed: ', err); }); }); }",
          }}
        />
      </body>
    </html>
  );
}
