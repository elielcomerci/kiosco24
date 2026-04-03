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
            className="group relative flex flex-col md:flex-row items-center justify-between p-4 md:p-5 rounded-2xl cursor-pointer mb-6 transform hover:-translate-y-1 transition-all duration-300 ease-out shadow-sm hover:shadow-lg overflow-hidden border border-white/20"
            style={{ 
              background: `linear-gradient(135deg, ${bgColor}ee 0%, ${bgColor}bb 100%)`,
              backdropFilter: 'blur(10px)'
            }}
        >
            {/* Shimmer effect on hover */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-r from-transparent via-white/20 to-transparent -skew-x-12 translate-x-[-150%] group-hover:translate-x-[150%]" />
            
            <div className="flex items-center gap-4 w-full z-10">
                <div 
                  className="hidden sm:flex items-center justify-center w-10 h-10 rounded-full shadow-inner"
                  style={{ backgroundColor: `${textColor}15` }}
                >
                  <span className="text-xl filter drop-shadow-sm">⚡</span>
                </div>
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <p style={{ color: textColor }} className="text-sm sm:text-base font-black m-0 leading-tight tracking-tight">
                          {ad.content.title}
                      </p>
                      {discountBadge && (
                          <span className="text-[10px] sm:text-xs font-black px-2 py-0.5 rounded-full text-white shrink-0 shadow-sm" style={{ backgroundColor: textColor }}>
                              {discountBadge}
                          </span>
                      )}
                    </div>
                    {ad.content.description && (
                        <p className="text-xs sm:text-sm m-0 mt-1 leading-relaxed opacity-90 font-medium" style={{ color: `${textColor}cc` }}>
                            {ad.content.description}
                        </p>
                    )}
                </div>
                {ad.content.ctaText && (
                    <div 
                        className="hidden sm:flex px-4 py-2 rounded-xl text-sm font-bold text-white shadow-md group-hover:shadow-lg transition-all"
                        style={{ backgroundColor: textColor }}
                    >
                        {ad.content.ctaText}
                    </div>
                )}
            </div>
            {/* Mobile CTA */}
            {ad.content.ctaText && (
                <div 
                    className="sm:hidden w-full mt-3 px-4 py-2 rounded-xl text-sm text-center font-bold text-white shadow-sm"
                    style={{ backgroundColor: textColor }}
                >
                    {ad.content.ctaText}
                </div>
            )}
        </div>
      )

    case 'banner_small':
      return (
        <div 
          onClick={handleAction}
          className="group relative overflow-hidden rounded-2xl cursor-pointer mb-6 transform hover:scale-[1.02] transition-all duration-300 ease-in-out shadow-md hover:shadow-xl border border-white/10"
          style={{ 
            background: `linear-gradient(to right, ${bgColor}, ${bgColor}ee)`,
          }}
        >
           <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
           <div className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 relative z-10">
              <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <span className="text-[10px] sm:text-xs font-black tracking-widest uppercase px-2 py-1 rounded-md text-white bg-black/20 backdrop-blur-sm shadow-inner" style={{ color: textColor }}>
                          ZAP PREMIUM
                      </span>
                      {discountBadge && (
                          <span className="text-[10px] sm:text-xs font-black px-2 py-1 rounded-md text-white shadow-sm" style={{ backgroundColor: textColor }}>
                              {discountBadge}
                          </span>
                      )}
                  </div>
                  <h3 style={{ color: textColor }} className="text-lg sm:text-xl font-black m-0 mb-1.5 tracking-tight drop-shadow-sm">
                      {ad.content.title}
                  </h3>
                  {ad.content.description && (
                      <p className="text-sm sm:text-base m-0 max-w-lg font-medium opacity-90" style={{ color: `${textColor}dd` }}>
                          {ad.content.description}
                      </p>
                  )}
              </div>
              <div className="w-full sm:w-auto mt-2 sm:mt-0">
                  <button 
                      className="w-full sm:w-auto px-6 py-3 rounded-xl text-sm font-black text-white transition-all group-hover:brightness-110 group-hover:scale-105 border-none cursor-pointer shadow-lg active:scale-95"
                      style={{ backgroundColor: textColor }}
                  >
                      {ad.content.ctaText || "Activar ahora"} →
                  </button>
              </div>
           </div>
        </div>
      )

    case 'banner_large':
       return null // To be implemented when needed

    default:
      return null
  }
}
