/**
 * POST /api/partner/push-coupons
 *
 * Proxy interno de kiosco24 → tienda.zap.
 * El frontend del kiosco llama a este endpoint con los datos del lote
 * de cupones (incluyendo el PDF pre-renderizado en base64).
 *
 * Este route extrae el accessKey del Branch del dueño autenticado
 * y hace el forwarding a tienda.zap/api/partner/coupons/push.
 */

import { auth } from '@/lib/auth'
import { getBranchContext } from '@/lib/branch'
import { prisma } from '@/lib/prisma'
import { UserRole } from '@prisma/client'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

import { getTiendaZapUrl } from '@/lib/zap'


export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id || session.user.role !== UserRole.OWNER) {
    return NextResponse.json({ error: 'No autorizado.' }, { status: 403 })
  }

  const { branchId } = await getBranchContext(req, session.user.id)
  if (!branchId) {
    return NextResponse.json({ error: 'Sucursal no encontrada.' }, { status: 404 })
  }

  // Obtener el accessKey del Branch y su branding
  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: {
      accessKey: true,
      name: true,
      logoUrl: true,
      primaryColor: true,
    },
  })

  if (!branch?.accessKey) {
    return NextResponse.json(
      { error: 'Esta sucursal no tiene un accessKey configurado. Generá uno desde la configuración.' },
      { status: 400 }
    )
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Body inválido.' }, { status: 400 })
  }

  let tiendaZapUrl: string
  try {
    tiendaZapUrl = getTiendaZapUrl()
  } catch {
    return NextResponse.json({ error: 'Integración no configurada en este servidor.' }, { status: 503 })
  }

  const safeBody = { ...(body as Record<string, unknown>) };
  delete safeBody.pdfBase64;

  // Forward a tienda.zap con el accessKey como Bearer token y el branding del branch
  const payload = {
    ...safeBody,
    branchId,
    branding: {
      branchName: branch.name,
      logoUrl: branch.logoUrl ?? null,
      primaryColor: branch.primaryColor ?? '#22c55e',
    },
  }

  let tiendaResponse: Response
  try {
    tiendaResponse = await fetch(`${tiendaZapUrl}/api/partner/coupons/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${branch.accessKey}`,
      },
      body: JSON.stringify(payload),
    })
  } catch (err) {
    console.error('[push-coupons] Error conectando a tienda.zap:', err)
    return NextResponse.json(
      { error: 'No se pudo conectar con el servicio de impresión. Intentá más tarde.' },
      { status: 503 }
    )
  }

  const data = await tiendaResponse.json().catch(() => ({}))

  if (!tiendaResponse.ok) {
    console.error('[push-coupons] tienda.zap respondió con error:', tiendaResponse.status, data)
    return NextResponse.json(
      { error: (data as { error?: string }).error ?? 'Error en el servicio de impresión.' },
      { status: tiendaResponse.status }
    )
  }

  return NextResponse.json(data, { status: 201 })
}
