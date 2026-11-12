// Estatus de contrato calculado. No se guarda en la BD; contratos.estado no se modifica.
const TOLERANCIA = 0.01

export const ESTATUS_CONTRATOS = ['ACTIVO', 'VENCIDO', 'CERRADO', 'CANCELADO']
export const ORDEN_ESTATUS_CONTRATO = { ACTIVO: 0, VENCIDO: 1, CERRADO: 2, CANCELADO: 3 }
export const ESTATUS_CONTRATO_COLORS = {
  ACTIVO: 'bg-emerald-50 text-emerald-700',
  VENCIDO: 'bg-red-50 text-red-700',
  CERRADO: 'bg-gray-100 text-gray-600',
  CANCELADO: 'bg-gray-100 text-gray-500 line-through',
}

// YYYY-MM-DD en hora local (toISOString sería UTC)
export function fechaLocalISO(d = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// Días entre dos fechas YYYY-MM-DD (hasta - desde), sin horas ni zona horaria
export function diasEntreISO(desde, hasta) {
  const [y1, m1, d1] = desde.split('-').map(Number)
  const [y2, m2, d2] = hasta.split('-').map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

export function haySobrepago(saldo) {
  return saldo != null && saldo < -TOLERANCIA
}

// Gana la primera regla que cumpla. saldo null/undefined = no calculado:
// no puede ser CERRADO ni VENCIDO. fecha_fin nula nunca es vencido.
export function getEstatusContrato(contrato, saldo, hoy = fechaLocalISO()) {
  if (contrato.estado === 'cancelado') return 'CANCELADO'
  if (saldo != null && Number.isFinite(saldo)) {
    if ((Number(contrato.monto_vigente) || 0) > 0 && saldo <= TOLERANCIA) return 'CERRADO'
    if (contrato.fecha_fin && contrato.fecha_fin < hoy && saldo > TOLERANCIA) return 'VENCIDO'
  }
  return 'ACTIVO'
}

// Ventana (en días) en la que un contrato se considera "por vencer".
export const DIAS_AVISO_VENCIMIENTO = 30

// Única definición de "contrato por vencer": estatus calculado ACTIVO (con saldo, ver getEstatusContrato)
// y fecha_fin entre hoy y hoy + dias (ambos incluidos). La usan Home y Dashboard.
// saldo null/undefined = no calculado: se trata como ACTIVO provisional, igual que getEstatusContrato.
export function esContratoPorVencer(contrato, saldo, hoy = fechaLocalISO(), dias = DIAS_AVISO_VENCIMIENTO) {
  if (!contrato?.fecha_fin) return false
  if (getEstatusContrato(contrato, saldo, hoy) !== 'ACTIVO') return false
  const restantes = diasEntreISO(hoy, contrato.fecha_fin)
  return restantes >= 0 && restantes <= dias
}

// Datos del badge: si el saldo no está calculado (y no es CANCELADO) muestra un
// badge neutro "—" en vez de un ACTIVO provisional.
export function badgeEstatusContrato(contrato, saldo, hoy = fechaLocalISO()) {
  const estatus = getEstatusContrato(contrato, saldo, hoy)
  if (estatus !== 'CANCELADO' && (saldo == null || !Number.isFinite(saldo))) {
    return { texto: '—', clase: 'bg-gray-100 text-gray-400', title: 'Saldo no calculado' }
  }
  return {
    texto: estatus,
    clase: ESTATUS_CONTRATO_COLORS[estatus],
    title: haySobrepago(saldo) ? 'Pagado excede el monto vigente' : undefined,
  }
}
