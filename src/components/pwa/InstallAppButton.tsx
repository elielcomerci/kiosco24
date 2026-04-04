"use client";

import { useEffect, useMemo, useState } from "react";

import ModalPortal from "@/components/ui/ModalPortal";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type InstallAppButtonProps = {
  compact?: boolean;
};

function detectPlatform() {
  if (typeof navigator === "undefined") {
    return {
      isIOS: false,
      isFirefox: false,
      isChromium: false,
    };
  }

  const userAgent = navigator.userAgent.toLowerCase();
  const isIOS = /iphone|ipad|ipod/.test(userAgent);
  const isFirefox = userAgent.includes("firefox");
  const isChromium =
    /chrome|chromium|crios|edg|edgios|edga/.test(userAgent) && !userAgent.includes("firefox");

  return { isIOS, isFirefox, isChromium };
}

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mediaStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches ?? false;
  const navigatorStandalone =
    typeof navigator !== "undefined" &&
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);

  return mediaStandalone || navigatorStandalone;
}

export default function InstallAppButton({ compact = false }: InstallAppButtonProps) {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const platform = useMemo(() => detectPlatform(), []);

  useEffect(() => {
    const syncInstalledState = () => {
      setIsInstalled(isStandaloneDisplay());
    };

    syncInstalledState();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };

    const handleInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
    window.addEventListener("appinstalled", handleInstalled);
    window.matchMedia?.("(display-mode: standalone)")?.addEventListener?.("change", syncInstalledState);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt as EventListener);
      window.removeEventListener("appinstalled", handleInstalled);
      window.matchMedia?.("(display-mode: standalone)")?.removeEventListener?.("change", syncInstalledState);
    };
  }, []);

  if (isInstalled) {
    return null;
  }

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      const installPrompt = deferredPrompt;
      setDeferredPrompt(null);

      try {
        await installPrompt.prompt();
        const choice = await installPrompt.userChoice;
        if (choice.outcome !== "accepted") {
          setShowHelp(true);
        }
      } catch {
        setShowHelp(true);
      }
      return;
    }

    setShowHelp(true);
  };

  const buttonLabel = deferredPrompt ? "Instalar app" : platform.isIOS ? "Agregar app" : "Instalar";
  const description = platform.isIOS
    ? "En iPhone se agrega desde Compartir."
    : platform.isFirefox
      ? "Firefox no ofrece instalacion completa."
      : "Abrila como app en este dispositivo.";

  return (
    <>
      <button
        type="button"
        className={compact ? "btn btn-sm btn-ghost" : "btn btn-secondary"}
        onClick={handleInstallClick}
        title="Instalar app"
        style={
          compact
            ? { border: "1px solid var(--border)", padding: "6px 10px", whiteSpace: "nowrap" }
            : { borderRadius: "999px", padding: "10px 18px", whiteSpace: "nowrap" }
        }
      >
        {buttonLabel}
      </button>

      {showHelp && (
        <ModalPortal>
          <div className="modal-overlay animate-fade-in" onClick={() => setShowHelp(false)}>
            <div
              className="modal animate-slide-up"
              onClick={(event) => event.stopPropagation()}
              style={{ maxWidth: "460px" }}
            >
              <div style={{ display: "grid", gap: "14px" }}>
                <div style={{ display: "grid", gap: "6px" }}>
                  <div
                    style={{
                      fontSize: "12px",
                      fontWeight: 800,
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      color: "var(--primary)",
                    }}
                  >
                    Instalar app
                  </div>
                  <h2 style={{ margin: 0, fontSize: "24px", fontWeight: 800 }}>Llevala al inicio</h2>
                  <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.5 }}>{description}</p>
                </div>

                {platform.isIOS ? (
                  <div style={{ display: "grid", gap: "10px", color: "var(--text-2)", lineHeight: 1.5 }}>
                    <div>1. Abre Clikit en Safari.</div>
                    <div>2. Toca Compartir.</div>
                    <div>3. Elige Agregar a pantalla de inicio.</div>
                  </div>
                ) : platform.isFirefox ? (
                  <div style={{ display: "grid", gap: "10px", color: "var(--text-2)", lineHeight: 1.5 }}>
                    <div>Firefox no ofrece una instalacion PWA completa como Chrome o Edge.</div>
                    <div>Para instalarla como app, abre Clikit en Chrome o Edge.</div>
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "10px", color: "var(--text-2)", lineHeight: 1.5 }}>
                    <div>1. Abre Clikit en Chrome o Edge.</div>
                    <div>2. Si el navegador no muestra el popup, usa el menu.</div>
                    <div>3. Busca Instalar app, Instalar Clikit o Crear acceso directo.</div>
                  </div>
                )}

                <button type="button" className="btn btn-primary" onClick={() => setShowHelp(false)}>
                  Entendido
                </button>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}
