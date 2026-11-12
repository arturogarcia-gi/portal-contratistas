import { ESTADOS_AMORTIZACION_AUTORIZADA, ESTADOS_ANTICIPO_VIGENTE } from './amortizacionAnticipo.js'
import { ESTADOS_REVISION } from './estadosEstimacion.js'

// ---------------------------------------------------------------------------------------------
// Estados que usan las cifras financieras. Las pantallas no definen listas propias: las importan de aquí.
// ---------------------------------------------------------------------------------------------

// "Pagado" cuenta SOLO estos estados (estimaciones: 'pagada'; anticipos y fondos: 'pagado').
export const ESTADO_ESTIMACION_PAGADA = 'pagada'
export const ESTADO_ANTICIPO_FONDO_PAGADO = 'pagado'

// Total estimado bruto: no cuentan borradores, canceladas ni rechazadas (incluida la rechazada por auditoría).
export const ESTADOS_SIN_VALOR_ESTIMADO = ['borrador', 'cancelada', 'rechazada', 'rechazada_auditoria']

// Estimaciones autorizadas y aún no pagadas (derivada de ESTADOS_AMORTIZACION_AUTORIZADA para que no se desfase).
export const ESTADOS_EST_EN_TRAMITE_PAGO = ESTADOS_AMORTIZACION_AUTORIZADA.filter(e => e !== ESTADO_ESTIMACION_PAGADA)
// Anticipos y fondos autorizados y aún no pagados (derivada de ESTADOS_ANTICIPO_VIGENTE).
export const ESTADOS_ANT_FONDO_EN_TRAMITE_PAGO = ESTADOS_ANTICIPO_VIGENTE.filter(e => e !== ESTADO_ANTICIPO_FONDO_PAGADO)
// Estimaciones "en proceso": desde la primera revisión hasta con_factura (todo lo que aún no es 'pagada').
// Se traslapa con ESTADOS_EST_EN_TRAMITE_PAGO: las autorizadas/con factura están en ambas. No se deben sumar entre sí.
export const ESTADOS_EN_PROCESO = [...ESTADOS_REVISION, ...ESTADOS_EST_EN_TRAMITE_PAGO]

// ---------------------------------------------------------------------------------------------
// Moneda: las funciones de un contrato trabajan en su moneda. El último parámetro opcional `convertir`
// (monto => monto) permite devolver el total ya convertido; por defecto es la identidad, así que
// quien no lo pasa (EstadoCuenta, Contratos, ContratoDetalle) obtiene exactamente lo de siempre.
// calcResumenFinanciero (varios contratos, posiblemente en distintas monedas) recibe convertir(monto, moneda).
// ---------------------------------------------------------------------------------------------
const identidad = monto => monto
const num = v => Number(v) || 0
const sumar = (filas, valor) => filas.reduce((s, x) => s + valor(x), 0)

// Neto de una estimación sin IVA: subtotal menos amortización de anticipo y fondo de garantía.
export const netoEstimacion = e => num(e.subtotal) - num(e.amortizacion_anticipo) - num(e.fondo_garantia)

// Total estimado bruto: suma de subtotal (sin IVA, sin amortización de anticipo, sin fondo de garantía).
export function calcTotalEstimadoBruto(estimaciones) {
  return estimaciones
    .filter(e => !ESTADOS_SIN_VALOR_ESTIMADO.includes(e.estado))
    .reduce((s, e) => s + (Number(e.subtotal) || 0), 0)
}

// Pagado sin IVA: estimaciones 'pagada' (neto), anticipos 'pagado' y fondos 'pagado' (por su monto).
export function calcTotalPagadoSinIva(estimaciones, anticipos, fondos, convertir = identidad) {
  return convertir(
    sumar(estimaciones.filter(e => e.estado === ESTADO_ESTIMACION_PAGADA), netoEstimacion)
    + sumar(anticipos.filter(a => a.estado === ESTADO_ANTICIPO_FONDO_PAGADO), a => num(a.monto))
    + sumar(fondos.filter(f => f.estado === ESTADO_ANTICIPO_FONDO_PAGADO), f => num(f.monto))
  )
}

// En proceso sin IVA: neto de las estimaciones de ESTADOS_EN_PROCESO (revisión 1 hasta con_factura).
export function calcTotalEnProceso(estimaciones, convertir = identidad) {
  return convertir(sumar(estimaciones.filter(e => ESTADOS_EN_PROCESO.includes(e.estado)), netoEstimacion))
}

// En trámite de pago sin IVA: lo autorizado y aún no pagado. Estimaciones autorizada/correo_enviado/con_factura (neto)
// más anticipos y fondos autorizado/correo_enviado/con_factura (por su monto).
// Las estimaciones también están dentro de calcTotalEnProceso: NO sumar ambas cifras.
export function calcTotalEnTramitePago(estimaciones, anticipos, fondos, convertir = identidad) {
  return convertir(
    sumar(estimaciones.filter(e => ESTADOS_EST_EN_TRAMITE_PAGO.includes(e.estado)), netoEstimacion)
    + sumar(anticipos.filter(a => ESTADOS_ANT_FONDO_EN_TRAMITE_PAGO.includes(a.estado)), a => num(a.monto))
    + sumar(fondos.filter(f => ESTADOS_ANT_FONDO_EN_TRAMITE_PAGO.includes(f.estado)), f => num(f.monto))
  )
}

export function calcSaldoPorPagar(contrato, estimaciones, anticipos, fondos) {
  return (contrato.monto_vigente || 0) - calcTotalPagadoSinIva(estimaciones, anticipos, fondos)
}

function agruparPorContrato(filas) {
  const m = new Map()
  for (const x of filas) {
    if (!m.has(x.contrato_id)) m.set(x.contrato_id, [])
    m.get(x.contrato_id).push(x)
  }
  return m
}

// Map contrato_id -> saldo, para listas con muchos contratos
export function calcSaldosPorContrato(contratos, estimaciones, anticipos, fondos) {
  const e = agruparPorContrato(estimaciones)
  const a = agruparPorContrato(anticipos)
  const f = agruparPorContrato(fondos)
  return new Map(contratos.map(c => [c.id, calcSaldoPorPagar(c, e.get(c.id) || [], a.get(c.id) || [], f.get(c.id) || [])]))
}

// Resumen financiero de un conjunto de contratos (global, por SPV, por contrato), todo sin IVA y en la moneda
// de visualización: convertir(monto, moneda) se aplica contrato por contrato. Los contratos CANCELADOS no cuentan
// en vigente, pagado, en proceso, en trámite, pendiente ni % de avance. `contratado` suma solo contratos 'activo'.
// Las filas (estimaciones, anticipos, fondos) deben traer contrato_id; las de contratos fuera de `contratos` se ignoran.
export function calcResumenFinanciero({ contratos, estimaciones, anticipos, fondos, convertir = identidad }) {
  const e = agruparPorContrato(estimaciones)
  const a = agruparPorContrato(anticipos)
  const f = agruparPorContrato(fondos)
  const r = { contratado: 0, vigente: 0, pagado: 0, enProceso: 0, enTramite: 0, pendientePago: 0 }

  for (const c of contratos) {
    const conv = monto => convertir(monto, c.moneda || 'MXN')
    if (c.estado === 'activo') r.contratado += conv(num(c.monto_original))
    if (c.estado === 'cancelado') continue

    const ests = e.get(c.id) || []
    const ants = a.get(c.id) || []
    const fgs = f.get(c.id) || []
    r.vigente += conv(num(c.monto_vigente))
    r.pagado += calcTotalPagadoSinIva(ests, ants, fgs, conv)
    r.enProceso += calcTotalEnProceso(ests, conv)
    r.enTramite += calcTotalEnTramitePago(ests, ants, fgs, conv)
    r.pendientePago += conv(calcSaldoPorPagar(c, ests, ants, fgs))
  }

  return {
    ...r,
    pctVariacion: r.contratado > 0 ? (r.vigente - r.contratado) / r.contratado * 100 : 0,
    pctAvance: r.vigente > 0 ? r.pagado / r.vigente * 100 : 0,
  }
}

// Amortización de anticipo acumulada: estimaciones autorizadas en adelante (misma base que calcAmortizacion).
export function calcAmortizado({ estimaciones }) {
  return (estimaciones || [])
    .filter(e => ESTADOS_AMORTIZACION_AUTORIZADA.includes(e.estado))
    .reduce((s, e) => s + (Number(e.amortizacion_anticipo) || 0), 0)
}

export function calcSaldoPorAmortizar({ montoAnticipoVigente, amortizado }) {
  return (Number(montoAnticipoVigente) || 0) - (Number(amortizado) || 0)
}

// Fondo neto retenido hoy: retenido en estimaciones autorizadas en adelante,
// menos lo ya liberado (fondos_garantia en estado 'pagado').
// Con fondosGarantia = [] devuelve el bruto retenido (lo usa FondoDet para el monto del fondo).
export function calcFondoRetenido({ estimaciones, fondosGarantia }) {
  const retenido = (estimaciones || [])
    .filter(e => ESTADOS_AMORTIZACION_AUTORIZADA.includes(e.estado))
    .reduce((s, e) => s + (Number(e.fondo_garantia) || 0), 0)
  const liberado = (fondosGarantia || [])
    .filter(f => f.estado === ESTADO_ANTICIPO_FONDO_PAGADO)
    .reduce((s, f) => s + (Number(f.monto) || 0), 0)
  return retenido - liberado
}
