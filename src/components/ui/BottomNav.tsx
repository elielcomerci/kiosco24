"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useParams, usePathname } from "next/navigation";

const getNavItems = (branchId: string, userRole?: string | null, employeeRole?: string | null) => {
  const isCashier = userRole === "EMPLOYEE" && employeeRole === "CASHIER";
  
  // CASHIER solo ve Caja y Fiados (Productos se implementará después)
  if (isCashier) {
    return [
      { href: `/${branchId}/caja`,        label: "Caja",      icon: "🏪" },
      { href: `/${branchId}/fiados`,      label: "Fiados",    icon: "📋" },
    ];
  }
  
  // OWNER y MANAGER ven todo
  return [
    { href: `/${branchId}/caja`,          label: "Caja",        icon: "🏪" },
    { href: `/${branchId}/productos`,     label: "Productos",   icon: "📦" },
    { href: `/${branchId}/fiados`,        label: "Fiados",      icon: "📋" },
    { href: `/${branchId}/resumen`,       label: "Resumen",     icon: "🧾" },
    { href: `/${branchId}/estadisticas`,  label: "Stats",       icon: "📊" },
  ];
};

export default function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const params = useParams();
  const branchId = params.branchId as string;

  if (!branchId) return null; // No mostrar si no estamos en contexto de sucursal

  const userRole = session?.user?.role;
  const employeeRole = session?.user?.employeeRole;
  const navItems = getNavItems(branchId, userRole, employeeRole);

  return (
    <nav className="bottom-nav">
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`bottom-nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
        >
          <span style={{ fontSize: "22px" }}>{item.icon}</span>
          <span className="bottom-nav-label">{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
