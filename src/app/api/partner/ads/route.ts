import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zone = searchParams.get('zone')

  if (!zone) {
    return NextResponse.json({ error: 'Falta la zona' }, { status: 400 })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ data: null }) // Silencioso si no hay sesión
  }

  try {
    const campaign = await prisma.zapCampaign.findFirst({
      where: {
        zone,
        active: true,
      },
      orderBy: { syncedAt: 'desc' },
    })

    if (!campaign) {
       return NextResponse.json({ data: null })
    }

    // Map to expected structure for ZapAdSlot
    const mappedAd = {
      id: campaign.id,
      zone: campaign.zone,
      format: campaign.format,
      content: {
        title: campaign.title,
        description: campaign.description,
        ctaText: campaign.ctaText,
        imageUrl: campaign.imageUrl,
        backgroundColor: campaign.backgroundColor,
        textColor: campaign.textColor,
      },
      action: {
        type: campaign.actionType,
        url: campaign.actionUrl,
        productId: campaign.productId,
      },
      ...(campaign.promoType && campaign.discountKind && campaign.discountValue != null && {
        promo: {
          type: campaign.promoType,
          discountKind: campaign.discountKind as 'PERCENTAGE' | 'FIXED_PRICE',
          discountValue: campaign.discountValue,
        },
      }),
    }

    return NextResponse.json({ data: mappedAd })
  } catch (error) {
    console.warn('[proxy/partner-ads] Error consultando ads en DB local, silenciando:', error)
    return NextResponse.json({ data: null })
  }
}
