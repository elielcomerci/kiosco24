export function getInternalSecret() {
  const secret = process.env.PARTNER_INTERNAL_SECRET
  if (!secret) throw new Error('PARTNER_INTERNAL_SECRET no configurado')
  return secret
}

export function getTiendaZapUrl() {
  const url = process.env.TIENDA_ZAP_BASE_URL
  if (!url) throw new Error('TIENDA_ZAP_BASE_URL no configurado')
  return url.replace(/\/$/, '')
}
