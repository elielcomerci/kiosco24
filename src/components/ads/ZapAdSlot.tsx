'use client'

import React, { useEffect, useState } from 'react'

interface AdAction {
  type: 'open_url' | 'one_click_order' | 'informational'
  url?: string
  productId?: string
  productName?: string
  productSlug?: string
}

interface AdContent {
  title: string
  description?: string
  ctaText?: string
  imageUrl?: string
  backgroundColor?: string
  textColor?: string
}

interface AdPromo {
  type: string
  discountKind: 'PERCENTAGE' | 'FIXED_PRICE'
  discountValue: number
}

interface ZapAd {
  id: string
  zone: string
  format: 'text_only' | 'banner_small' | 'banner_large'
  content: AdContent
  action?: AdAction
  promo?: AdPromo
}

interface ZapAdSlotProps {
  zone: string
  branchId: string
}

export default function ZapAdSlot({ zone, branchId }: ZapAdSlotProps) {
  const [ad, setAd] = useState<ZapAd | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const fetchAd = async () => {
      try {
        const res = await fetch(`/api/partner/ads?zone=${encodeURIComponent(zone)}&branchId=${encodeURIComponent(branchId)}`)
        if (!res.ok) throw new Error('Error fetch ads')

        const responseJson = await res.json()
        if (active && responseJson.data) {
          setAd(responseJson.data)
        }
      } catch (err) {
        // Fallo totalmente silencioso para no ensuciar la UI
        console.warn(`[ZapAdSlot] Silent error fetching ad for zone ${zone}:`, err)
      } finally {
        if (active) setLoading(false)
      }
    }

    fetchAd()

    return () => { active = false }
  }, [zone])

  if (loading || !ad) return null

  const handleAction = () => {
      // TODO: Implementar modal en caso de 'one_click_order'
      if (ad.action?.type === 'open_url' && ad.action.url) {
          window.open(ad.action.url, '_blank', 'noopener,noreferrer')
      }
  }

  // REUSABILITY: Basic styling parameters
  const bgColor = ad.content.backgroundColor ?? '#fdf4ff'
  const textColor = ad.content.textColor ?? '#f97316'

  // Badge de descuento
  const discountBadge = ad.promo ? (
    ad.promo.discountKind === 'PERCENTAGE'
      ? `${ad.promo.discountValue}% OFF`
      : `$${ad.promo.discountValue.toLocaleString('es-AR')} precio fijo`
  ) : null

  switch (ad.format) {
    case 'text_only':
      return (
        <div 
          onClick={handleAction}
          style={{ 
             background: `linear-gradient(135deg, ${bgColor}ee 0%, ${bgColor}dd 100%)`,
             backdropFilter: 'blur(10px)',
             border: '1px solid rgba(255,255,255,0.2)',
             boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
             borderRadius: '16px',
             padding: '16px 20px',
             marginBottom: '24px',
             cursor: 'pointer',
             display: 'flex',
             flexDirection: 'row',
             alignItems: 'center',
             justifyContent: 'space-between',
             gap: '16px',
             transition: 'transform 0.2s ease, box-shadow 0.2s ease',
          }}
          onMouseEnter={(e) => {
             e.currentTarget.style.transform = 'translateY(-2px)';
             e.currentTarget.style.boxShadow = '0 6px 24px rgba(0,0,0,0.2)';
          }}
          onMouseLeave={(e) => {
             e.currentTarget.style.transform = 'translateY(0)';
             e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.15)';
          }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flex: 1, flexWrap: 'wrap' }}>
                <div style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  width: '40px', 
                  height: '40px', 
                  borderRadius: '50%',
                  backgroundColor: `${textColor}15`,
                  boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.1)',
                  flexShrink: 0
                }}>
                  <span style={{ fontSize: '20px' }}>⚡</span>
                </div>
                
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <p style={{ color: textColor, margin: 0, fontSize: '15px', fontWeight: 800, lineHeight: 1.2 }}>
                          {ad.content.title}
                      </p>
                      {discountBadge && (
                          <span style={{ 
                              backgroundColor: textColor, 
                              color: bgColor,
                              fontSize: '11px', 
                              fontWeight: 900, 
                              padding: '2px 8px', 
                              borderRadius: '99px',
                              boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                          }}>
                              {discountBadge}
                          </span>
                      )}
                    </div>
                    {ad.content.description && (
                        <p style={{ color: textColor, opacity: 0.9, margin: 0, fontSize: '13px', fontWeight: 500, lineHeight: 1.4 }}>
                            {ad.content.description}
                        </p>
                    )}
                </div>
            </div>

            {ad.content.ctaText && (
                <div style={{
                    backgroundColor: textColor,
                    color: bgColor,
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '13px',
                    fontWeight: 800,
                    whiteSpace: 'nowrap',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    alignSelf: 'center'
                }}>
                    {ad.content.ctaText}
                </div>
            )}
        </div>
      )

    case 'banner_small':
      return (
        <div 
          onClick={handleAction}
          style={{ 
             background: `linear-gradient(to right, ${bgColor}, ${bgColor}ee)`,
             border: '1px solid rgba(255,255,255,0.1)',
             boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
             borderRadius: '16px',
             padding: '24px',
             marginBottom: '24px',
             cursor: 'pointer',
             display: 'flex',
             flexDirection: 'row',
             alignItems: 'center',
             justifyContent: 'space-between',
             gap: '20px',
             position: 'relative',
             overflow: 'hidden',
             transition: 'transform 0.2s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.01)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
        >
           <div style={{
               position: 'absolute',
               top: 0,
               right: 0,
               width: '250px',
               height: '250px',
               background: 'rgba(255,255,255,0.1)',
               borderRadius: '50%',
               filter: 'blur(40px)',
               transform: 'translate(50%, -50%)',
               pointerEvents: 'none'
           }} />

           <div style={{ flex: 1, zIndex: 1, minWidth: '220px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', flexWrap: 'wrap' }}>
                    <span style={{ 
                        color: textColor,
                        backgroundColor: 'rgba(0,0,0,0.2)',
                        backdropFilter: 'blur(4px)',
                        fontSize: '11px',
                        fontWeight: 900,
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
                    }}>
                        ZAP PREMIUM
                    </span>
                    {discountBadge && (
                        <span style={{ 
                            backgroundColor: textColor, 
                            color: bgColor,
                            fontSize: '11px', 
                            fontWeight: 900, 
                            padding: '4px 8px', 
                            borderRadius: '6px',
                            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                        }}>
                            {discountBadge}
                        </span>
                    )}
                </div>
                <h3 style={{ color: textColor, fontSize: '20px', fontWeight: 900, margin: '0 0 6px 0', textShadow: '0 1px 2px rgba(0,0,0,0.1)' }}>
                    {ad.content.title}
                </h3>
                {ad.content.description && (
                    <p style={{ color: textColor, opacity: 0.9, fontSize: '15px', fontWeight: 500, margin: 0, maxWidth: '500px', lineHeight: 1.4 }}>
                        {ad.content.description}
                    </p>
                )}
           </div>

           <div style={{ zIndex: 1 }}>
               <button style={{
                   backgroundColor: textColor,
                   color: bgColor,
                   border: 'none',
                   padding: '12px 24px',
                   borderRadius: '12px',
                   fontSize: '14px',
                   fontWeight: 900,
                   cursor: 'pointer',
                   boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
               }}>
                   {ad.content.ctaText || "Activar ahora"} →
               </button>
           </div>
        </div>
      )

    case 'banner_large':
       return null // To be implemented when needed

    default:
      return null
  }
}
