"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { EmployeeRole, UserRole } from "@prisma/client";

import BranchSelector from "@/components/ui/BranchSelector";
import DeviceTextScaleControl from "@/components/ui/DeviceTextScaleControl";
import SoundToggle from "@/components/ui/SoundToggle";
import UserSwitchModal from "@/components/ui/UserSwitchModal";
import BrandLogo from "@/components/branding/BrandLogo";
import type { DeviceTextScale } from "@/lib/device-text-scale";

type BranchOption = {
  id: string;
  name: string;
  logoUrl: string | null;
  primaryColor: string | null;
  bgColor: string | null;
};

type AppTopBarProps = {
  branches: BranchOption[];
  currentBranchId: string;
  kioscoName: string;
  user: {
    name?: string | null;
    email?: string | null;
    image?: string | null;
    role?: UserRole;
    employeeRole?: EmployeeRole;
    employeeId?: string | null;
  };
  initialTextScale: DeviceTextScale;
};

function getDisplayName(user: AppTopBarProps["user"]) {
  const trimmedName = user.name?.trim();
  if (trimmedName) return trimmedName;
  const localPart = user.email?.split("@")[0]?.trim();
  if (localPart) return localPart;
  return user.role === "EMPLOYEE" ? "Empleado" : "Cuenta principal";
}

function getRoleLabel(user: AppTopBarProps["user"]) {
  if (user.role === "EMPLOYEE") {
    return user.employeeRole === "MANAGER" ? "Encargado" : "Cajero";
  }
  return "Propietario";
}

function getInitials(value: string) {
  const parts = value.split(/\s+/).map((p) => p.trim()).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "CL";
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("");
}

export default function AppTopBar({
  branches,
  currentBranchId,
  kioscoName,
  user,
  initialTextScale,
}: AppTopBarProps) {
  const pathname = usePathname();
  const [menuState, setMenuState] = useState({ isOpen: false, pathname });
  const [showSwitch, setShowSwitch] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const displayName = getDisplayName(user);
  const roleLabel = getRoleLabel(user);
  const initials = getInitials(displayName);
  const canManage = user.role === "OWNER" || user.employeeRole === "MANAGER";
  const currentBranchName = branches.find((b) => b.id === currentBranchId)?.name ?? "Sucursal";
  const open = menuState.isOpen && menuState.pathname === pathname;

  const closeMenu = () => {
    setMenuState((current) => {
      if (!current.isOpen && current.pathname === pathname) return current;
      return { isOpen: false, pathname };
    });
  };

  const toggleMenu = () => {
    setMenuState((current) => {
      const isOpenOnCurrentPath = current.isOpen && current.pathname === pathname;
      return { isOpen: !isOpenOnCurrentPath, pathname };
    });
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuState({ isOpen: false, pathname });
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuState({ isOpen: false, pathname });
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open, pathname]);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    try {
      await signOut({ redirect: false });
      window.location.assign("/login");
    } catch (err) {
      console.error("[TopBar] Sign-out failed:", err);
      setIsSigningOut(false);
    }
  };

  return (
    <header className="app-header no-print">
      <div className="app-header-branch">
        <BranchSelector branches={branches} currentBranchId={currentBranchId} />
      </div>

      <div className="app-header-brand" aria-hidden="true">
        <BrandLogo tone="white" width={72} />
      </div>

      <div className="app-header-actions">
        <div className="app-header-menu-shell" ref={menuRef} data-keynav-scope="account-menu">

          {/* ── Trigger ── */}
          <button
            type="button"
            className={`app-header-user-trigger ${open ? "active" : ""}`}
            onClick={toggleMenu}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label="Abrir menú de cuenta"
          >
            <span className="app-header-user-avatar" aria-hidden="true">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.image} alt="" />
              ) : (
                initials
              )}
            </span>
            <span className="app-header-user-copy">
              <span className="app-header-user-name">{displayName}</span>
              <span className="app-header-user-meta">{roleLabel} · {kioscoName}</span>
            </span>
            <span className="app-header-user-caret" aria-hidden="true">
              {open ? "▲" : "▼"}
            </span>
          </button>

          {/* ── Panel ── */}
          {open ? (
            <div className="app-header-menu-panel app-header-account-panel" role="menu">

              {/* Identidad */}
              <div className="app-header-account-summary">
                <span className="app-header-account-avatar" aria-hidden="true">
                  {user.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={user.image} alt="" />
                  ) : (
                    initials
                  )}
                </span>
                <div className="app-header-account-copy">
                  <div className="app-header-account-name">{displayName}</div>
                  <div className="app-header-account-role">{roleLabel}</div>
                  <div className="app-header-account-context">
                    {kioscoName} · {currentBranchName}
                  </div>
                  {user.email ? (
                    <div className="app-header-account-email">{user.email}</div>
                  ) : null}
                </div>
              </div>

              {/* Dispositivo */}
              <div className="app-header-menu-section">
                <div className="app-header-menu-kicker">Dispositivo</div>
                <div className="app-header-preferences-row">
                  <div className="app-header-preference-card">
                    <div className="app-header-preference-copy">
                      <div className="app-header-preference-label">Sonido</div>
                      <div className="app-header-preference-description">Feedback de audio</div>
                    </div>
                    <SoundToggle />
                  </div>
                  <div className="app-header-preference-card">
                    <div className="app-header-preference-copy">
                      <div className="app-header-preference-label">Texto</div>
                      <div className="app-header-preference-description">Escala visual</div>
                    </div>
                    <DeviceTextScaleControl initialScale={initialTextScale} />
                  </div>
                </div>
              </div>

              {/* Configuración + Salida */}
              <div className="app-header-menu-section">
                {canManage ? (
                  <>
                    <Link
                      href={`/${currentBranchId}/promociones`}
                      className="app-header-secondary-link"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <span aria-hidden="true">🏷️</span>
                      <span>Promociones</span>
                    </Link>
                    <Link
                      href={`/${currentBranchId}/configuracion`}
                      className="app-header-secondary-link"
                      role="menuitem"
                      onClick={closeMenu}
                    >
                      <span aria-hidden="true">⚙️</span>
                      <span>Configuración del local</span>
                    </Link>
                  </>
                ) : null}
                <button
                  type="button"
                  className="app-header-secondary-link"
                  onClick={() => {
                    closeMenu();
                    setShowSwitch(true);
                  }}
                >
                  <span aria-hidden="true">🔄</span>
                  <span>Cambiar usuario</span>
                </button>
                <button
                  type="button"
                  className="app-header-signout-button"
                  onClick={handleSignOut}
                  disabled={isSigningOut}
                >
                  <span aria-hidden="true">↩</span>
                  <span>{isSigningOut ? "Saliendo..." : "Cerrar sesión"}</span>
                </button>
              </div>

            </div>
          ) : null}
        </div>
      </div>
      {showSwitch ? (
        <UserSwitchModal
          branchId={currentBranchId}
          currentEmployeeId={user.employeeId ?? undefined}
          onCancel={() => setShowSwitch(false)}
        />
      ) : null}
    </header>
  );
}
