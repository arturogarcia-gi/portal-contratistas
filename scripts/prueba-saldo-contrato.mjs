// node scripts/prueba-saldo-contrato.mjs
import {
  calcTotalEstimadoBruto, calcTotalPagadoSinIva, calcTotalEnProceso, calcTotalEnTramitePago,
  calcSaldoPorPagar, calcSaldosPorContrato, calcResumenFinanciero,
  ESTADOS_EN_PROCESO, ESTADOS_EST_EN_TRAMITE_PAGO, ESTADOS_ANT_FONDO_EN_TRAMITE_PAGO,
} from '../src/lib/saldoContrato.js'
import { esContratoPorVencer } from '../src/lib/estatusContrato.js'

let total = 0
let fallas = 0
function check(nombre, real, esperado, tol = 1e-9) {
  total++
  const ok = typeof esperado === 'number' ? Math.abs(real - esperado) <= tol : JSON.stringify(real) === JSON.stringify(esperado)
  if (!ok) { fallas++; console.log(`FALLA ${nombre}: real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`) }
}

// Fábricas. Una estimación neta = subtotal − amortización − fondo.
const est = (estado, subtotal, amort = 0, fondo = 0, contrato_id = 'c1') =>
  ({ estado, subtotal, amortizacion_anticipo: amort, fondo_garantia: fondo, contrato_id })
const ant = (estado, monto, contrato_id = 'c1') => ({ estado, monto, contrato_id })
const contrato = (id, extra = {}) => ({ id, estado: 'activo', moneda: 'MXN', monto_original: 1000, monto_vigente: 1000, ...extra })

// --- Listas de estados ---
check('ESTADOS_EN_PROCESO', ESTADOS_EN_PROCESO, ['en_revision', 'en_revision_auditoria', 'autorizada', 'correo_enviado', 'con_factura'])
check('ESTADOS_EST_EN_TRAMITE_PAGO', ESTADOS_EST_EN_TRAMITE_PAGO, ['autorizada', 'correo_enviado', 'con_factura'])
check('ESTADOS_ANT_FONDO_EN_TRAMITE_PAGO', ESTADOS_ANT_FONDO_EN_TRAMITE_PAGO, ['autorizado', 'correo_enviado', 'con_factura'])

// --- Anticipo autorizado: NO es pagado, SÍ es en trámite ---
{
  const ants = [ant('autorizado', 500)]
  check('anticipo autorizado: pagado = 0', calcTotalPagadoSinIva([], ants, []), 0)
  check('anticipo autorizado: en trámite = monto', calcTotalEnTramitePago([], ants, []), 500)
  check('anticipo autorizado: no entra a en proceso (es de estimaciones)', calcTotalEnProceso([]), 0)
  check('anticipo pagado: pagado = monto', calcTotalPagadoSinIva([], [ant('pagado', 500)], []), 500)
  check('anticipo pagado: ya no está en trámite', calcTotalEnTramitePago([], [ant('pagado', 500)], []), 0)
  check('anticipo pendiente: ni pagado ni en trámite',
    calcTotalPagadoSinIva([], [ant('pendiente', 500)], []) + calcTotalEnTramitePago([], [ant('pendiente', 500)], []), 0)
  // Los tres estados intermedios cuentan en trámite (correo_enviado ya no cuenta como pagado)
  for (const estado of ['autorizado', 'correo_enviado', 'con_factura']) {
    check(`anticipo ${estado}: en trámite`, calcTotalEnTramitePago([], [ant(estado, 100)], []), 100)
    check(`anticipo ${estado}: no pagado`, calcTotalPagadoSinIva([], [ant(estado, 100)], []), 0)
  }
}

// --- con_factura: cuenta en proceso y en trámite, no en pagado (base neta, sin IVA) ---
{
  const e = [est('con_factura', 1000, 100, 50)] // neto 850
  check('con_factura: en proceso (neto)', calcTotalEnProceso(e), 850)
  check('con_factura: en trámite (neto)', calcTotalEnTramitePago(e, [], []), 850)
  check('con_factura: no pagado', calcTotalPagadoSinIva(e, [], []), 0)
  const rev = [est('en_revision', 1000, 100, 50), est('en_revision_auditoria', 200)]
  check('revisión 1 y 2: en proceso', calcTotalEnProceso(rev), 1050)
  check('revisión 1 y 2: NO en trámite', calcTotalEnTramitePago(rev, [], []), 0)
  check('borrador/cancelada/rechazada: fuera de proceso',
    calcTotalEnProceso([est('borrador', 9), est('cancelada', 9), est('rechazada', 9), est('en_correccion', 9)]), 0)
  check('pagada: pagado = neto, ni proceso ni trámite',
    [calcTotalPagadoSinIva([est('pagada', 1000, 100, 50)], [], []), calcTotalEnProceso([est('pagada', 1000, 100, 50)]), calcTotalEnTramitePago([est('pagada', 1000, 100, 50)], [], [])],
    [850, 0, 0])
  // Mezcla: el en trámite de estimaciones es subconjunto de en proceso
  const mezcla = [est('en_revision', 100), est('autorizada', 200), est('correo_enviado', 300), est('con_factura', 400), est('pagada', 500)]
  check('mezcla: en proceso', calcTotalEnProceso(mezcla), 1000)
  check('mezcla: en trámite (solo estimaciones)', calcTotalEnTramitePago(mezcla, [], []), 900)
  check('mezcla + anticipo y fondo: en trámite', calcTotalEnTramitePago(mezcla, [ant('autorizado', 10)], [ant('correo_enviado', 20)]), 930)
}

// --- Fondo pagado reduce "por pagar"; anticipo autorizado no ---
{
  const c = contrato('c1', { monto_vigente: 1000 })
  check('por pagar sin nada pagado', calcSaldoPorPagar(c, [], [], []), 1000)
  check('fondo pagado reduce por pagar', calcSaldoPorPagar(c, [], [], [ant('pagado', 100)]), 900)
  check('fondo autorizado NO reduce por pagar', calcSaldoPorPagar(c, [], [], [ant('autorizado', 100)]), 1000)
  check('anticipo autorizado NO reduce por pagar', calcSaldoPorPagar(c, [], [ant('autorizado', 100)], []), 1000)
  check('estimación pagada + anticipo + fondo pagados',
    calcSaldoPorPagar(c, [est('pagada', 300, 20, 10)], [ant('pagado', 100)], [ant('pagado', 50)]), 1000 - 270 - 100 - 50)
}

// --- Borrador no cuenta como estimado ---
{
  const e = [est('borrador', 400), est('en_revision', 100), est('autorizada', 200), est('cancelada', 50), est('rechazada', 60), est('rechazada_auditoria', 70)]
  check('estimado bruto excluye borrador/cancelada/rechazadas', calcTotalEstimadoBruto(e), 300)
}

// --- Compatibilidad: sin `convertir` el resultado es idéntico a la fórmula anterior (copiada de la versión previa) ---
function pagadoAnterior(estimaciones, anticipos, fondos) {
  return estimaciones
    .filter(e => e.estado === 'pagada')
    .reduce((s, e) => s + ((Number(e.subtotal) || 0) - (Number(e.amortizacion_anticipo) || 0) - (Number(e.fondo_garantia) || 0)), 0)
    + anticipos.filter(a => a.estado === 'pagado').reduce((s, a) => s + (Number(a.monto) || 0), 0)
    + fondos.filter(f => f.estado === 'pagado').reduce((s, f) => s + (Number(f.monto) || 0), 0)
}
{
  const estados = ['borrador', 'en_revision', 'autorizada', 'correo_enviado', 'con_factura', 'pagada', 'cancelada']
  const estadosAF = ['pendiente', 'autorizado', 'correo_enviado', 'con_factura', 'pagado']
  let semilla = 7
  const rnd = () => (semilla = (semilla * 16807) % 2147483647) / 2147483647
  for (let caso = 0; caso < 200; caso++) {
    const ests = Array.from({ length: 6 }, () => est(estados[Math.floor(rnd() * estados.length)], Math.round(rnd() * 1e6) / 100, Math.round(rnd() * 1e4) / 100, Math.round(rnd() * 1e4) / 100))
    const ants = Array.from({ length: 2 }, () => ant(estadosAF[Math.floor(rnd() * estadosAF.length)], Math.round(rnd() * 1e6) / 100))
    const fgs = Array.from({ length: 2 }, () => ant(estadosAF[Math.floor(rnd() * estadosAF.length)], Math.round(rnd() * 1e5) / 100))
    check(`compat pagado #${caso}`, calcTotalPagadoSinIva(ests, ants, fgs), pagadoAnterior(ests, ants, fgs), 1e-6)
    const c = contrato('c1', { monto_vigente: 5e6 })
    check(`compat saldo #${caso}`, calcSaldosPorContrato([c], ests, ants, fgs).get('c1'), 5e6 - pagadoAnterior(ests, ants, fgs), 1e-6)
  }
  check('convertir omitido = identidad', calcTotalPagadoSinIva([est('pagada', 100)], [], []), 100)
}

// --- Resumen financiero: contratos cancelados fuera de los totales por SPV ---
{
  const contratos = [
    contrato('c1', { monto_original: 1000, monto_vigente: 1200 }),
    contrato('c2', { estado: 'cancelado', monto_original: 5000, monto_vigente: 5000 }),
  ]
  const estimaciones = [
    est('pagada', 400, 0, 0, 'c1'), est('con_factura', 100, 0, 0, 'c1'), est('en_revision', 50, 0, 0, 'c1'),
    est('pagada', 3000, 0, 0, 'c2'), est('autorizada', 900, 0, 0, 'c2'), est('en_revision', 800, 0, 0, 'c2'),
  ]
  const anticipos = [ant('pagado', 200, 'c1'), ant('autorizado', 70, 'c1'), ant('pagado', 1000, 'c2'), ant('autorizado', 600, 'c2')]
  const fondos = [ant('pagado', 30, 'c1'), ant('con_factura', 40, 'c2')]
  const r = calcResumenFinanciero({ contratos, estimaciones, anticipos, fondos })
  check('SPV con cancelado: contratado solo activos', r.contratado, 1000)
  check('SPV con cancelado: vigente sin cancelados', r.vigente, 1200)
  check('SPV con cancelado: pagado sin cancelados', r.pagado, 400 + 200 + 30)
  check('SPV con cancelado: en proceso sin cancelados', r.enProceso, 100 + 50)
  check('SPV con cancelado: en trámite sin cancelados', r.enTramite, 100 + 70)
  check('SPV con cancelado: pendiente = vigente − pagado', r.pendientePago, 1200 - 630)
  check('SPV con cancelado: % avance', r.pctAvance, 630 / 1200 * 100)
  check('SPV con cancelado: % variación', r.pctVariacion, 20)
  const soloCancelado = calcResumenFinanciero({ contratos: [contratos[1]], estimaciones, anticipos, fondos })
  check('solo cancelado: todo en cero', [soloCancelado.vigente, soloCancelado.pagado, soloCancelado.enProceso, soloCancelado.enTramite, soloCancelado.pendientePago, soloCancelado.pctAvance],
    [0, 0, 0, 0, 0, 0])
  check('filas de contratos fuera de la lista se ignoran',
    calcResumenFinanciero({ contratos: [contratos[0]], estimaciones, anticipos, fondos }).pagado, 630)
  check('sin contratos: ceros y sin NaN', calcResumenFinanciero({ contratos: [], estimaciones: [], anticipos: [], fondos: [] }).pctAvance, 0)
}

// --- Conversión de moneda (convertir(monto, moneda)) ---
{
  const TC = 20
  const convertir = (monto, moneda) => moneda === 'USD' ? monto * TC : monto
  const contratos = [
    contrato('mx', { moneda: 'MXN', monto_original: 1000, monto_vigente: 1000 }),
    contrato('us', { moneda: 'USD', monto_original: 100, monto_vigente: 150 }),
  ]
  const estimaciones = [est('pagada', 500, 0, 0, 'mx'), est('pagada', 40, 0, 0, 'us'), est('autorizada', 10, 0, 0, 'us'), est('en_revision', 5, 0, 0, 'mx')]
  const anticipos = [ant('pagado', 20, 'us'), ant('autorizado', 7, 'us')]
  const sin = calcResumenFinanciero({ contratos, estimaciones, anticipos, fondos: [] })
  check('sin convertir: pagado en bruto', sin.pagado, 500 + 40 + 20)
  const con = calcResumenFinanciero({ contratos, estimaciones, anticipos, fondos: [], convertir })
  check('convertido: contratado', con.contratado, 1000 + 100 * TC)
  check('convertido: vigente', con.vigente, 1000 + 150 * TC)
  check('convertido: pagado', con.pagado, 500 + (40 + 20) * TC)
  check('convertido: en proceso', con.enProceso, 5 + 10 * TC)
  check('convertido: en trámite', con.enTramite, 10 * TC + 7 * TC)
  check('convertido: pendiente', con.pendientePago, (1000 - 500) + (150 - 60) * TC)
  check('convertido: % avance sobre importes convertidos', con.pctAvance, con.pagado / con.vigente * 100)
  // Una función suelta con convertir (monto => monto) ya ligado a la moneda del contrato
  check('calcTotalPagadoSinIva con convertir', calcTotalPagadoSinIva([est('pagada', 40)], [], [], m => m * TC), 800)
  // Sin moneda en el contrato se asume MXN
  const sinMoneda = calcResumenFinanciero({ contratos: [{ id: 'c1', estado: 'activo', monto_vigente: 10 }], estimaciones: [], anticipos: [], fondos: [], convertir })
  check('contrato sin moneda = MXN', sinMoneda.vigente, 10)
}

// --- Contratos por vencer: una sola definición (ACTIVO calculado + fecha_fin en 0..30 días) ---
{
  const hoy = '2026-11-11'
  const c = (fin, extra = {}) => ({ estado: 'activo', monto_vigente: 1000, fecha_fin: fin, ...extra })
  check('vence hoy: por vencer', esContratoPorVencer(c('2026-11-11'), 500, hoy), true)
  check('vence en 30 días: por vencer', esContratoPorVencer(c('2026-12-11'), 500, hoy), true)
  check('vence en 31 días: no', esContratoPorVencer(c('2026-12-12'), 500, hoy), false)
  check('vencido ayer (VENCIDO): no', esContratoPorVencer(c('2026-11-10'), 500, hoy), false)
  check('cancelado: no', esContratoPorVencer(c('2026-11-20', { estado: 'cancelado' }), 500, hoy), false)
  check('saldo en cero (CERRADO): no', esContratoPorVencer(c('2026-11-20'), 0, hoy), false)
  check('sobrepago (CERRADO): no', esContratoPorVencer(c('2026-11-20'), -10, hoy), false)
  check('sin fecha_fin: no', esContratoPorVencer(c(null), 500, hoy), false)
  check('saldo no calculado: ACTIVO provisional', esContratoPorVencer(c('2026-11-20'), null, hoy), true)
  check('ventana configurable', esContratoPorVencer(c('2026-12-12'), 500, hoy, 31), true)
}

console.log(`${total} casos, ${fallas} fallas`)
process.exit(fallas ? 1 : 0)
