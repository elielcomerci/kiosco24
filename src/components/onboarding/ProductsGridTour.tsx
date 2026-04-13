"use client";

import { useEffect } from "react";
import { useTour } from "./TourProvider";

export function ProductsGridTour({ shouldShow }: { shouldShow: boolean }) {
  const { masterActive, isModuleCompleted, markModuleCompleted, dismissAll, lastManualTrigger } = useTour();
  
  useEffect(() => {
    // Si la persona ya desactivó todo o si este módulo se completó, abortamos.
    if (!masterActive || isModuleCompleted("productos-grid")) return;

    // Si NO es un trigger manual reciente (últimos 2 seg), respetamos shouldShow
    const isManual = (Date.now() - lastManualTrigger) < 2000;
    if (!shouldShow && !isManual) return;

    let driverObj: any = null;
    let destroyed = false;

    const initTour = () => {
      // Verificamos si los elementos clave están en el DOM antes de disparar el tour
      if (!document.querySelector("#tour-new-product")) return;

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
          stagePadding: 10,
          stageRadius: 16,
          popoverClass: "clikit-tour-popover",
          onDestroyStarted: () => {
            driverObj?.destroy();
          },
          steps: [
            {
              element: "#tour-new-product",
              popover: {
                title: "Nuevo Producto 📦",
                description:
                  "Tocá acá para cargar tu inventario. Podés escanear el código de barras y te traemos los datos automáticamente.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#tour-receive-btn",
              popover: {
                title: "Ingreso de Stock 📥",
                description:
                  "Cuando llegue mercadería, usá este botón para sumar cantidades y cargar vencimientos rápidamente.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                prevBtnText: "← Atrás",
                doneBtnText: "Entendido",
                onNextClick: () => {
                   markModuleCompleted("productos-grid");
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
    };

    // Pequeño delay para asegurar que el DOM esté listo tras el clic en el menú
    const timer = setTimeout(initTour, 200);

    return () => {
      destroyed = true;
      clearTimeout(timer);
      if (driverObj) {
        driverObj.destroy();
      }
    };
  }, [masterActive, isModuleCompleted, shouldShow, markModuleCompleted, dismissAll, lastManualTrigger]);

  return null;
}
