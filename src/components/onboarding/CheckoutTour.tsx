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
             markModuleCompleted("checkout");
             driverObj?.destroy();
          },
          steps: [
            {
              element: "#checkout-search",
              popover: {
                title: "Buscador y Lector 🔍",
                description: "Acá podés buscar productos por nombre, o usar tu lector de códigos de barras (funciona en cualquier momento, sin cliquear acá).",
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
                description: "Cuando termines, elegí el medio de pago (Efectivo, Mercado Pago, etc) y la venta se guardará automáticamente.",
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
