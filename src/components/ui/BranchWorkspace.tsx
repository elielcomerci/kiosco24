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
import { LEGACY_PRINT_EVENT, PRINT_EVENT } from "@/lib/brand";
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

type SpatialDirection = "up" | "down" | "left" | "right";

const KEYBOARD_NAV_SELECTOR = [
  '[data-keynav-item]:not([data-keynav-item="false"])',
  'button:not([disabled]):not([aria-disabled="true"])',
  'a[href]',
  '[role="button"]:not([aria-disabled="true"])',
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

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

function isElementDisabled(element: HTMLElement) {
  if (element.getAttribute("aria-disabled") === "true") {
    return true;
  }

  return "disabled" in element && Boolean((element as HTMLButtonElement).disabled);
}

function isElementVisible(element: HTMLElement) {
  if (element.hidden || element.closest("[hidden], [aria-hidden='true']")) {
    return false;
  }

  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden") {
    return false;
  }

  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

function getKeyboardNavScope(activeElement: HTMLElement | null) {
  const localScope = activeElement?.closest<HTMLElement>("[data-keynav-scope]");
  if (localScope) {
    return localScope;
  }

  const overlays = Array.from(document.querySelectorAll<HTMLElement>(".modal-overlay"));
  const topOverlay = overlays[overlays.length - 1];
  if (topOverlay) {
    return topOverlay.querySelector<HTMLElement>(".modal") ?? topOverlay;
  }

  return (
    document.querySelector<HTMLElement>("main.app-content[data-keynav-scope]") ??
    document.querySelector<HTMLElement>("main.app-content")
  );
}

function getKeyboardNavCandidates(scope: HTMLElement) {
  const seen = new Set<HTMLElement>();

  return Array.from(scope.querySelectorAll<HTMLElement>(KEYBOARD_NAV_SELECTOR)).filter((element) => {
    if (seen.has(element)) return false;
    seen.add(element);

    if (isElementDisabled(element)) return false;
    if (!isElementVisible(element)) return false;

    return true;
  });
}

function resolveCurrentKeyboardTarget(
  activeElement: HTMLElement | null,
  candidates: HTMLElement[],
) {
  if (!activeElement) {
    return null;
  }

  if (candidates.includes(activeElement)) {
    return activeElement;
  }

  const closest = activeElement.closest<HTMLElement>(KEYBOARD_NAV_SELECTOR);
  return closest && candidates.includes(closest) ? closest : null;
}

function getElementCenter(rect: DOMRect) {
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function isRectInDirection(origin: DOMRect, candidate: DOMRect, direction: SpatialDirection) {
  const originCenter = getElementCenter(origin);
  const candidateCenter = getElementCenter(candidate);
  const tolerance = 6;

  switch (direction) {
    case "up":
      return candidateCenter.y < originCenter.y - tolerance;
    case "down":
      return candidateCenter.y > originCenter.y + tolerance;
    case "left":
      return candidateCenter.x < originCenter.x - tolerance;
    case "right":
      return candidateCenter.x > originCenter.x + tolerance;
  }
}

function getDirectionalScore(origin: DOMRect, candidate: DOMRect, direction: SpatialDirection) {
  const originCenter = getElementCenter(origin);
  const candidateCenter = getElementCenter(candidate);

  const primaryDistance =
    direction === "up" || direction === "down"
      ? Math.abs(candidateCenter.y - originCenter.y)
      : Math.abs(candidateCenter.x - originCenter.x);
  const crossDistance =
    direction === "up" || direction === "down"
      ? Math.abs(candidateCenter.x - originCenter.x)
      : Math.abs(candidateCenter.y - originCenter.y);
  const overlapsCrossAxis =
    direction === "up" || direction === "down"
      ? candidate.left <= origin.right && candidate.right >= origin.left
      : candidate.top <= origin.bottom && candidate.bottom >= origin.top;

  return primaryDistance * 1000 + crossDistance - (overlapsCrossAxis ? 250 : 0);
}

function getKeyboardNavStartCandidate(candidates: HTMLElement[], direction: SpatialDirection) {
  return [...candidates].sort((left, right) => {
    const leftRect = left.getBoundingClientRect();
    const rightRect = right.getBoundingClientRect();

    if (direction === "up" || direction === "left") {
      if (Math.abs(rightRect.bottom - leftRect.bottom) > 6) {
        return rightRect.bottom - leftRect.bottom;
      }

      return rightRect.right - leftRect.right;
    }

    if (Math.abs(leftRect.top - rightRect.top) > 6) {
      return leftRect.top - rightRect.top;
    }

    return leftRect.left - rightRect.left;
  })[0] ?? null;
}

function findNextKeyboardTarget(
  scope: HTMLElement,
  direction: SpatialDirection,
  activeElement: HTMLElement | null,
) {
  const candidates = getKeyboardNavCandidates(scope);
  if (candidates.length === 0) {
    return null;
  }

  const currentTarget = resolveCurrentKeyboardTarget(activeElement, candidates);
  if (!currentTarget) {
    return getKeyboardNavStartCandidate(candidates, direction);
  }

  const originRect = currentTarget.getBoundingClientRect();
  let bestTarget: HTMLElement | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of candidates) {
    if (candidate === currentTarget) continue;

    const candidateRect = candidate.getBoundingClientRect();
    if (!isRectInDirection(originRect, candidateRect, direction)) {
      continue;
    }

    const score = getDirectionalScore(originRect, candidateRect, direction);
    if (score < bestScore) {
      bestScore = score;
      bestTarget = candidate;
    }
  }

  return bestTarget;
}

function focusKeyboardTarget(target: HTMLElement) {
  target.focus({ preventScroll: true });
  target.scrollIntoView({
    block: "nearest",
    inline: "nearest",
  });
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
    window.dispatchEvent(new CustomEvent(PRINT_EVENT));
    window.dispatchEvent(new CustomEvent(LEGACY_PRINT_EVENT));
    window.setTimeout(() => {
      window.print();
    }, 40);
  }, []);

  const focusFirstSearchField = useCallback(() => {
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const scope = getKeyboardNavScope(activeElement);
    if (!scope) {
      return;
    }

    const searchField = scope.querySelector<HTMLInputElement>(
      'input[type="search"], input[placeholder*="Buscar" i], input[aria-label*="Buscar" i]',
    );

    if (!searchField || searchField.disabled || !isElementVisible(searchField)) {
      return;
    }

    searchField.focus({ preventScroll: true });
    searchField.select();
    searchField.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
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
        key: "/",
        combo: "/",
        label: "Buscar en pantalla",
        description: "Lleva el foco al buscador principal visible de la pantalla.",
        group: "General",
        action: pathname.includes("/caja") ? undefined : focusFirstSearchField,
      },
      {
        key: "ArrowDown",
        combo: "↑ ↓ ← →",
        label: "Mover foco",
        description: "Recorre botones, tarjetas y acciones visibles de la pantalla.",
        group: "General",
      },
      {
        key: "Enter",
        combo: "Enter",
        label: "Activar foco",
        description: "Abre la accion o tarjeta que este enfocada.",
        group: "General",
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
  }, [branch.id, focusFirstSearchField, isEmployee, pathname, requestPrint, router]);

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

      if (matched?.action) {
        event.preventDefault();
        matched.action();
        return;
      }

      if (pathname.includes("/caja")) {
        return;
      }

      if (event.ctrlKey || event.metaKey || event.altKey || inInput) {
        return;
      }

      const directionByKey: Partial<Record<string, SpatialDirection>> = {
        ArrowUp: "up",
        ArrowDown: "down",
        ArrowLeft: "left",
        ArrowRight: "right",
      };

      const direction = directionByKey[event.key];
      if (!direction) {
        return;
      }

      const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const scope = getKeyboardNavScope(activeElement);
      if (!scope) {
        return;
      }

      const nextTarget = findNextKeyboardTarget(scope, direction, activeElement);
      if (!nextTarget) {
        return;
      }

      event.preventDefault();
      focusKeyboardTarget(nextTarget);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [globalShortcuts, pageShortcuts, pathname, showHelp]);

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
