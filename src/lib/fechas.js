// Fechas propias del portal. Reutiliza estatusContrato.js (copia de la app) en vez de duplicar fechaLocalISO / diasEntreISO.
import { fechaLocalISO, diasEntreISO } from './estatusContrato.js'

// Días enteros (calendario local) desde un timestamp (p. ej. created_at, que llega en UTC) hasta hoy.
// null si no hay fecha válida. Convertir a fecha local antes de contar evita errores cerca de la medianoche.
export function diasDesde(timestamp, ahora = new Date()) {
  if (!timestamp) return null
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return null
  return diasEntreISO(fechaLocalISO(d), fechaLocalISO(ahora))
}
