"use client";

import { useEffect } from "react";
import { useTour } from "./TourProvider";

export function StockModalTour() {
  const { masterActive, isModuleCompleted, markModuleCompleted } = useTour();

  useEffect(() => {
    if (!masterActive || isModuleCompleted("stock-modal")) return;

    let driverObj: any = null;
    let destroyed = false;

    const timer = setTimeout(() => {
      // Verificamos si los elementos clave están en el DOM antes de disparar el tour
      if (!document.querySelector("#stock-modal-quantity")) return;

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
          stagePadding: 16,
          stageRadius: 16,
          popoverClass: "clikit-tour-popover",
          onDestroyStarted: () => {
             markModuleCompleted("stock-modal");
             driverObj?.destroy();
          },
          steps: [
            {
              element: "#stock-modal-quantity",
              popover: {
                title: "Cantidad a sumar 📦",
                description: "Acá ponés cuántas unidades del producto acaban de entrar a tu local.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#stock-modal-lotes",
              popover: {
                title: "Vencimientos y Lotes 📅",
                description: "Si el producto tiene fecha de vencimiento, cargala acá para que el sistema te avise 30 días antes de que caduque.",
                side: "bottom",
                align: "center",
                nextBtnText: "Entendido",
                prevBtnText: "← Atrás",
                doneBtnText: "Listo",
                onNextClick: () => {
                   markModuleCompleted("stock-modal");
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
    }, 500);

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
