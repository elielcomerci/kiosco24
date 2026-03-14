import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notFound, redirect } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import BranchSelector from "@/components/ui/BranchSelector";

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

  // Cargar datos de la sucursal actual y todas las hermanas del Kiosco
  const currentBranchContext = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      kiosco: {
        select: {
          branches: {
            select: { id: true, name: true, logoUrl: true, primaryColor: true },
            orderBy: { createdAt: "asc" },
          }
        }
      }
    },
  });

  if (!currentBranchContext) {
    notFound();
  }

  const branches = currentBranchContext.kiosco.branches;
  const branch = branches.find((b) => b.id === branchId);
  const primaryColor = branch?.primaryColor || "#22c55e";
  const primaryRgb = hexToRgb(primaryColor);

  return (
    <div 
      className="branch-context"
      style={{ 
        "--primary": primaryColor,
        "--primary-rgb": primaryRgb,
        "--primary-dim": `${primaryColor}CC`
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
          {branch?.logoUrl && (
            <img 
              src={branch.logoUrl} 
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
