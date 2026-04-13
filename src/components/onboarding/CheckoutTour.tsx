"use client";

import { useEffect } from "react";
import { useTour } from "./TourProvider";

export function CheckoutTour() {
  const { masterActive, isModuleCompleted, markModuleCompleted } = useTour();

  useEffect(() => {
    if (!masterActive || isModuleCompleted("checkout")) return;

    let driverObj: any = null;
    let destroyed = false;

    const timer = setTimeout(() => {
      // Verificamos si los elementos clave están en el DOM antes de disparar el tour
      const searchBox = document.querySelector("#checkout-search");
      if (!searchBox) return;

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
             markModuleCompleted("checkout");
             driverObj?.destroy();
          },
          steps: [
            {
              element: "#checkout-search",
              popover: {
                title: "Buscador y Lector 🔍",
                description: "Acá podés buscar productos por nombre, o usar tu lector de códigos de barras (funciona en cualquier momento).",
                side: "bottom",
                align: "start",
                nextBtnText: "Siguiente →",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#checkout-ticket",
              popover: {
                title: "Tu ticket de venta 🧾",
                description: "Acá se van a ir sumando los productos. Podés cambiar la cantidad tocando el número o deslizando.",
                side: "left",
                align: "start",
                nextBtnText: "Siguiente →",
                prevBtnText: "← Atrás",
                doneBtnText: "Listo",
              },
            },
            {
              element: "#checkout-pay",
              popover: {
                title: "Cobrar 💵",
                description: "Cuando termines, elegí el medio de pago. Tip: Si no hay ticket, esta área se mantiene oculta para ahorrar espacio.",
                side: "top",
                align: "center",
                nextBtnText: "Entendido",
                prevBtnText: "← Atrás",
                doneBtnText: "Listo",
                onNextClick: () => {
                   markModuleCompleted("checkout");
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
    }, 800);

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
