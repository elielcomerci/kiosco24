import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";

export default async function BranchLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ branchId: string }>;
}) {
  const session = await auth();
  if (!session?.user) {
    redirect("/login");
  }

  const { branchId } = await params;

  // Cargar datos de la sucursal para personalización
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      name: true,
      logoUrl: true,
      primaryColor: true,
    },
  });

  if (!branch) {
    notFound();
  }

  const primaryColor = branch.primaryColor || "#22c55e";

  return (
    <div 
      className="branch-context"
      style={{ 
        "--primary": primaryColor,
        "--primary-dim": `${primaryColor}CC` // 80% opacidad para el hover aproximado
      } as React.CSSProperties}
    >
      <header className="no-print" style={{ 
        padding: "12px 16px", 
        background: "var(--surface)", 
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {branch.logoUrl ? (
            <img 
              src={branch.logoUrl} 
              alt={branch.name} 
              style={{ height: "32px", width: "auto" }} 
            />
          ) : (
            <span style={{ fontSize: "20px" }}>🏪</span>
          )}
          <h1 style={{ fontSize: "16px", fontWeight: 700 }}>{branch.name}</h1>
        </div>
        <a href={`/${branchId}/configuracion`} style={{ fontSize: "20px", textDecoration: "none", color: "var(--text)" }} title="Configuración">
          ⚙️
        </a>
      </header>
      
      <main className="app-content">
        {children}
      </main>
      
      <BottomNav />
      
      <script dangerouslySetInnerHTML={{
        __html: `
          window.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
              // El CSS @media print ya maneja el resto
            }
          });
        `
      }} />
    </div>
  );
}
