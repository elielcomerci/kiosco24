"use client";

import { useEffect } from "react";

const TOUR_STORAGE_KEY = "clikit:onboarding-tour-completed";
const TOUR_VERSION = "v1";

function isTourCompleted() {
  try {
    return localStorage.getItem(TOUR_STORAGE_KEY) === TOUR_VERSION;
  } catch {
    return true; // Si no hay acceso a localStorage, no mostrar
  }
}

function markTourCompleted() {
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, TOUR_VERSION);
  } catch {
    // silently fail
  }
}

export default function BranchOnboardingTour() {
  useEffect(() => {
    if (isTourCompleted()) return;

    let destroyed = false;

    // Importamos driver.js dinámicamente para no penalizar el bundle
    import("driver.js").then(({ driver }) => {
      import("driver.js/dist/driver.css" as unknown as string).catch(() => {
        // El CSS global ya puede estar cargado, ignoramos si falla
      });

      if (destroyed) return;

      const driverObj = driver({
        showProgress: false,
        animate: true,
        smoothScroll: true,
        allowClose: false,
        overlayColor: "rgba(6, 8, 13, 0.82)",
        popoverClass: "clikit-tour-popover",
        onDestroyStarted: () => {
          markTourCompleted();
          driverObj.destroy();
        },
        steps: [
          {
            element: "#tour-new-product",
            popover: {
              title: "Agregá tu primer producto 📦",
              description:
                "Tocá acá para cargar un producto nuevo. Podés escanearlo con el código de barras y te autocompletamos los datos desde nuestra base colaborativa.",
              side: "bottom",
              align: "start",
              nextBtnText: "Entendido →",
              doneBtnText: "Listo",
            },
          },
          {
            element: "#tour-first-product",
            popover: {
              title: "Tu primer producto 🎯",
              description:
                "Ya te dejamos uno para que veas cómo se ve la grilla. Tocalo para editarle el precio, el stock y el código de barras.",
              side: "top",
              align: "start",
              nextBtnText: "Siguiente →",
              prevBtnText: "← Atrás",
              doneBtnText: "Listo",
            },
          },
          {
            element: "#tour-caja-tab",
            popover: {
              title: "Cuando estés listo, andá a la Caja 🏪",
              description:
                "Desde acá pasás ventas, cobrás y manejás tu turno. Vas a poder vender en segundos con el teclado numérico o escaneando.",
              side: "top",
              align: "center",
              prevBtnText: "← Atrás",
              nextBtnText: "Omitir tour",
              doneBtnText: "Empezar →",
            },
          },
        ],
      });

      // Esperamos un frame más para asegurarnos de que el DOM esté listo
      window.requestAnimationFrame(() => {
        if (!destroyed) {
          driverObj.drive();
        }
      });
    });

    return () => {
      destroyed = true;
    };
  }, []);

  return null;
}
