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
            markModuleCompleted("stock-modal");
            driverObj?.destroy();
          },
          steps: [
            {
              element: "#stock-modal-quantity",
              popover: {
                title: "Cantidad a sumar 📦",
                description: "Acá ponés cuántas unidades del producto acaban de entrar.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#stock-modal-lotes",
              popover: {
                title: "Vencimientos y Lotes FEFO 📅",
                description: "Si el producto vence, tocalo. Podés cargarle la fecha de vencimiento y el sistema te va a avisar 30 días antes de que caduque.",
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

        window.requestAnimationFrame(() => {
          if (!destroyed && driverObj) {
            driverObj.drive();
          }
        });
      });
    }, 400);

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
