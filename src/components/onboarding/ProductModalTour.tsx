"use client";

import { useEffect } from "react";
import { useTour } from "./TourProvider";

export function ProductModalTour() {
  const { masterActive, isModuleCompleted, markModuleCompleted } = useTour();

  useEffect(() => {
    // Si ya completó este módulo o canceló los tours, no lo mostramos.
    if (!masterActive || isModuleCompleted("product-modal")) return;

    let driverObj: any = null;
    let destroyed = false;

    // Pequeño delay para que el modal termine de renderizarse
    const timer = setTimeout(() => {
      import("driver.js").then(({ driver }) => {
        if (destroyed) return;

        driverObj = driver({
          showProgress: false,
          animate: true,
          smoothScroll: true,
          allowClose: false,
          // @ts-expect-error The type definitions for driver.js are outdated but it works
          allowInteraction: true,
          overlayColor: "rgba(6, 8, 13, 0.8)",
          popoverClass: "clikit-tour-popover",
          onDestroyStarted: () => {
            markModuleCompleted("product-modal");
            driverObj?.destroy();
          },
          steps: [
            {
              element: "#product-modal-barcode",
              popover: {
                title: "Código de Barras 🎯",
                description: "Si el producto tiene código, anotalo o escanealo acá. ¡Te va a salvar la vida cuando quieras cobrar rápido!",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#product-modal-prices",
              popover: {
                title: "Precios y Rentabilidad 💰",
                description: "Podés poner el Costo y el Precio de Venta. Te vamos a calcular automáticamente tu rentabilidad.",
                side: "bottom",
                align: "center",
                nextBtnText: "Entendido",
                prevBtnText: "← Atrás",
                doneBtnText: "Listo",
                onNextClick: () => {
                   markModuleCompleted("product-modal");
                   driverObj?.destroy();
                }
              },
            }
          ],
        });

        window.requestAnimationFrame(() => {
          if (!destroyed && driverObj) {
            driverObj.drive();
          }
        });
      });
    }, 400); // 400ms delay for mount animation

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (driverObj) {
        driverObj.destroy();
      }
    };
  }, [masterActive, isModuleCompleted, markModuleCompleted]);

  return null;
}
