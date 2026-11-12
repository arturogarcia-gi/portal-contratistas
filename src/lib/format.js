export function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
}

export function formatMXN2(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

export function formatMXNFijo(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

export function formatMXNEstricto(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

export const round2 = (n) => Math.round(n * 100) / 100

export const MESES_ABREV = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

export function formatFecha(fecha) {
  if (!fecha) return '—'
  const d = typeof fecha === 'string'
    ? new Date(fecha.length <= 10 ? fecha + 'T12:00:00' : fecha)
    : fecha
  return `${String(d.getDate()).padStart(2, '0')}-${MESES_ABREV[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}

export function formatFechaLarga(fecha) {
  if (!fecha) return '—'
  const d = typeof fecha === 'string'
    ? new Date(fecha.length <= 10 ? fecha + 'T12:00:00' : fecha)
    : fecha
  return `${String(d.getDate()).padStart(2, '0')}-${MESES_ABREV[d.getMonth()]}-${d.getFullYear()}`
}

export function formatFechaHora(fecha) {
  if (!fecha) return '—'
  const d = typeof fecha === 'string' ? new Date(fecha) : fecha
  const hora = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  return `${formatFecha(fecha)} ${hora}`
}
