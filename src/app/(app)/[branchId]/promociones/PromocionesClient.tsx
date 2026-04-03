"use client";

import { useState } from "react";
import useSWR from "swr";
import { formatARS } from "@/lib/utils";
import PromoModal from "./PromoModal";
import CouponGeneratorModal from "./CouponGeneratorModal";

type PromotionType = "COMBO" | "ZONA_ROJA" | "HAPPY_HOUR" | "DIA_TEMATICO";

export interface PromoCombo {
  productId: string;
  variantId: string | null;
  quantity: number;
  product: { id: string; name: string; emoji: string | null; image: string | null };
  variant: { id: string; name: string } | null;
}

export interface Promotion {
  id: string;
  type: PromotionType;
  name: string;
  active: boolean;
  discountKind: "PERCENTAGE" | "FIXED_PRICE";
  discountValue: number;
  startHour: number | null;
  endHour: number | null;
  weekdays: number[];
  daysBeforeExpiry: number | null;
  returnCouponThreshold: number | null;
  returnCouponValidityHours: number | null;
  combos: PromoCombo[];
}

export interface ProductCatalogItem {
  productId: string;
  product: {
    id: string;
    name: string;
    emoji: string | null;
    image: string | null;
    variants: Array<{ id: string; name: string }>;
  };
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export default function PromocionesClient({
  branchId,
  products,
}: {
  branchId: string;
  products: ProductCatalogItem[];
}) {
  const { data: promotions, error, mutate } = useSWR<Promotion[]>(`/api/promociones`, fetcher);
  
  const [modalOpen, setModalOpen] = useState(false);
  const [editPromo, setEditPromo] = useState<Promotion | null>(null);
  const [showCouponGenFor, setShowCouponGenFor] = useState<Promotion | null>(null);

  const getTypeLabel = (type: PromotionType) => {
    switch (type) {
      case "COMBO": return "Combo";
      case "ZONA_ROJA": return "Zona Roja";
      case "HAPPY_HOUR": return "Happy Hour";
      case "DIA_TEMATICO": return "Día Temático";
      default: return type;
    }
  };

  const getPromoValue = (promo: Promotion) => {
    if (promo.discountKind === "PERCENTAGE") {
      return `-${promo.discountValue}%`;
    }
    return formatARS(promo.discountValue);
  };

  const handleToggleActive = async (promo: Promotion) => {
    try {
      // Optimistic update
      mutate(promotions?.map(p => p.id === promo.id ? { ...p, active: !p.active } : p), false);
      
      const res = await fetch(`/api/promociones/${promo.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !promo.active }),
      });
      if (!res.ok) throw new Error();
      mutate(); // Re-validate
    } catch {
      mutate(); // Rollback on error
      alert("Error al actualizar estado");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar esta promoción?")) return;
    try {
      mutate(promotions?.filter(p => p.id !== id), false);
      const res = await fetch(`/api/promociones/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      mutate();
    } catch {
      mutate();
      alert("Error al eliminar");
    }
  };

  return (
    <div className="promociones-container">
      <div className="promo-header">
        <div className="promo-header-text">
          <h1>Motor de Promociones</h1>
          <p>Maneja estrategias de precios inteligentes y maximiza tus ventas</p>
        </div>
        <button className="promo-btn-primary" onClick={() => { setEditPromo(null); setModalOpen(true); }}>
          <span className="icon">{"\u2728"}</span> Crear Promoción
        </button>
      </div>

      {error ? (
        <div className="promo-error">Error cargando promociones</div>
      ) : !promotions ? (
        <div className="promo-loading">
          <div className="spinner"></div> Carregando motor...
        </div>
      ) : promotions.length === 0 ? (
        <div className="promo-empty_state">
          <div className="icon">{"\uD83C\uDFAF"}</div>
          <h2>Sin estrategias activas</h2>
          <p>Crea un Combo o activa la Zona Roja para empezar a impulsar ventas.</p>
        </div>
      ) : (
        <div className="promo-grid">
          {promotions.map((promo) => (
            <div key={promo.id} className={`promo-card ${promo.active ? "is-active" : "is-inactive"}`}>
              <div className="promo-card-header">
                <div className="promo-badge" data-type={promo.type}>
                  {getTypeLabel(promo.type)}
                </div>
                <div className="promo-toggle">
                  <label className="switch">
                    <input 
                      type="checkbox" 
                      checked={promo.active} 
                      onChange={() => handleToggleActive(promo)}
                    />
                    <span className="slider round"></span>
                  </label>
                </div>
              </div>
              
              <div className="promo-card-body">
                <h3 className="promo-title">{promo.name}</h3>
                <div className="promo-value">{getPromoValue(promo)}</div>
                
                {promo.type === "COMBO" && promo.combos.length > 0 && (
                  <div className="promo-combos">
                    {promo.combos.map((c, i: number) => (
                      <div key={i} className="promo-combo-item">
                        <span className="qty">{c.quantity}x</span>
                        <span className="name">
                          {c.product.emoji && <span className="mr-1">{c.product.emoji}</span>}
                          {c.product.name} {c.variant?.name && `(${c.variant.name})`}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {promo.type === "ZONA_ROJA" && (
                  <div className="promo-rules">
                    <div className="rule-badge">
                      {"\u23F1\uFE0F"} Faltan {promo.daysBeforeExpiry} días
                    </div>
                  </div>
                )}
                
                {promo.type === "HAPPY_HOUR" && (
                  <div className="promo-rules">
                    <div className="rule-badge">
                      {"\u231A\uFE0F"} {promo.startHour}:00 - {promo.endHour}:00
                    </div>
                  </div>
                )}
              </div>

              <div className="promo-card-actions">
                <button 
                  className="btn-icon" 
                  style={{ color: "var(--primary)" }}
                  onClick={() => setShowCouponGenFor(promo)}
                  title="Generar Cupones PDF (Estilo Mostaza)"
                >
                  {"\uD83C\uDFAB"}
                </button>
                <button 
                  className="btn-icon" 
                  onClick={() => { setEditPromo(promo); setModalOpen(true); }}
                  title="Editar"
                >
                  {"\u270F\uFE0F"}
                </button>
                <button 
                  className="btn-icon danger" 
                  onClick={() => handleDelete(promo.id)}
                  title="Eliminar"
                >
                  {"\uD83D\uDDD1\uFE0F"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <PromoModal 
          branchId={branchId}
          products={products}
          existingPromo={editPromo}
          onClose={() => setModalOpen(false)}
          onSaved={() => mutate()}
        />
      )}

      {showCouponGenFor && (
        <CouponGeneratorModal
          branchId={branchId}
          products={products}
          promotion={showCouponGenFor}
          onClose={() => setShowCouponGenFor(null)}
        />
      )}
    </div>
  );
}
