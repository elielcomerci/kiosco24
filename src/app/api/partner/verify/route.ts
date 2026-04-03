/**
 * GET /api/partner/verify
 *
 * Endpoint usado por tienda.zap para verificar que un accessKey
 * pertenece a un Branch activo en kiosco24 y obtener su branding.
 *
 * Requiere la cabecera interna:
 *   X-Partner-Secret: <PARTNER_INTERNAL_SECRET>
 *
 * El caller (tienda.zap) envía el accessKey a verificar como
 * query param: ?key=<accessKey>
 */

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const runtime = 'nodejs'

import { getInternalSecret } from '@/lib/zap'


export async function GET(req: Request) {
  // 1. Validar secret interno (solo tienda.zap puede llamar esto)
  const internalSecret = req.headers.get('x-partner-secret')
  let expectedSecret: string
  try {
    expectedSecret = getInternalSecret()
  } catch {
    return NextResponse.json({ error: 'Configuración inválida' }, { status: 500 })
  }

  if (!internalSecret || internalSecret !== expectedSecret) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }

  // 2. Extraer el accessKey a verificar
  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')

  if (!key || key.trim().length === 0) {
    return NextResponse.json({ error: 'Parámetro key requerido' }, { status: 400 })
  }

  // 3. Buscar el Branch por accessKey
  const branch = await prisma.branch.findUnique({
    where: { accessKey: key.trim() },
    select: {
      id: true,
      name: true,
      address: true,
      phone: true,
      logoUrl: true,
      primaryColor: true,
      bgColor: true,
      kioscoId: true,
      kiosco: {
        select: {
          id: true,
          name: true,
          owner: {
            select: { email: true },
          },
        },
      },
    },
  })

  if (!branch) {
    return NextResponse.json({ error: 'AccessKey no encontrado' }, { status: 404 })
  }

  return NextResponse.json({
    valid: true,
    branch: {
      id: branch.id,
      name: branch.name,
      address: branch.address,
      phone: branch.phone,
      logoUrl: branch.logoUrl,
      primaryColor: branch.primaryColor ?? '#22c55e',
      bgColor: branch.bgColor ?? '#0f172a',
      kioscoId: branch.kioscoId,
      kioscoName: branch.kiosco.name,
      ownerEmail: branch.kiosco.owner.email,
    },
  })
}
