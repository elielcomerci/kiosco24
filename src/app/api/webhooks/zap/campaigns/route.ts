/**
 * POST /api/webhooks/zap/campaigns
 *
 * Webhook interno llamado por tienda.zap cada vez que se crea, 
 * actualiza o desactiva una PartnerCampaign. Kiosco24 recibe las 
 * campañas y las espeja en su tabla ZapCampaign para servirlas sin lag.
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

import { getInternalSecret } from '@/lib/zap'


export async function POST(req: Request) {
  // 1. Autenticación Server-to-Server
  const internalSecret = req.headers.get('x-partner-secret')
  let expectedSecret: string
  try {
    expectedSecret = getInternalSecret()
  } catch {
    return NextResponse.json({ error: 'Configuración de seguridad inválida' }, { status: 500 })
  }

  if (!internalSecret || internalSecret !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Extraer el body
  let campaigns: Array<{
    id: string
    zone: string
    format: string
    title: string
    description?: string | null
    ctaText?: string | null
    imageUrl?: string | null
    backgroundColor?: string | null
    textColor?: string | null
    actionType: string
    actionUrl?: string | null
    productId?: string | null
    promoType?: string | null
    discountKind?: string | null
    discountValue?: number | null
    active: boolean
  }> = []

  try {
    const body = await req.json()
    if (!Array.isArray(body.campaigns)) {
      throw new Error('El body debe contener un array "campaigns"')
    }
    campaigns = body.campaigns
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Body inválido'
    return NextResponse.json({ error: errorMsg }, { status: 400 })
  }

  try {
    // 3. Sincronización 
    // Usaremos una transacción para que sea atómico.
    await prisma.$transaction(async (tx) => {
      // 1. Marcar como inactivas las campañas que ya no vinieron en la lista
      const activeIds = campaigns.map(c => c.id);
      if (activeIds.length > 0) {
        await tx.zapCampaign.updateMany({
          where: { id: { notIn: activeIds } },
          data: { active: false },
        });
      } else {
        // Si vinieron 0 campañas, desactivamos todo
        await tx.zapCampaign.updateMany({
          where: { active: true },
          data: { active: false },
        });
      }

      for (const camp of campaigns) {
        await tx.zapCampaign.upsert({
          where: { id: camp.id },
          create: {
            id: camp.id,
            zone: camp.zone,
            format: camp.format,
            title: camp.title,
            description: camp.description,
            ctaText: camp.ctaText,
            imageUrl: camp.imageUrl,
            backgroundColor: camp.backgroundColor,
            textColor: camp.textColor,
            actionType: camp.actionType,
            actionUrl: camp.actionUrl,
            productId: camp.productId,
            promoType: camp.promoType,
            discountKind: camp.discountKind,
            discountValue: camp.discountValue,
            active: camp.active,
            syncedAt: new Date(),
          },
          update: {
            zone: camp.zone,
            format: camp.format,
            title: camp.title,
            description: camp.description,
            ctaText: camp.ctaText,
            imageUrl: camp.imageUrl,
            backgroundColor: camp.backgroundColor,
            textColor: camp.textColor,
            actionType: camp.actionType,
            actionUrl: camp.actionUrl,
            productId: camp.productId,
            promoType: camp.promoType,
            discountKind: camp.discountKind,
            discountValue: camp.discountValue,
            active: camp.active,
            syncedAt: new Date(),
          },
        })
      }
    })

    return NextResponse.json({ success: true, count: campaigns.length })
  } catch (err) {
    console.error('[webhook/campaigns] Error sincronizando Ads:', err)
    return NextResponse.json({ error: 'Error interno sincronizando base de datos.' }, { status: 500 })
  }
}
