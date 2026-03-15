import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import BranchSelector from "@/components/ui/BranchSelector";
import { hexToRgb } from "@/lib/utils";

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

  // Cargar datos de la sucursal actual
  const currentBranch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { 
      id: true, name: true, logoUrl: true, 
      primaryColor: true, bgColor: true,
      kioscoId: true 
    },
  });

  if (!currentBranch) {
    notFound();
  }

  // Cargar todas las sucursales del mismo Kiosco (para el selector)
  const branches = await prisma.branch.findMany({
    where: { kioscoId: currentBranch.kioscoId },
    select: { id: true, name: true, logoUrl: true, primaryColor: true, bgColor: true },
    orderBy: { createdAt: "asc" },
  });

  const primaryColor = currentBranch.primaryColor || "#22c55e";
  const bgColor = currentBranch.bgColor || "#0f172a";
  const primaryRgb = hexToRgb(primaryColor);

  return (
    <div 
      className="branch-context"
      style={{ 
        "--primary": primaryColor,
        "--primary-rgb": primaryRgb,
        "--primary-dim": `${primaryColor}CC`,
        "--bg": bgColor,
      } as React.CSSProperties}
    >
      <header className="no-print" style={{ 
        padding: "8px 16px", 
        background: "var(--surface)", 
        borderBottom: "1px solid var(--border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        minHeight: "56px"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          {currentBranch?.logoUrl && (
            <img 
              src={currentBranch.logoUrl} 
              alt="Logo" 
              style={{ width: "32px", height: "32px", borderRadius: "6px", objectFit: "cover" }} 
            />
          )}
          <BranchSelector branches={branches} currentBranchId={branchId} />
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
