export function formatMXN2(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

export function formatMXNFijo(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0)
}

// Días entre dos fechas ISO (YYYY-MM-DD); null si falta alguna. Sin zona horaria.
export function diasEntreISO(desde, hasta) {
  if (!desde || !hasta) return null
  const [y1, m1, d1] = String(desde).slice(0, 10).split('-').map(Number)
  const [y2, m2, d2] = String(hasta).slice(0, 10).split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export const round2 = (n) => Math.round(n * 100) / 100
