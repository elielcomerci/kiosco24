"use client";

import { useEffect } from "react";
import { useTour } from "./TourProvider";

export function ProductsGridTour({ shouldShow }: { shouldShow: boolean }) {
  const { masterActive, isModuleCompleted, markModuleCompleted, dismissAll } = useTour();

  useEffect(() => {
    // Si la persona ya desactivó todo o si este módulo se completó, abortamos.
    if (!masterActive || isModuleCompleted("productos-grid")) return;
    if (!shouldShow) return;

    let driverObj: any = null;
    let destroyed = false;

    const initTour = () => {
      import("driver.js").then(({ driver }) => {
        import("driver.js/dist/driver.css" as unknown as string).catch(() => {});

        if (destroyed) return;

        driverObj = driver({
          showProgress: false,
          animate: true,
          smoothScroll: true,
          allowClose: false,
          // @ts-expect-error The type definitions for driver.js are outdated but it works
          allowInteraction: true,
          overlayColor: "rgba(6, 8, 13, 0.82)",
          popoverClass: "clikit-tour-popover",
          onDestroyStarted: () => {
            driverObj?.destroy();
          },
          steps: [
            {
              element: "#tour-new-product",
              popover: {
                title: "Empezar a agregar productos 📦",
                description:
                  "Tocá acá para cargar tu inventario. Podés escanear el código de barras y te traemos la foto y marca automáticamente.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#tour-receive-btn",
              popover: {
                title: "Sumar stock velozmente 📥",
                description:
                  "Cuando te llegue mercadería, desde acá podés sumar las cantidades y cargar fechas de vencimiento.",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                prevBtnText: "← Atrás",
                doneBtnText: "Entendido, no mostrar más",
                onNextClick: () => {
                   markModuleCompleted("productos-grid");
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
    };

    initTour();

    return () => {
      destroyed = true;
      if (driverObj) {
        driverObj.destroy();
      }
    };
  }, [masterActive, isModuleCompleted, shouldShow, markModuleCompleted, dismissAll]);

  return null;
}
