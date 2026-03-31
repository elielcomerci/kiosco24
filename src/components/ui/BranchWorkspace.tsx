"use client";

import {
  useCallback,
  createContext,
  useContext,
  useEffect,
  useId,
  useMemo,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import ModalPortal from "@/components/ui/ModalPortal";
import { useIsDesktop } from "@/lib/hooks";

export interface BranchWorkspaceBranch {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  bgColor: string | null;
}

export interface ShortcutDefinition {
  key: string;
  combo: string;
  label: string;
  description: string;
  group: string;
  primary?: boolean;
  alt?: boolean;
  shift?: boolean;
  allowInInput?: boolean;
  action?: () => void;
}

interface BranchWorkspaceContextValue {
  branch: BranchWorkspaceBranch;
  isEmployee: boolean;
  openShortcutHelp: () => void;
  registerShortcuts: (id: string, shortcuts: ShortcutDefinition[]) => void;
  unregisterShortcuts: (id: string) => void;
  requestPrint: () => void;
}

const BranchWorkspaceContext = createContext<BranchWorkspaceContextValue | null>(null);

function isInputLikeElement(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    tagName === "SELECT" ||
    target.isContentEditable
  );
}

function normalizeKey(value: string) {
  return value.toLowerCase();
}

function matchesShortcut(event: KeyboardEvent, shortcut: ShortcutDefinition) {
  const eventKey = normalizeKey(event.key);
  const shortcutKey = normalizeKey(shortcut.key);

  return (
    eventKey === shortcutKey &&
    Boolean(event.altKey) === Boolean(shortcut.alt) &&
    Boolean(event.shiftKey) === Boolean(shortcut.shift) &&
    (shortcut.primary ? event.ctrlKey || event.metaKey : !event.ctrlKey && !event.metaKey)
  );
}

function ShortcutHelpModal({
  shortcuts,
  onClose,
}: {
  shortcuts: ShortcutDefinition[];
  onClose: () => void;
}) {
  const groups = shortcuts.reduce<Record<string, ShortcutDefinition[]>>((acc, shortcut) => {
    acc[shortcut.group] = acc[shortcut.group] || [];
    acc[shortcut.group].push(shortcut);
    return acc;
  }, {});

  return (
    <ModalPortal>
      <div className="modal-overlay animate-fade-in no-print" onClick={onClose} style={{ zIndex: 10001 }}>
        <div
          className="modal animate-slide-up"
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "720px", width: "min(92vw, 720px)", maxHeight: "85vh", overflowY: "auto" }}
        >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
          <div>
            <h2 style={{ fontSize: "22px", fontWeight: 800 }}>Atajos de teclado</h2>
            <p style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "4px" }}>
              Pensados para que la app vuele en PC sin volverla complicada.
            </p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
          {Object.entries(groups).map(([group, items]) => (
            <div key={group} style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div
                style={{
                  fontSize: "12px",
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  color: "var(--text-3)",
                }}
              >
                {group}
              </div>
              <div style={{ display: "grid", gap: "10px" }}>
                {items.map((shortcut) => (
                  <div
                    key={`${group}-${shortcut.combo}-${shortcut.label}`}
                    style={{
                      display: "grid",
                      gridTemplateColumns: "140px 1fr",
                      gap: "12px",
                      alignItems: "start",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      padding: "12px 14px",
                    }}
                  >
                    <div>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          minWidth: "84px",
                          padding: "6px 10px",
                          borderRadius: "10px",
                          background: "var(--surface)",
                          border: "1px solid var(--border-2)",
                          fontSize: "12px",
                          fontWeight: 800,
                          letterSpacing: "0.03em",
                        }}
                      >
                        {shortcut.combo}
                      </span>
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: "14px" }}>{shortcut.label}</div>
                      <div style={{ color: "var(--text-3)", fontSize: "13px", marginTop: "2px" }}>
                        {shortcut.description}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </div>
      </div>
    </ModalPortal>
  );
}

export function BranchWorkspaceProvider({
  branch,
  isEmployee,
  children,
}: {
  branch: BranchWorkspaceBranch;
  isEmployee: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const isDesktop = useIsDesktop();
  const [showHelp, setShowHelp] = useState(false);
  const [pageShortcutMap, setPageShortcutMap] = useState<Record<string, ShortcutDefinition[]>>({});

  const registerShortcuts = useCallback((id: string, shortcuts: ShortcutDefinition[]) => {
    setPageShortcutMap((prev) => ({ ...prev, [id]: shortcuts }));
  }, []);

  const unregisterShortcuts = useCallback((id: string) => {
    setPageShortcutMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const requestPrint = useCallback(() => {
    document.body.classList.add("print-rich");
    window.dispatchEvent(new CustomEvent("kiosco24:print"));
    window.setTimeout(() => {
      window.print();
    }, 40);
  }, []);

  useEffect(() => {
    const handleAfterPrint = () => {
      document.body.classList.remove("print-rich");
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, []);

  const globalShortcuts = useMemo<ShortcutDefinition[]>(() => {
    const shortcuts: ShortcutDefinition[] = [
      {
        key: "p",
        combo: "Ctrl+P",
        label: "Imprimir pantalla",
        description: "Genera la version A4 profesional de la pantalla actual.",
        group: "General",
        primary: true,
        action: requestPrint,
      },
      {
        key: "?",
        combo: "?",
        label: "Ver atajos",
        description: "Abre esta ayuda contextual para desktop.",
        group: "General",
        shift: true,
        action: () => setShowHelp(true),
      },
      {
        key: "1",
        combo: "Alt+1",
        label: "Ir a Caja",
        description: "Abre la caja de la sucursal actual.",
        group: "Navegacion",
        alt: true,
        action: () => router.push(`/${branch.id}/caja`),
      },
    ];

    if (!isEmployee) {
      shortcuts.push(
        {
          key: "2",
          combo: "Alt+2",
          label: "Ir a Productos",
          description: "Abre el catalogo e inventario de la sucursal.",
          group: "Navegacion",
          alt: true,
          action: () => router.push(`/${branch.id}/productos`),
        },
        {
          key: "3",
          combo: "Alt+3",
          label: "Ir a Fiados",
          description: "Abre la pantalla de clientes con saldo pendiente.",
          group: "Navegacion",
          alt: true,
          action: () => router.push(`/${branch.id}/fiados`),
        },
        {
          key: "4",
          combo: "Alt+4",
          label: "Ir a Resumen",
          description: "Abre el cierre diario y el resumen operativo.",
          group: "Navegacion",
          alt: true,
          action: () => router.push(`/${branch.id}/resumen`),
        },
        {
          key: "5",
          combo: "Alt+5",
          label: "Ir a Estadisticas",
          description: "Abre la vista de rendimiento y tendencias.",
          group: "Navegacion",
          alt: true,
          action: () => router.push(`/${branch.id}/estadisticas`),
        }
      );
    }

    return shortcuts;
  }, [branch.id, isEmployee, requestPrint, router]);

  const pageShortcuts = useMemo(
    () => Object.values(pageShortcutMap).flat(),
    [pageShortcutMap]
  );

  const allShortcuts = useMemo(
    () => [...globalShortcuts, ...pageShortcuts],
    [globalShortcuts, pageShortcuts]
  );

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (showHelp && event.key === "Escape") {
        event.preventDefault();
        setShowHelp(false);
        return;
      }

      const inInput = isInputLikeElement(event.target);
      const shortcuts = [...pageShortcuts, ...globalShortcuts];
      const matched = shortcuts.find((shortcut) => {
        if (inInput && !shortcut.allowInInput) return false;
        return matchesShortcut(event, shortcut);
      });

      if (!matched?.action) return;

      event.preventDefault();
      matched.action();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [globalShortcuts, pageShortcuts, showHelp]);

  const contextValue = useMemo<BranchWorkspaceContextValue>(
    () => ({
      branch,
      isEmployee,
      openShortcutHelp: () => setShowHelp(true),
      registerShortcuts,
      unregisterShortcuts,
      requestPrint,
    }),
    [branch, isEmployee, registerShortcuts, unregisterShortcuts, requestPrint]
  );

  const showDesktopHelpButton =
    isDesktop &&
    !pathname.includes("/configuracion") &&
    !pathname.includes("/login");

  return (
    <BranchWorkspaceContext.Provider value={contextValue}>
      {children}

      {showDesktopHelpButton && (
        <button
          className="btn btn-ghost btn-sm no-print"
          onClick={() => setShowHelp(true)}
          style={{
            position: "fixed",
            right: "18px",
            bottom: "86px",
            zIndex: 90,
            boxShadow: "var(--shadow-sm)",
            border: "1px solid var(--border-2)",
          }}
          title="Ver atajos"
        >
          ⌨︎ Atajos
        </button>
      )}

      {showHelp && <ShortcutHelpModal shortcuts={allShortcuts} onClose={() => setShowHelp(false)} />}
    </BranchWorkspaceContext.Provider>
  );
}

export function useBranchWorkspace() {
  const context = useContext(BranchWorkspaceContext);
  if (!context) {
    throw new Error("useBranchWorkspace must be used within BranchWorkspaceProvider");
  }
  return context;
}

export function useRegisterShortcuts(shortcuts: ShortcutDefinition[]) {
  const id = useId();
  const { registerShortcuts, unregisterShortcuts } = useBranchWorkspace();

  useEffect(() => {
    registerShortcuts(id, shortcuts);
    return () => unregisterShortcuts(id);
  }, [id, registerShortcuts, shortcuts, unregisterShortcuts]);
}
