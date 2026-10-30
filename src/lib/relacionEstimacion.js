// Cálculo de la Relación de Estimación: lo usan la pantalla y el export a Excel
import { getLabelPuesto, getNombreFirmante } from './firmantes.js'

// Firmantes a imprimir (pantalla y Excel). puestos = salida de getPuestosActivos.
// entidad queda vacía si es igual al nombre (misma regla que ya tenía la pantalla).
export function armarFirmas({ puestos, spv, contrato, contratista }) {
  return (puestos || []).map(key => {
    const nombre = getNombreFirmante(key, spv, contrato)
    const empresa = key === 'contratista' ? (contratista?.razon_social || contratista?.nombre || '')
      : key === 'interventora' ? ''
      : (spv?.razon_social || '')
    return { key, puesto: getLabelPuesto(key, spv), nombre, entidad: empresa && empresa !== nombre ? empresa : '' }
  })
}

export function formatCantidad(n) {
  return Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

export function ordenarJerarquia(conceptos) {
  return [...conceptos].sort((a, b) => {
    if (!a.jerarquia && !b.jerarquia) return (a.orden || 0) - (b.orden || 0)
    if (!a.jerarquia) return 1
    if (!b.jerarquia) return -1
    const ap = a.jerarquia.split('.').map(Number)
    const bp = b.jerarquia.split('.').map(Number)
    for (let i = 0; i < Math.max(ap.length, bp.length); i++) {
      if ((ap[i] || 0) !== (bp[i] || 0)) return (ap[i] || 0) - (bp[i] || 0)
    }
    return 0
  })
}

export function construirFilasRelacion({ conceptos, acumAnterior, lineasEsta }) {
  const lineaByConcepto = {}
  const lineaByClave = {}
  lineasEsta.forEach(l => {
    if (l.concepto_id) lineaByConcepto[l.concepto_id] = l
    if (l.clave) lineaByClave[l.clave] = l
  })

  const ordenados = ordenarJerarquia(conceptos)

  function calcularFila(concepto) {
    const pu = concepto.precio_unitario || 0
    const contratoCant = concepto.cantidad_contratada || 0
    const contratoImp = contratoCant * pu
    const acum = acumAnterior[concepto.id] || { cantidad: 0, importe: 0 }
    const linea = lineaByConcepto[concepto.id] || lineaByClave[concepto.clave]
    const estaCant = linea?.cantidad_periodo || 0
    const estaImp = linea?.importe_periodo || 0
    const nuevoCant = acum.cantidad + estaCant
    const nuevoImp = acum.importe + estaImp
    return {
      pu, puCobrado: linea?.pu_cobrado ?? null, contratoCant, contratoImp,
      acumCant: acum.cantidad, acumImp: acum.importe,
      estaCant, estaImp, nuevoCant, nuevoImp,
      saldoCant: contratoCant - nuevoCant, saldoImp: contratoImp - nuevoImp,
    }
  }

  function sumarHijosAG(jerarquiaPadre, campo) {
    return ordenados
      .filter(c => c.tipo === 'CO' && c.jerarquia && jerarquiaPadre && c.jerarquia.startsWith(jerarquiaPadre + '.'))
      .reduce((sum, c) => sum + calcularFila(c)[campo], 0)
  }

  const filas = ordenados.map(c => {
    const nivel = (c.jerarquia?.match(/\./g) || []).length
    const base = { id: c.id, tipo: c.tipo, nivel, jerarquia: c.jerarquia, clave: c.clave, descripcion: c.descripcion }
    if (c.tipo === 'AG') {
      const s = campo => sumarHijosAG(c.jerarquia, campo)
      return {
        ...base, unidad: null, pu: null,
        contratoCant: null, contratoImp: s('contratoImp'),
        acumCant: null, acumImp: s('acumImp'),
        estaCant: null, estaImp: s('estaImp'),
        nuevoCant: null, nuevoImp: s('nuevoImp'),
        saldoCant: null, saldoImp: s('saldoImp'),
      }
    }
    return { ...base, unidad: c.unidad, ...calcularFila(c) }
  })

  const totales = ordenados
    .filter(c => c.tipo === 'CO' || !c.tipo)
    .reduce((acc, c) => {
      const f = calcularFila(c)
      acc.contratoActual += f.contratoImp
      acc.acumAnterior += f.acumImp
      acc.esta += f.estaImp
      acc.nuevoAcumulado += f.nuevoImp
      acc.saldo += f.saldoImp
      return acc
    }, { contratoActual: 0, acumAnterior: 0, esta: 0, nuevoAcumulado: 0, saldo: 0 })

  return { filas, totales }
}
