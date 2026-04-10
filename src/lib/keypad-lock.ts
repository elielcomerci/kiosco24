import { useEffect } from "react";

/**
 * Señaliza que hay un teclado numérico en pantalla activo.
 * El handler global de caja verifica este flag para evitar capturar keys
 * y enviárselas al buscador de productos.
 */
export function useKeypadLock() {
  useEffect(() => {
    const prev = Number(document.body.dataset.keypadModals ?? "0");
    document.body.dataset.keypadModals = String(prev + 1);
    return () => {
      const current = Number(document.body.dataset.keypadModals ?? "0");
      const next = Math.max(0, current - 1);
      if (next === 0) {
        delete document.body.dataset.keypadModals;
      } else {
        document.body.dataset.keypadModals = String(next);
      }
    };
  }, []);
}

export function isKeypadModalOpen() {
  return Number(document.body.dataset.keypadModals ?? "0") > 0;
}
