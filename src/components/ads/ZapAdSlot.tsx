'use client'

import React, { useEffect, useState } from 'react'

interface AdAction {
  type: 'open_url' | 'one_click_order' | 'informational'
  url?: string
  productId?: string
}

interface AdContent {
  title: string
  description?: string
  ctaText?: string
  imageUrl?: string
  backgroundColor?: string
  textColor?: string
}

interface ZapAd {
  id: string
  zone: string
  format: 'text_only' | 'banner_small' | 'banner_large'
  content: AdContent
  action?: AdAction
}

interface ZapAdSlotProps {
  zone: string
}

export default function ZapAdSlot({ zone }: ZapAdSlotProps) {
  const [ad, setAd] = useState<ZapAd | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    const fetchAd = async () => {
      try {
        const res = await fetch(`/api/partner/ads?zone=${encodeURIComponent(zone)}`)
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
  const textColor = ad.content.textColor ?? '#f97316' // Orange by default

  switch (ad.format) {
    case 'text_only':
      return (
        <div 
            onClick={handleAction}
            className="group flex flex-col md:flex-row items-center justify-between p-3 rounded-lg border border-orange-100 hover:border-orange-300 transition-colors cursor-pointer mb-6"
            style={{ backgroundColor: bgColor }}
        >
            <div className="flex items-center gap-3 w-full">
                <span className="text-xl">⚡</span>
                <div className="flex-1">
                    <p style={{ color: textColor }} className="text-sm font-bold m-0 leading-tight">
                        {ad.content.title}
                    </p>
                    {ad.content.description && (
                        <p className="text-xs text-gray-500 m-0 mt-0.5 leading-tight">
                            {ad.content.description}
                        </p>
                    )}
                </div>
                {ad.content.ctaText && (
                    <button 
                        style={{ color: textColor }} 
                        className="text-xs font-bold underline bg-transparent border-none p-0 cursor-pointer whitespace-nowrap"
                    >
                        {ad.content.ctaText} &rarr;
                    </button>
                )}
            </div>
        </div>
      )

    case 'banner_small':
      return (
        <div 
          onClick={handleAction}
          className="relative overflow-hidden rounded-xl cursor-pointer mb-6 transform hover:scale-[1.01] transition-transform shadow-sm hover:shadow-md"
          style={{ backgroundColor: bgColor, border: `1px solid ${textColor}30` }}
        >
           <div className="p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex-1 z-10">
                  <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-black tracking-widest uppercase px-1.5 py-0.5 rounded text-white bg-black bg-opacity-20 inline-block" style={{ color: textColor }}>
                          ZAP PREMIUM
                      </span>
                  </div>
                  <h3 style={{ color: textColor }} className="text-lg font-black m-0 mb-1">
                      {ad.content.title}
                  </h3>
                  {ad.content.description && (
                      <p className="text-sm m-0 text-gray-600 max-w-sm">
                          {ad.content.description}
                      </p>
                  )}
              </div>
              <div className="z-10 w-full sm:w-auto mt-2 sm:mt-0">
                  <button 
                      className="w-full sm:w-auto px-5 py-2.5 rounded-lg text-sm font-bold text-white transition-opacity hover:opacity-90 border-none cursor-pointer"
                      style={{ backgroundColor: textColor }}
                  >
                      {ad.content.ctaText || "Conocer más"}
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
