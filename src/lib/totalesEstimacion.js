import { calcAmortizacion } from './amortizacionAnticipo.js'
import { round2 } from './format.js'
import { calcIva } from './iva.js'

// Totales de una estimación a partir de sus líneas (misma fórmula que usaba la creación).
export function calcularTotalesEstimacion({ lineas, contrato, datosAmort }) {
  const valorEstimacion = lineas.reduce((s, l) => s + (l.importe_periodo || 0), 0)
  const fondoGarantia = valorEstimacion * ((contrato?.pct_fondo_garantia || 0) / 100)
  const calc = datosAmort ? calcAmortizacion({ valorEstimacion, contrato, ...datosAmort }) : null
  const amortizacion = calc?.amortizacion ?? 0
  const subtotalNeto = round2(valorEstimacion - amortizacion - fondoGarantia)
  const iva = calcIva(subtotalNeto, contrato)
  const totalNeto = round2(subtotalNeto + iva)
  return { valorEstimacion, fondoGarantia, calc, amortizacion, subtotalNeto, iva, totalNeto }
}

export function folioEstimacion(numeroContrato, numeroEstimacion) {
  const hash = Math.random().toString(36).substring(2, 10).toUpperCase()
  return `EST-${numeroContrato}-${String(numeroEstimacion).padStart(3, '0')}-${hash}`
}

// Campos monetarios del encabezado (subtotal = valor bruto de la estimación, como siempre)
export function camposMontosEstimacion(t) {
  return {
    subtotal: t.valorEstimacion,
    iva: t.iva,
    fondo_garantia: t.fondoGarantia,
    amortizacion_anticipo: t.amortizacion,
    total_neto: t.totalNeto,
  }
}

export function filasLineas(estimacionId, lineas) {
  return lineas.map(l => ({
    estimacion_id: estimacionId,
    concepto_id: l.concepto_id,
    clave: l.clave,
    descripcion: l.descripcion,
    unidad: l.unidad,
    cantidad_contratada: l.cantidad_contratada,
    cantidad_acumulada_anterior: l.cantidad_acumulada_anterior,
    cantidad_periodo: l.cantidad_periodo,
    cantidad_acumulada_total: l.cantidad_acumulada_total,
    pu_contratado: l.pu_contratado,
    pu_cobrado: l.pu_cobrado,
    importe_periodo: l.importe_periodo,
    validacion_pu: l.validacion_pu,
    validacion_volumen: l.validacion_volumen,
  }))
}
