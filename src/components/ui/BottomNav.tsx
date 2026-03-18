"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useParams, usePathname } from "next/navigation";

const getNavItems = (branchId: string) => [
  { href: `/${branchId}/caja`,          label: "Caja",        icon: "🏪" },
  { href: `/${branchId}/productos`,     label: "Productos",   icon: "📦" },
  { href: `/${branchId}/fiados`,        label: "Fiados",      icon: "📋" },
  { href: `/${branchId}/resumen`,       label: "Resumen",     icon: "🧾" },
  { href: `/${branchId}/estadisticas`,  label: "Stats",       icon: "📊" },
];

export default function BottomNav() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const params = useParams();
  const branchId = params.branchId as string;

  if (!branchId) return null; // No mostrar si no estamos en contexto de sucursal
  if (session?.user?.role === "EMPLOYEE") return null;

  const navItems = getNavItems(branchId);

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
