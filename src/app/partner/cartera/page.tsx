import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";

export default async function PartnerCarteraPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const partner = await prisma.partnerProfile.findUnique({
    where: { userId: session.user.id },
    include: {
      referrals: {
        orderBy: { createdAt: "desc" }, // fallback base
        include: {
          referredKiosco: {
            select: {
              name: true,
              owner: {
                select: {
                  name: true,
                  email: true,
                },
              },
            },
          },
          recurring: true,
        },
      },
    },
  });

  if (!partner) redirect("/partner");

  // 💰 Total mensual real (solo activos)
  const total = partner.referrals.reduce((acc, r) => {
    if (r.recurring?.clientActive && r.recurring?.active) {
      return acc + r.recurring.recurringAmount;
    }
    return acc;
  }, 0);

  // 📊 Conteos útiles
  const stats = {
    active: 0,
    inactive: 0,
    pending: 0,
  };

  partner.referrals.forEach((r) => {
    if (!r.recurring) stats.pending++;
    else if (r.recurring.clientActive && r.recurring.active) stats.active++;
    else stats.inactive++;
  });

  // 🔥 Ordenar por valor (los mejores arriba)
  const referralsSorted = [...partner.referrals].sort((a, b) => {
    const aVal = a.recurring?.recurringAmount ?? 0;
    const bVal = b.recurring?.recurringAmount ?? 0;
    return bVal - aVal;
  });

  return (
    <div className="cartera">
      <header className="cartera__header">
        <h1 className="cartera__title">Tu cartera</h1>
        <p className="cartera__subtitle">
          Cada cliente activo genera ingresos todos los meses.
        </p>
      </header>

      {/* 💰 RESUMEN */}
      <div className="cartera__summary">
        <div className="cartera__summary-main">
          ${total.toLocaleString("es-AR")}
        </div>
        <div className="cartera__summary-label">
          ingreso mensual total
        </div>

        <div className="cartera__stats">
          <span>{stats.active} activos</span>
          <span>{stats.inactive} inactivos</span>
          <span>{stats.pending} pendientes</span>
        </div>
      </div>

      {/* 📋 TABLA */}
      <div className="admin-card overflow-hidden">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Comercio</th>
              <th>Contacto</th>
              <th>Estado</th>
              <th className="text-right">Genera</th>
            </tr>
          </thead>
          <tbody>
            {referralsSorted.length > 0 ? (
              referralsSorted.map((item) => {
                const isActive =
                  item.recurring?.clientActive && item.recurring?.active;

                return (
                  <tr key={item.id}>
                    <td>
                      <div className="font-bold">
                        {item.referredKiosco.name}
                      </div>
                      <div className="text-xs text-muted">
                        ID: {item.id.slice(-6)}
                      </div>
                    </td>

                    <td>
                      <div className="text-sm">
                        {item.referredKiosco.owner?.name ?? "—"}
                      </div>
                      <div className="text-xs text-muted">
                        {item.referredKiosco.owner?.email ?? ""}
                      </div>
                    </td>

                    <td>
                      <span
                        className={`badge ${
                          !item.recurring
                            ? "badge--pending"
                            : isActive
                            ? "badge--success"
                            : "badge--danger"
                        }`}
                      >
                        {!item.recurring
                          ? "Pendiente"
                          : isActive
                          ? "Activo"
                          : "Inactivo"}
                      </span>
                    </td>

                    <td className="text-right">
                      {item.recurring ? (
                        <div className="amount">
                          ${item.recurring.recurringAmount.toLocaleString("es-AR")}
                          <span className="amount__period">/mes</span>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4}>
                  <div className="empty-state">
                    Todavía no tenés clientes. Compartí tu link para empezar a generar ingresos.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <style>{`
        .cartera__header { margin-bottom: 24px; }
        .cartera__title { font-size: 22px; font-weight: 800; }
        .cartera__subtitle { font-size: 14px; color: var(--text-3); }

        .cartera__summary {
          margin-bottom: 24px;
          padding: 24px;
          border: 1px solid var(--border);
          border-radius: var(--radius-md);
          background: var(--surface);
        }

        .cartera__summary-main {
          font-size: 32px;
          font-weight: 800;
        }

        .cartera__summary-label {
          font-size: 12px;
          color: var(--text-3);
          margin-bottom: 10px;
        }

        .cartera__stats {
          display: flex;
          gap: 12px;
          font-size: 12px;
          color: var(--text-3);
        }

        .badge {
          font-size: 10px;
          padding: 4px 8px;
          border-radius: 4px;
          font-weight: 700;
          text-transform: uppercase;
        }

        .badge--success {
          background: #ecfdf5;
          color: #065f46;
          border: 1px solid #d1fae5;
        }

        .badge--danger {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fee2e2;
        }

        .badge--pending {
          background: #f1f5f9;
          color: #475569;
        }

        .amount {
          font-weight: 800;
          font-size: 15px;
        }

        .amount__period {
          font-size: 11px;
          color: var(--text-3);
          margin-left: 4px;
        }

        .text-muted {
          color: var(--text-3);
          font-size: 11px;
        }

        .admin-table tbody tr:hover {
          background: var(--surface-2);
        }

        .empty-state {
          padding: 24px;
          text-align: center;
          font-size: 14px;
          color: var(--text-3);
        }

        .text-right {
          text-align: right;
        }
      `}</style>
    </div>
  );
}