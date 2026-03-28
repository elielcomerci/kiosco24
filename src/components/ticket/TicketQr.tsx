"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export default function TicketQr({
  value,
}: {
  value: string;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const generate = async () => {
      try {
        const nextSrc = await QRCode.toDataURL(value, {
          width: 144,
          margin: 1,
          errorCorrectionLevel: "M",
        });

        if (active) {
          setSrc(nextSrc);
        }
      } catch {
        if (active) {
          setSrc(null);
        }
      }
    };

    void generate();

    return () => {
      active = false;
    };
  }, [value]);

  if (!src) {
    return null;
  }

  return (
    <div className="ticket-preview__qr">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="QR para pedir" className="ticket-preview__qr-image" />
      <div className="ticket-preview__qr-caption">Pedí directo desde este QR</div>
    </div>
  );
}
