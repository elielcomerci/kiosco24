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
      // Verificamos si los elementos clave están en el DOM antes de disparar el tour
      if (!document.querySelector("#product-modal-barcode")) return;

      import("driver.js").then(({ driver }) => {
        if (destroyed) return;

        driverObj = driver({
          showProgress: false,
          animate: true,
          smoothScroll: true,
          allowClose: true,
          // @ts-expect-error The type definitions for driver.js are outdated but it works
          allowInteraction: true,
          overlayColor: "rgba(6, 8, 13, 0.9)",
          stagePadding: 16, // Más padding para que el input respire en el modal
          stageRadius: 16,
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
                description: "Si el producto tiene código, anotalo o escanealo acá para que la caja lo reconozca al instante.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#product-modal-prices",
              popover: {
                title: "Precios y Margen 💰",
                description: "Cargando el costo y el precio de venta, te calculamos automáticamente la rentabilidad de cada producto.",
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

        if (!destroyed && driverObj) {
          driverObj.drive();
        }
      });
    }, 500); // 500ms delay for mount animation

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
