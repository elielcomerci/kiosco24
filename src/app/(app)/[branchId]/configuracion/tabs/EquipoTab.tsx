/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { SUBSCRIPTION_CANCEL_LABEL, SUBSCRIPTION_PRICE_LABEL, SUBSCRIPTION_PROMO_LABEL } from "@/lib/subscription-plan";
import type { Employee, Subscription } from "../types";

interface EquipoTabProps {
  branchId: string;
  isOwner: boolean;
  employees: Employee[];
  loadingEmployees: boolean;
  subscription: Subscription | null;
  loadingSubscription: boolean;
  creatingSubscription: boolean;
  subscriptionError: string | null;
  cancelingSubscription: boolean;
  cancelModalOpen: boolean;
  // Handlers
  handleCreateSubscription: () => Promise<void>;
  handleCancelSubscription: () => Promise<void>;
  setCancelModalOpen: (v: boolean) => void;
  setEmployeeModal: (v: "new" | Employee | null) => void;
}

export default function EquipoTab({
  branchId,
  isOwner,
  employees,
  loadingEmployees,
  subscription,
  loadingSubscription,
  creatingSubscription,
  subscriptionError,
  cancelingSubscription,
  cancelModalOpen,
  handleCreateSubscription,
  handleCancelSubscription,
  setCancelModalOpen,
  setEmployeeModal,
}: EquipoTabProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
      {/* Suscripción */}
      {isOwner && (
        <section
          style={{
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: "var(--radius)",
            padding: "20px",
          }}
        >
          <h3 style={{ fontSize: "16px", fontWeight: 700, marginBottom: "16px", color: "var(--text-2)" }}>
            💳 Suscripción
          </h3>

          {loadingSubscription ? (
            <div style={{ color: "var(--text-3)", fontSize: "14px" }}>Cargando...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
              {subscription?.status === "ACTIVE" ? (
                <>
                  <div style={{ padding: "12px", background: "rgba(34,197,94,0.08)", borderRadius: "12px", border: "1px solid rgba(34,197,94,0.2)" }}>
                    <div style={{ fontWeight: 700, color: "var(--green)", marginBottom: "4px" }}>✅ Suscripción activa</div>
                    <div style={{ fontSize: "13px", color: "var(--text-2)" }}>Tu suscripción está al día.</div>
                  </div>
                  {subscription.managementUrl && (
                    <a
                      href={subscription.managementUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn-sm btn-ghost"
                      style={{ width: "100%", textDecoration: "none", textAlign: "center" }}
                    >
                      💳 Gestionar en MercadoPago
                    </a>
                  )}
                  <button
                    onClick={handleCancelSubscription}
                    className="btn btn-sm btn-ghost"
                    style={{ width: "100%", justifyContent: "center", color: "var(--red)", border: "1px solid rgba(239, 68, 68, 0.4)" }}
                  >
                    Cancelar suscripción
                  </button>
                </>
              ) : (
                <>
                  <div style={{ fontSize: "14px", color: "var(--text-2)", lineHeight: 1.6 }}>
                    <p style={{ margin: "0 0 8px" }}>{SUBSCRIPTION_PROMO_LABEL}</p>
                    <p style={{ margin: 0, fontSize: "13px", color: "var(--text-3)" }}>{SUBSCRIPTION_PRICE_LABEL} {SUBSCRIPTION_CANCEL_LABEL}</p>
                  </div>
                  {subscription ? (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                      <button
                        onClick={handleCreateSubscription}
                        disabled={creatingSubscription}
                        className="btn btn-sm btn-green"
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        {creatingSubscription ? "Generando link..." : "Generar nuevo link de pago"}
                      </button>
                      {subscriptionError && (
                        <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "8px", textAlign: "center" }}>
                          {subscriptionError}
                        </p>
                      )}
                    </div>
                  ) : (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                      <button
                        onClick={handleCreateSubscription}
                        disabled={creatingSubscription}
                        className="btn btn-sm btn-green"
                        style={{ width: "100%", justifyContent: "center" }}
                      >
                        {creatingSubscription ? "Generando..." : "Suscribirse ahora"}
                      </button>
                      {subscriptionError && (
                        <p style={{ color: "var(--red)", fontSize: "13px", marginTop: "8px", textAlign: "center" }}>
                          {subscriptionError}
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Empleados */}
      <section
        style={{
          background: "var(--surface)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius)",
          padding: "20px",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h3 style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-2)" }}>
            👤 Empleados
          </h3>
          <button className="btn btn-sm btn-green" onClick={() => setEmployeeModal("new")}>
            + Nuevo
          </button>
        </div>

        {loadingEmployees ? (
          <div style={{ textAlign: "center", padding: "32px", color: "var(--text-3)" }}>Cargando...</div>
        ) : employees.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "32px",
              background: "var(--surface-2)",
              borderRadius: "var(--radius)",
              border: "1px dashed var(--border)",
              color: "var(--text-3)",
            }}
          >
            <div style={{ fontSize: "32px", marginBottom: "8px" }}>👤</div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Sin empleados</div>
            <div style={{ fontSize: "14px" }}>Agregá empleados para asignarles turnos</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
            {employees.map((emp) => (
              <button
                key={emp.id}
                style={{
                  padding: "14px 16px",
                  display: "flex",
                  alignItems: "center",
                  gap: "12px",
                  cursor: "pointer",
                  width: "100%",
                  textAlign: "left",
                  opacity: emp.active ? 1 : 0.5,
                  border: "none",
                  background: "var(--surface)",
                  borderRadius: "var(--radius)",
                }}
                onClick={() => setEmployeeModal(emp)}
              >
                <div
                  style={{
                    width: "40px",
                    height: "40px",
                    borderRadius: "50%",
                    background: "var(--text-3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                    color: "black",
                    flexShrink: 0,
                  }}
                >
                  {emp.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: "8px" }}>
                    {emp.name}
                    {!emp.active && (
                      <span style={{ background: "rgba(239, 68, 68, 0.15)", color: "var(--red)", fontSize: "10px", padding: "2px 6px", borderRadius: "4px", fontWeight: 700 }}>
                        SUSPENDIDO
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-3)", display: "flex", flexDirection: "column", gap: 2 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ color: "var(--primary)", fontWeight: 700, fontSize: "10px", background: "rgba(34,197,94,0.1)", padding: "1px 4px", borderRadius: "4px" }}>
                        {emp.role === "MANAGER" ? "ENCARGADO" : "CAJERO"}
                      </span>
                      {emp.hasPin ? "PIN configurado" : "Sin PIN"}
                    </div>
                    <div style={{ opacity: 0.8 }}>
                      📍 {emp.branches.map(b => b.name).join(", ")}
                    </div>
                  </div>
                </div>
                <span style={{ color: "var(--text-3)", fontSize: "18px" }}>›</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Modal de Cancelación */}
      {cancelModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
            zIndex: 9999,
          }}
          onClick={() => !cancelingSubscription && setCancelModalOpen(false)}
        >
          <div
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              borderRadius: "24px",
              padding: "24px",
              maxWidth: "420px",
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 style={{ fontSize: "20px", fontWeight: 800, margin: 0, color: "var(--text)" }}>
              ¿Cancelar suscripción?
            </h2>
            <p style={{ color: "var(--text-2)", lineHeight: 1.6, margin: 0, fontSize: "14px" }}>
              Perderás el acceso a las funciones principales del sistema cuando termine tu período de facturación actual. ¿Estás seguro que querés cancelarla?
            </p>
            <div style={{ display: "flex", gap: "10px", marginTop: "8px" }}>
              <button
                className="btn btn-ghost"
                style={{ flex: 1, border: "1px solid var(--border)", color: "var(--text)" }}
                onClick={() => setCancelModalOpen(false)}
                disabled={cancelingSubscription}
              >
                Volver
              </button>
              <button
                className="btn"
                style={{ flex: 1, backgroundColor: "var(--red)", color: "white", padding: "10px", border: "none" }}
                onClick={handleCancelSubscription}
                disabled={cancelingSubscription}
              >
                {cancelingSubscription ? "Cancelando..." : "Confirmar cancelación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
