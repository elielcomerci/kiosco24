import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/**
 * GET /api/partner/ads?zone=xxx&branchId=yyy
 *
 * Proxy hacia tienda.zap.com.ar/api/partner/ads.
 * Autentica con el accessKey del branch como Bearer token.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const zone = searchParams.get('zone')
  const branchId = searchParams.get('branchId')

  if (!zone || !branchId) {
    return NextResponse.json({ data: null })
  }

  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ data: null }) // Silencioso si no hay sesión
  }

  try {
    const branch = await prisma.branch.findUnique({
      where: { id: branchId },
      select: { accessKey: true },
    })

    if (!branch?.accessKey) {
      return NextResponse.json({ data: null })
    }

    const tiendaZapUrl = process.env.TIENDA_ZAP_BASE_URL?.replace(/\/$/, '')
    if (!tiendaZapUrl) {
      console.warn('[partner/ads] TIENDA_ZAP_BASE_URL no configurado')
      return NextResponse.json({ data: null })
    }

    const res = await fetch(
      `${tiendaZapUrl}/api/partner/ads?zone=${encodeURIComponent(zone)}`,
      {
        headers: {
          Authorization: `Bearer ${branch.accessKey}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(5000),
        cache: 'no-store',
      }
    )

    if (!res.ok) {
      console.warn(`[partner/ads] tienda.zap respondió ${res.status} para zone=${zone}`)
      return NextResponse.json({ data: null })
    }

    const data = await res.json()
    return NextResponse.json(data)
  } catch (error) {
    console.warn('[partner/ads] Error proxying a tienda.zap, silenciando:', error)
    return NextResponse.json({ data: null })
  }
}
