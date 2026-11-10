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

// Fecha LOCAL (YYYY-MM-DD) de un timestamp o Date. Un created_at en UTC cerca de la medianoche
// cae en otro día que el local; para contar días enteros hay que convertirlo antes.
export function fechaLocalISO(valor = new Date()) {
  const d = valor instanceof Date ? valor : new Date(valor)
  if (Number.isNaN(d.getTime())) return null
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Días enteros (calendario local) desde un timestamp hasta hoy; null si no hay fecha válida.
export function diasDesde(timestamp, ahora = new Date()) {
  if (!timestamp) return null
  return diasEntreISO(fechaLocalISO(timestamp), fechaLocalISO(ahora))
}

export const round2 = (n) => Math.round(n * 100) / 100
