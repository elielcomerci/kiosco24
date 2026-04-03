"use client";

import { useState, useEffect } from "react";
import { formatARS } from "@/lib/utils";

interface DigitalSalesCarouselProps {
  stats: {
    ventasMp?: number;
    ventasDebito?: number;
    ventasTransferencia?: number;
    ventasTarjeta?: number;
  };
}

export default function DigitalSalesCarousel({ stats }: DigitalSalesCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [animating, setAnimating] = useState(false);

  const mp = stats.ventasMp ?? 0;
  const debito = stats.ventasDebito ?? 0;
  const transferencia = stats.ventasTransferencia ?? 0;
  const tarjeta = stats.ventasTarjeta ?? 0;
  const totalDigital = mp + debito + transferencia + tarjeta;

  const slides = [
    { label: "Total Digital", value: totalDigital, color: "var(--primary)" },
    { label: "MercadoPago", value: mp, color: "#00b1ea" },
    { label: "Transferencia", value: transferencia, color: "var(--text)" },
    { label: "Débito", value: debito, color: "var(--text)" },
    { label: "Tarjeta", value: tarjeta, color: "var(--text)" },
  ];

  const handleNext = () => {
    if (animating) return;
    setAnimating(true);
    
    // Animar la salida del número actual
    setTimeout(() => {
      setCurrentIndex((prev) => (prev + 1) % slides.length);
      // El nuevo número entra animado en los próximos milisegundos a través de la clase en el renderizado
      
      setTimeout(() => {
        setAnimating(false);
      }, 150); // Tiempo de entrada
    }, 150); // Tiempo de salida
  };

  const currentSlide = slides[currentIndex];

  return (
    <button
      type="button"
      className="status-bar-item"
      onClick={handleNext}
      style={{
        alignItems: "flex-end",
        border: "none",
        background: "transparent",
        cursor: "pointer",
        position: "relative",
        minWidth: "140px",
        height: "100%",
        overflow: "hidden"
      }}
      title="Tocar para ver desglose de pagos digitales"
    >
      <div 
        style={{ 
          display: "flex", 
          flexDirection: "column", 
          alignItems: "flex-end", 
          width: "100%",
          transition: "all 0.15s ease-in-out",
          opacity: animating ? 0 : 1,
          transform: animating ? "translateY(10px) rotateX(-20deg)" : "translateY(0) rotateX(0deg)"
        }}
      >
        <span className="status-bar-label">{currentSlide.label}</span>
        <span className="status-bar-value" style={{ color: currentSlide.color }}>
          {formatARS(currentSlide.value)}
        </span>
      </div>
    </button>
  );
}
