// node scripts/prueba-amortizacion.mjs
import { calcAmortizacion } from '../src/lib/amortizacionAnticipo.js'

const round2 = n => Math.round(n * 100) / 100
let total = 0
let fallas = 0
function check(nombre, real, esperado, tol = 0) {
  total++
  if (tol ? Math.abs(real - esperado) > tol : real !== esperado) {
    fallas++
    console.log(`FALLA ${nombre}: real=${real} esperado=${esperado}`)
  }
}

// Fórmula vieja copiada literalmente de NuevaEstimacion.jsx:85 y :433-436
function formulaVieja(valorEstimacion, contrato, anticipo, amortizadoAnterior) {
  const saldoAnticipoDisponible = round2((anticipo?.monto || 0) - amortizadoAnterior)
  const amortizacionSinTope = valorEstimacion * ((contrato?.pct_anticipo || 0) / 100)
  return saldoAnticipoDisponible !== null
    ? Math.min(amortizacionSinTope, Math.max(saldoAnticipoDisponible, 0))
    : amortizacionSinTope
}

// --- Modo 'pct' contra la fórmula vieja ---
for (const pct of [0, 10, 30, 50, 20.644827])
  for (const valor of [0.01, 150, 12345.67, 1000000, 98765432.1])
    for (const monto of [0, 1000000, 25000000])
      for (const previo of [0, 400000, 1000000, 25000000, 30000000]) { // 0 = sin amortizar; >= monto = agotado
        const contrato = { pct_anticipo: pct }
        const anticipo = { monto, estado: 'autorizado' }
        const r = calcAmortizacion({ valorEstimacion: valor, contrato, anticipos: [anticipo], amortizadoPrevio: previo, yaEstimado: 0 })
        const nombre = `pct=${pct} valor=${valor} monto=${monto} previo=${previo}`
        check(`${nombre} monto`, r.amortizacion, formulaVieja(valor, contrato, anticipo, previo))
        check(`${nombre} modo`, r.modo, 'pct')
      }
// Sin anticipos, y con uno pendiente: equivale a monto 0
for (const anticipos of [[], [{ monto: 999, estado: 'pendiente' }]]) {
  const contrato = { pct_anticipo: 30 }
  const r = calcAmortizacion({ valorEstimacion: 5000, contrato, anticipos, amortizadoPrevio: 0, yaEstimado: 0 })
  check('sin anticipo autorizado', r.amortizacion, formulaVieja(5000, contrato, { monto: 0 }, 0))
  check('sin anticipo autorizado modo', r.modo, 'pct')
}
// Un anticipo pendiente adicional no cambia el modo
check('pendiente no cambia modo',
  calcAmortizacion({ valorEstimacion: 100, contrato: { pct_anticipo: 10 },
    anticipos: [{ monto: 30, estado: 'autorizado' }, { monto: 15, estado: 'pendiente', convenio_id: 'c1' }],
    amortizadoPrevio: 0, yaEstimado: 0 }).modo, 'pct')

// --- Modo 'proporcional' ---
const aut = (monto, convenio_id) => ({ monto, estado: 'autorizado', ...(convenio_id ? { convenio_id } : {}) })
function prop(nombre, args, { tasa, amortizacion, saldoAnticipo }) {
  const r = calcAmortizacion(args)
  check(`${nombre} modo`, r.modo, 'proporcional')
  check(`${nombre} tasa`, r.tasa, tasa, 1e-12)
  check(`${nombre} amortizacion`, r.amortizacion, amortizacion)
  if (saldoAnticipo !== undefined) check(`${nombre} saldo`, r.saldoAnticipo, saldoAnticipo)
}
const c100 = { pct_anticipo: 0, monto_vigente: 100 }
const c150 = { pct_anticipo: 0, monto_vigente: 150 }

prop('vigente 100, anticipo 30 (20+10)', { valorEstimacion: 40, contrato: c100, anticipos: [aut(20), aut(10)], amortizadoPrevio: 0, yaEstimado: 0 },
  { tasa: 0.3, amortizacion: 12, saldoAnticipo: 30 })
prop('aditiva +50 con anticipo 15: 33 sobre 110', { valorEstimacion: 10, contrato: c150, anticipos: [aut(20), aut(10), aut(15, 'c1')], amortizadoPrevio: 12, yaEstimado: 40 },
  { tasa: 0.3, amortizacion: 3, saldoAnticipo: 33 })
prop('aditiva +50 con anticipo 25: 43 sobre 110', { valorEstimacion: 10, contrato: c150, anticipos: [aut(20), aut(10), aut(25, 'c1')], amortizadoPrevio: 12, yaEstimado: 40 },
  { tasa: 43 / 110, amortizacion: 3.91, saldoAnticipo: 43 })
prop('saldo por estimar 0', { valorEstimacion: 5, contrato: c100, anticipos: [aut(10, 'c1')], amortizadoPrevio: 0, yaEstimado: 100 },
  { tasa: 1, amortizacion: 5 })
prop('saldo por estimar negativo', { valorEstimacion: 5, contrato: c100, anticipos: [aut(10, 'c1')], amortizadoPrevio: 0, yaEstimado: 120 },
  { tasa: 1, amortizacion: 5 })
prop('saldo por estimar 0, tope por saldo de anticipo', { valorEstimacion: 5, contrato: c100, anticipos: [aut(3, 'c1')], amortizadoPrevio: 0, yaEstimado: 100 },
  { tasa: 1, amortizacion: 3 })
prop('primer anticipo por convenio en contrato con pct 0', { valorEstimacion: 20, contrato: { pct_anticipo: 0, monto_vigente: 100 }, anticipos: [aut(30, 'c1')], amortizadoPrevio: 0, yaEstimado: 0 },
  { tasa: 0.3, amortizacion: 6, saldoAnticipo: 30 })
prop('anticipo mayor al saldo por estimar: tasa topada en 1', { valorEstimacion: 10, contrato: c100, anticipos: [aut(200, 'c1')], amortizadoPrevio: 0, yaEstimado: 95 },
  { tasa: 1, amortizacion: 10 })
prop('saldo de anticipo agotado', { valorEstimacion: 10, contrato: c100, anticipos: [aut(20), aut(10)], amortizadoPrevio: 30, yaEstimado: 50 },
  { tasa: 0, amortizacion: 0, saldoAnticipo: 0 })
prop('respaldo a monto_original', { valorEstimacion: 10, contrato: { pct_anticipo: 0, monto_original: 100 }, anticipos: [aut(10, 'c1')], amortizadoPrevio: 0, yaEstimado: 0 },
  { tasa: 0.1, amortizacion: 1 })

console.log(`${total} casos, ${fallas} fallas`)
process.exit(fallas ? 1 : 0)
