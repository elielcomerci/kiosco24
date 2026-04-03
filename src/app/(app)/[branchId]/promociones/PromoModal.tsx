"use client";

import { useState } from "react";
import type { Promotion, ProductCatalogItem } from "./PromocionesClient";

export default function PromoModal({
  branchId,
  products,
  existingPromo,
  onClose,
  onSaved
}: {
  branchId: string;
  products: ProductCatalogItem[];
  existingPromo: Promotion | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [type, setType] = useState<Promotion["type"]>(existingPromo?.type ?? "COMBO");
  const [name, setName] = useState(existingPromo?.name ?? "");
  const [discountKind, setDiscountKind] = useState<"PERCENTAGE" | "FIXED_PRICE">(existingPromo?.discountKind ?? "FIXED_PRICE");
  const [discountValue, setDiscountValue] = useState(existingPromo?.discountValue?.toString() ?? "");
  
  // Specific states
  const [daysBeforeExpiry, setDaysBeforeExpiry] = useState(existingPromo?.daysBeforeExpiry?.toString() ?? "7");
  const [startHour, setStartHour] = useState(existingPromo?.startHour?.toString() ?? "18");
  const [endHour, setEndHour] = useState(existingPromo?.endHour?.toString() ?? "21");
  const [combos, setCombos] = useState<Array<{productId: string, variantId: string | null, quantity: number}>>(
    existingPromo?.combos?.map(c => ({
      productId: c.productId,
      variantId: c.variantId ?? null,
      quantity: c.quantity
    })) ?? []
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isEdit = !!existingPromo;

  const handleAddComboItem = () => {
    if (products.length === 0) return;
    const firstProd = products[0].product;
    const firstVariant = firstProd.variants.length > 0 ? firstProd.variants[0].id : null;
    setCombos([...combos, { productId: firstProd.id, variantId: firstVariant, quantity: 1 }]);
  };

  const handleUpdateCombo = (index: number, field: string, value: string | number | null) => {
    const newCombos = [...combos];
    newCombos[index][field as keyof typeof newCombos[0]] = value as never;
    
    // If product changed, update variantId
    if (field === "productId") {
      const prodData = products.find(p => p.productId === value);
      const vId = prodData && prodData.product.variants.length > 0 ? prodData.product.variants[0].id : null;
      newCombos[index].variantId = vId;
    }
    
    setCombos(newCombos);
  };

  const handleRemoveComboItem = (index: number) => {
    setCombos(combos.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        type,
        name,
        discountKind,
        discountValue: Number(discountValue)
      };

      if (type === "COMBO") {
        if (combos.length < 2) throw new Error("Un combo requiere al menos 2 items.");
        payload.combos = combos;
      } else if (type === "ZONA_ROJA") {
        payload.daysBeforeExpiry = Number(daysBeforeExpiry);
      } else if (type === "HAPPY_HOUR") {
        payload.startHour = Number(startHour);
        payload.endHour = Number(endHour);
        payload.weekdays = []; // All days for now
      }

      const url = isEdit ? `/api/promociones/${existingPromo.id}` : `/api/promociones`;
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || "Error al guardar");
      }

      onSaved();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  // Only allow changing Type if creating
  const renderTypeSelector = () => {
    if (isEdit) {
      return (
        <div className="promo-form-group">
          <label>Tipo de estrategia</label>
          <input type="text" className="promo-input" value={type} disabled />
        </div>
      );
    }
    return (
      <div className="promo-form-group">
        <label>Estrategia</label>
        <div className="promo-type-chips">
          {(["COMBO", "ZONA_ROJA", "HAPPY_HOUR"] as const).map(t => (
            <button
              key={t}
              type="button"
              className={`promo-chip ${type === t ? "active" : ""}`}
              onClick={() => {
                setType(t);
                if (t === "COMBO") setDiscountKind("FIXED_PRICE");
                if (t === "ZONA_ROJA" || t === "HAPPY_HOUR") setDiscountKind("PERCENTAGE");
              }}
            >
              {t === "COMBO" && "🛍️ Combo"}
              {t === "ZONA_ROJA" && "🚨 Zona Roja"}
              {t === "HAPPY_HOUR" && "⏱️ Happy Hour"}
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="promo-modal-backdrop">
      <div className="promo-modal">
        <div className="promo-modal-header">
          <h2>{isEdit ? "Editar Promoción" : "Nueva Promoción"}</h2>
          <button type="button" className="promo-close-btn" onClick={onClose}>×</button>
        </div>
        
        <form onSubmit={handleSubmit} className="promo-modal-body">
          {error && <div className="promo-alert error">{error}</div>}
          
          {renderTypeSelector()}

          <div className="promo-form-group">
            <label>Nombre de la Promoción</label>
            <input 
              type="text" 
              className="promo-input" 
              placeholder="Ej. Promo Lunes, Combo Gaseosa + Papas..." 
              value={name} 
              onChange={e => setName(e.target.value)} 
              required 
            />
          </div>

          <div className="promo-row">
            <div className="promo-form-group">
              <label>Tipo de descuento</label>
              <select 
                className="promo-input" 
                value={discountKind} 
                onChange={e => setDiscountKind(e.target.value as "PERCENTAGE" | "FIXED_PRICE")}
              >
                <option value="FIXED_PRICE">Precio Fijo Total ($)</option>
                <option value="PERCENTAGE">Porcentaje de Descuento (%)</option>
              </select>
            </div>
            <div className="promo-form-group">
              <label>Valor</label>
              <input 
                type="number" 
                className="promo-input" 
                min="1" 
                step="0.01" 
                placeholder={discountKind === "PERCENTAGE" ? "Ej: 15" : "Ej: 1500"} 
                value={discountValue} 
                onChange={e => setDiscountValue(e.target.value)} 
                required 
              />
            </div>
          </div>

          <hr className="promo-divider" />

          {type === "ZONA_ROJA" && (
            <div className="promo-form-group">
              <label>Activar descuento si faltan esta cantidad de días (o menos) para vencer:</label>
              <input 
                type="number" 
                className="promo-input" 
                min="0" 
                value={daysBeforeExpiry} 
                onChange={e => setDaysBeforeExpiry(e.target.value)} 
              />
            </div>
          )}

          {type === "HAPPY_HOUR" && (
            <div className="promo-row">
              <div className="promo-form-group">
                <label>Hora Inicio (0-23)</label>
                <input 
                  type="number" 
                  className="promo-input" 
                  min="0" max="23"
                  value={startHour} 
                  onChange={e => setStartHour(e.target.value)} 
                />
              </div>
              <div className="promo-form-group">
                <label>Hora Fin (0-23)</label>
                <input 
                  type="number" 
                  className="promo-input" 
                  min="0" max="23"
                  value={endHour} 
                  onChange={e => setEndHour(e.target.value)} 
                />
              </div>
            </div>
          )}

          {type === "COMBO" && (
            <div className="promo-combos-builder">
              <div className="promo-combos-header">
                <label>Productos del Combo</label>
                {!isEdit && (
                  <button type="button" className="promo-btn-sm" onClick={handleAddComboItem}>+ Agregar Producto</button>
                )}
              </div>
              
              <div className="promo-combo-list">
                {combos.length === 0 && <p className="promo-empty-text">Agrega productos para armar el combo.</p>}
                
                {combos.map((item, idx) => {
                  const selectedProd = products.find(p => p.productId === item.productId);
                  return (
                    <div key={idx} className="promo-combo-row">
                      <input 
                        type="number" 
                        min="1" 
                        className="promo-input qty-input" 
                        value={item.quantity} 
                        onChange={e => handleUpdateCombo(idx, "quantity", parseInt(e.target.value) || 1)}
                        disabled={isEdit}
                      />
                      
                      <select 
                        className="promo-input flex-1"
                        value={item.productId}
                        onChange={e => handleUpdateCombo(idx, "productId", e.target.value)}
                        disabled={isEdit}
                      >
                        {products.map(p => (
                          <option key={p.productId} value={p.productId}>
                            {p.product.emoji && `${p.product.emoji} `}{p.product.name}
                          </option>
                        ))}
                      </select>

                      {selectedProd && selectedProd.product.variants.length > 0 && (
                        <select
                          className="promo-input flex-1"
                          value={item.variantId || ""}
                          onChange={e => handleUpdateCombo(idx, "variantId", e.target.value || null)}
                          disabled={isEdit}
                        >
                          <option value="">Cualquier variante</option>
                          {selectedProd.product.variants.map(v => (
                            <option key={v.id} value={v.id}>{v.name}</option>
                          ))}
                        </select>
                      )}

                      {!isEdit && (
                        <button type="button" className="promo-btn-icon danger" onClick={() => handleRemoveComboItem(idx)}>×</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="promo-modal-footer">
            <button type="button" className="promo-btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
            <button type="submit" className="promo-btn-primary" disabled={saving}>
              {saving ? "Guardando..." : "Guardar Promoción"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
