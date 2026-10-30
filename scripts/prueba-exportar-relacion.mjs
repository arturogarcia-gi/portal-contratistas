// node scripts/prueba-exportar-relacion.mjs
import ExcelJS from 'exceljs'
import { construirFilasRelacion, armarFirmas } from '../src/lib/relacionEstimacion.js'
import { construirLibroRelacion, repartirColumnas } from '../src/lib/exportarRelacionExcel.js'
import { getLabelPuesto, getNombreFirmante, PUESTOS_FIRMANTES } from '../src/lib/firmantes.js'

let total = 0
let fallas = 0
function check(nombre, real, esperado) {
  total++
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    fallas++
    console.log(`FALLA ${nombre}: real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`)
  }
}
const cerca = (nombre, real, esperado, tol) => check(nombre, Math.abs(real - esperado) <= tol, true)

// --- Relación sintética: grupos anidados, concepto fuera de grupo, saldo negativo, decimales largos ---
// Importe guardado = cantidad_periodo * pu_cobrado, sin redondear (NuevaEstimacion.jsx:420)
const ln = (id, clave, q, puCobrado) => ({ concepto_id: id, clave, cantidad_periodo: q, pu_cobrado: puCobrado, importe_periodo: q * puCobrado })
const conceptos = [
  { id: 'g1', clave: '1', descripcion: 'OBRA CIVIL', tipo: 'AG', jerarquia: '1', orden: 1 },
  { id: 'g11', clave: '1.1', descripcion: 'Cimentaciones', tipo: 'AG', jerarquia: '1.1', orden: 2 },
  { id: 'c111', clave: '1.1.1', descripcion: 'Excavación', unidad: 'm3', tipo: 'CO', jerarquia: '1.1.1', orden: 3, cantidad_contratada: 6285.1939, precio_unitario: 345.678 },
  { id: 'c112', clave: '1.1.2', descripcion: 'Concreto', unidad: 'm3', tipo: 'CO', jerarquia: '1.1.2', orden: 4, cantidad_contratada: 67.2, precio_unitario: 2890.1234 },
  { id: 'g12', clave: '1.2', descripcion: 'Estructura', tipo: 'AG', jerarquia: '1.2', orden: 5 },
  { id: 'c121', clave: '1.2.1', descripcion: 'Acero (P.U. cobrado distinto)', unidad: 'kg', tipo: 'CO', jerarquia: '1.2.1', orden: 6, cantidad_contratada: 0.8333, precio_unitario: 31337.37 },
  { id: 'g2', clave: '2', descripcion: 'ELÉCTRICO', tipo: 'AG', jerarquia: '2', orden: 7 },
  { id: 'c21', clave: '2.1', descripcion: 'Cable (saldo negativo)', unidad: 'm', tipo: 'CO', jerarquia: '2.1', orden: 8, cantidad_contratada: 0.4667, precio_unitario: 210.99 },
  { id: 'c22', clave: '2.2', descripcion: 'Residuo de punto flotante', unidad: 'pza', tipo: 'CO', jerarquia: '2.2', orden: 9, cantidad_contratada: 0.3, precio_unitario: 1000.01 },
  { id: 'c3', clave: '3', descripcion: 'Concepto fuera de grupo', unidad: 'lot', tipo: 'CO', jerarquia: '3', orden: 10, cantidad_contratada: 0.1667, precio_unitario: 98765.4321 },
  { id: 'csin', clave: 'X', descripcion: 'Sin tipo ni jerarquía', unidad: 'lot', tipo: null, jerarquia: null, orden: 11, cantidad_contratada: 1, precio_unitario: 1234.5 },
]
const acumAnterior = {
  // (b) acumulado anterior calculado con un precio distinto (95 % del P.U. actual)
  c111: { cantidad: 4000.1234, importe: 4000.1234 * 345.678 * 0.95 },
  c112: { cantidad: 60, importe: 60 * 2890.1234 },
  c121: { cantidad: 0.1667, importe: 0.1667 * 31337.37 },
  c21: { cantidad: 0.4, importe: 0.4 * 210.99 },
  c22: { cantidad: 0.1 + 0.2, importe: (0.1 + 0.2) * 1000.01 }, // 0.30000000000000004: E-K da -5.5e-17
}
const lineasEsta = [
  ln('c111', '1.1.1', 1000.5678, 345.678),
  ln('c112', '1.1.2', 12.3456, 2890.1234),
  ln('c121', '1.2.1', 0.4667, 31337.37 * 1.02), // (a) P.U. cobrado 2 % arriba del contratado
  ln('c21', '2.1', 0.1667, 210.99),              // 0.4 + 0.1667 > 0.4667 -> saldo negativo
  ln('c3', '3', 0.1667, 98765.4321),
  ln(null, 'X', 1, 1234.5),
]
const { filas, totales } = construirFilasRelacion({ conceptos, acumAnterior, lineasEsta })
const primera = 10
const rowDe = id => primera + filas.findIndex(f => f.id === id)
const rt = primera + filas.length

const base = {
  estimacion: { numero_estimacion: 7 },
  contrato: { numero: 'P05-2026-001' },
  contratista: 'Constructora Ejemplo SA de CV',
  spv: { nombre: 'Alianza Energía', propietario: 'Alianza Energía SAPI de CV', proyecto: 'ALEN · Parque Solar Alianza' },
  periodo: { inicio: '2026-09-01', fin: '2026-09-15' },
  oc: 'OC-03',
  filas,
}
const firmasDe = n => Array.from({ length: n }, (_, i) => ({
  key: 'k' + i, puesto: `Puesto ${i + 1}`, nombre: `Nombre ${i + 1}`, entidad: i % 2 ? '' : `Entidad ${i + 1}`,
}))

async function generar(firmas, extra = {}) {
  const wb = await construirLibroRelacion({ ...base, ...extra, firmas })
  const buf = await wb.xlsx.writeBuffer()
  const wb2 = new ExcelJS.Workbook()
  await wb2.xlsx.load(buf)
  return wb2.worksheets[0]
}

// --- Evaluador manual de fórmulas (ROUND, SUM, +, -, *) sobre el libro releído ---
const redond = (x, d) => { const k = 10 ** d; const r = Math.sign(x) * Math.round(Math.abs(Number(x.toPrecision(15))) * k + 1e-9) / k; return r === 0 ? 0 : r }
function crearEvaluador(ws) {
  const cache = new Map()
  const celda = a => {
    if (cache.has(a)) return cache.get(a)
    const v = ws.getCell(a).value
    const r = v && typeof v === 'object' && v.formula ? evaluar(v.formula) : (typeof v === 'number' ? v : 0)
    cache.set(a, r)
    return r
  }
  const colN = s => [...s].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0)
  const rango = (a, b) => {
    const [, ca, ra] = a.match(/([A-Z]+)(\d+)/)
    const [, cb, rb] = b.match(/([A-Z]+)(\d+)/)
    const out = []
    for (let c = colN(ca); c <= colN(cb); c++) for (let r = +ra; r <= +rb; r++) out.push(celda(String.fromCharCode(64 + c) + r))
    return out
  }
  const suma = (...args) => args.flat().reduce((s, x) => s + x, 0)
  function evaluar(f) {
    const js = f
      .replace(/([A-Z]+\d+):([A-Z]+\d+)|([A-Z]+\d+)/g, (m, a, b, c) => (a ? `rango("${a}","${b}")` : `celda("${c}")`))
      .replace(/ROUND\(/g, 'redond(').replace(/SUM\(/g, 'suma(')
    return new Function('celda', 'rango', 'redond', 'suma', `return (${js})`)(celda, rango, redond, suma)
  }
  return { celda, evaluar }
}

// exceljs escribe <v>0</v>, pero al releer descarta un resultado igual a 0: se toma como 0
const res = v => v.result ?? 0

// --- 1) Textos del encabezado de tabla (celdas maestras) ---
{
  const w = await generar([])
  const titulos = { A8: 'Item', B8: 'Descripción', C8: 'Unidad', D8: 'P.U.', E8: 'Contrato Actual', G8: 'Acumulado Anterior', I8: 'Esta Estimación', K8: 'Nuevo Acumulado', M8: 'Saldo' }
  for (const [a, t] of Object.entries(titulos)) check(`título ${a}`, w.getCell(a).value, t)
  'EFGHIJKLMN'.split('').forEach((c, i) => check(`subtítulo ${c}9`, w.getCell(`${c}9`).value, i % 2 ? 'Importe' : 'Cantidad'))
  for (const a of ['A9', 'D9', 'F8', 'N8']) check(`fondo esclava ${a}`, w.getCell(a).fill?.fgColor?.argb, 'FF1F2937')
  check('A9 combinada con A8', w.getCell('A9').master.address, 'A8')
  check('F8 combinada con E8', w.getCell('F8').master.address, 'E8')
  check('N8 combinada con M8', w.getCell('N8').master.address, 'M8')
  check('B4 contrato', w.getCell('B4').value, 'P05-2026-001')
  check('F4 proyecto', w.getCell('F4').value, 'ALEN · Parque Solar Alianza')
  check('M4 No. Estimación', w.getCell('M4').value, 7)
  check('M5 OC', w.getCell('M5').value, 'OC-03')
}

// --- 2) Hoja con fórmulas: estructura, datos vs fórmulas, estilos ---
const ws = await generar([])
const ev = crearEvaluador(ws)
const esFormula = a => !!(ws.getCell(a).value && ws.getCell(a).value.formula)
{
  const r111 = rowDe('c111')
  const f111 = filas.find(f => f.id === 'c111')
  check('D dato P.U.', ws.getCell(`D${r111}`).value, 345.678)
  check('E dato cantidad contrato (todos los decimales)', ws.getCell(`E${r111}`).value, 6285.1939)
  check('G dato cantidad acumulada anterior', ws.getCell(`G${r111}`).value, f111.acumCant)
  check('H dato importe acumulado anterior (valor)', ws.getCell(`H${r111}`).value, f111.acumImp)
  check('I dato cantidad esta estimación (todos los decimales)', ws.getCell(`I${r111}`).value, 1000.5678)
  for (const c of 'DEGHI') check(`${c}${r111} es valor`, esFormula(`${c}${r111}`), false)
  const formulas = { F: `ROUND(E${r111}*D${r111},2)`, J: `ROUND(I${r111}*D${r111},2)`, K: `G${r111}+I${r111}`, L: `H${r111}+J${r111}`, M: `ROUND(E${r111}-K${r111},6)`, N: `F${r111}-L${r111}` }
  for (const [c, f] of Object.entries(formulas)) check(`${c}${r111} fórmula`, ws.getCell(`${c}${r111}`).value.formula, f)
  check(`fuente azul solo en I${r111}`, ws.getCell(`I${r111}`).font.color.argb, 'FF1D4ED8')
  for (const c of 'DEFGHJKLMN') check(`fuente negra ${c}${r111}`, ws.getCell(`${c}${r111}`).font.color.argb, 'FF000000')
  // Regla completa en todas las filas de concepto: solo la columna I es azul
  for (const f of filas.filter(x => x.tipo !== 'AG')) {
    for (const c of 'DEFGHIJKLMN') check(`color ${c}${rowDe(f.id)} (${f.clave})`, ws.getCell(`${c}${rowDe(f.id)}`).font.color.argb, c === 'I' ? 'FF1D4ED8' : 'FF000000')
  }
  check('formato cantidad', ws.getCell(`E${r111}`).numFmt, '#,##0.00')
  check('formato saldo con rojo', ws.getCell(`M${r111}`).numFmt, '#,##0.00;[Red]-#,##0.00')

  // (b) acumulado anterior con otro precio: L = H + J, no K * P.U.
  const resL = res(ws.getCell(`L${r111}`).value)
  cerca('(b) L = H + J', resL, f111.acumImp + res(ws.getCell(`J${r111}`).value), 1e-6)
  check('(b) L difiere de ROUND(K*D,2) (no depende del P.U. actual)', Math.abs(resL - redond((f111.acumCant + 1000.5678) * 345.678, 2)) > 1, true)

  // (a) P.U. cobrado distinto: J es valor azul con el importe guardado, y hay nota
  const r121 = rowDe('c121')
  const f121 = filas.find(f => f.id === 'c121')
  check('(a) J valor (no fórmula)', esFormula(`J${r121}`), false)
  check('(a) J = importe guardado', ws.getCell(`J${r121}`).value, f121.estaImp)
  check('(a) J valor en negro', ws.getCell(`J${r121}`).font.color.argb, 'FF000000')
  check('(a) J tiene comentario de celda', !!ws.getCell(`J${r121}`).note, true)
  check('(a) las demás fórmulas de la fila siguen siéndolo', 'FKLMN'.split('').every(c => esFormula(`${c}${r121}`)), true)
  check('(a) J de otras filas sí es fórmula', esFormula(`J${r111}`) && esFormula(`J${rowDe('c21')}`), true)
  check('(a) solo 1 fila con J valor', filas.filter(f => f.tipo !== 'AG' && f.estaCant && !esFormula(`J${rowDe(f.id)}`)).length, 1)
  check('(a) nota: encabezado', String(ws.getCell(`A${rt + 2}`).value).startsWith('Nota:'), true)
  const txt = String(ws.getCell(`A${rt + 3}`).value)
  console.log('  nota bajo la tabla:', txt)
  check('(a) nota: fila 1.2.1 con P.U. cobrado y contratado', txt.includes('1.2.1') && txt.includes('P.U. cobrado $31,964.1174') && txt.includes('contratado $31,337.37'), true)
  check('(a) nota: una sola línea de detalle', ws.getCell(`A${rt + 4}`).value ?? null, null)

  // M = ROUND(E-K,6) elimina el residuo de punto flotante (0, no -0.00)
  const r22 = rowDe('c22')
  check('M sin residuo (0, no -5.5e-17)', res(ws.getCell(`M${r22}`).value), 0)
  // Saldo negativo: valor negativo y formato rojo
  const r21 = rowDe('c21')
  check('saldo negativo cantidad', res(ws.getCell(`M${r21}`).value) < 0, true)
  check('saldo negativo importe', res(ws.getCell(`N${r21}`).value) < 0, true)
  check('saldo negativo con formato rojo', ws.getCell(`N${r21}`).numFmt.includes('[Red]'), true)
}

// Recalcular TODAS las fórmulas y compararlas con el resultado precalculado (result)
{
  let nForm = 0
  let peorDif = 0
  for (let r = primera; r <= rt; r++) {
    for (const c of 'FGHIJKLMN') {
      const v = ws.getCell(`${c}${r}`).value
      if (!(v && typeof v === 'object' && v.formula)) continue
      nForm++
      const dif = Math.abs(ev.evaluar(v.formula) - res(v))
      peorDif = Math.max(peorDif, dif)
      check(`${c}${r} recalculado = result (${v.formula})`, dif <= 1e-6, true)
    }
  }
  console.log(`  fórmulas recalculadas: ${nForm}; mayor diferencia contra el resultado precalculado: ${peorDif.toExponential(2)}`)
  check('hay fórmulas que verificar', nForm > 30, true)
}

// Los grupos suman solo los conceptos CO que cuelgan de ellos (sin grupos intermedios)
{
  const co = filas.filter(f => f.tipo === 'CO')
  for (const g of filas.filter(f => f.tipo === 'AG')) {
    const hijos = co.filter(h => h.jerarquia && h.jerarquia.startsWith(g.jerarquia + '.'))
    const r = rowDe(g.id)
    for (const [c, k] of [['F', 'contratoImp'], ['H', 'acumImp'], ['J', 'estaImp'], ['L', 'nuevoImp'], ['N', 'saldoImp']]) {
      const sumaHijos = hijos.reduce((s, h) => s + ev.celda(`${c}${rowDe(h.id)}`), 0)
      cerca(`grupo ${g.clave} ${c} = suma de sus CO`, ev.celda(`${c}${r}`), sumaHijos, 1e-6)
      const f = ws.getCell(`${c}${r}`).value
      check(`grupo ${g.clave} ${c} es fórmula SUM`, !!f.formula && f.formula.startsWith('SUM('), true)
      const celdasRef = (f.formula || '').match(/[A-Z]+\d+/g) || []
      check(`grupo ${g.clave} ${c}: no incluye filas de grupo`, celdasRef.every(a => filas[+a.slice(1) - primera].tipo !== 'AG'), true)
      cerca(`grupo ${g.clave} ${c} ≈ pantalla (${k})`, ev.celda(`${c}${r}`), g[k], 0.015 * hijos.length + 1e-6)
    }
    for (const c of 'EGIKM') check(`grupo ${g.clave}: cantidad ${c} vacía`, ws.getCell(`${c}${r}`).value, null)
  }
  // Grupo anidado: el 1 incluye 1.1.x y 1.2.x; el 1.1 solo 1.1.x
  const f1 = ws.getCell(`F${rowDe('g1')}`).value.formula
  const f11 = ws.getCell(`F${rowDe('g11')}`).value.formula
  check('grupo 1 (anidado) suma 3 conceptos', (f1.match(/[A-Z]+\d+/g) || []).length >= 3, true)
  check('grupo 1.1 solo c111 y c112', f11, `SUM(F${rowDe('c111')}:F${rowDe('c112')})`)
}

// TOTAL: SUM de las filas CO (y sin tipo), no de los grupos; concepto fuera de grupo incluido
{
  check('TOTAL etiqueta', ws.getCell(`A${rt}`).value, 'TOTAL')
  const esperadoCO = filas.map((f, j) => ({ f, r: primera + j })).filter(({ f }) => f.tipo === 'CO' || !f.tipo).map(({ r }) => r)
  for (const c of 'FHJLN') {
    const v = ws.getCell(`${c}${rt}`).value
    const refs = v.formula.replace(/^SUM\(|\)$/g, '').split(',').flatMap(x => {
      const [a, b] = x.split(':').map(y => +y.replace(/\D/g, ''))
      return Array.from({ length: (b ?? a) - a + 1 }, (_, i) => a + i)
    })
    check(`TOTAL ${c}: suma exactamente las filas CO`, refs, esperadoCO)
    cerca(`TOTAL ${c}: recalculado = result`, ev.evaluar(v.formula), res(v), 1e-6)
  }
  // (la comprobación de filas CO de arriba ya incluye el concepto fuera de grupo y el sin tipo ni jerarquía)
  check('TOTAL: hay concepto fuera de grupo y sin tipo entre las filas CO', esperadoCO.includes(rowDe('c3')) && esperadoCO.includes(rowDe('csin')), true)
}

// --- Diferencias entre la hoja (recalculada) y la pantalla (calcularFila de la función compartida) ---
{
  const map = [['F', 'contratoImp'], ['H', 'acumImp'], ['J', 'estaImp'], ['L', 'nuevoImp'], ['N', 'saldoImp']]
  console.log('\n  Hoja vs pantalla por fila de concepto (hoja − pantalla):')
  const co = filas.filter(f => f.tipo === 'CO' || !f.tipo)
  for (const f of co) {
    const r = rowDe(f.id)
    const difs = map.map(([c, k]) => ev.celda(`${c}${r}`) - f[k])
    console.log(`   ${String(f.clave).padEnd(6)} ` + map.map(([c], i) => `${c} ${difs[i].toFixed(4).padStart(9)}`).join('  '))
    map.forEach(([c], i) => check(`fila ${f.clave} ${c}: |hoja − pantalla| ≤ 1.5 centavos`, Math.abs(difs[i]) <= 0.015, true))
  }
  console.log('\n  Hoja vs pantalla, TOTALES:')
  const tot = [['F', totales.contratoActual], ['H', totales.acumAnterior], ['J', totales.esta], ['L', totales.nuevoAcumulado], ['N', totales.saldo]]
  for (const [c, pant] of tot) {
    const hoja = ev.celda(`${c}${rt}`)
    console.log(`   ${c}: pantalla ${pant.toFixed(4)} | hoja ${hoja.toFixed(4)} | dif ${(hoja - pant).toFixed(4)}`)
    check(`TOTAL ${c}: |hoja − pantalla| ≤ 1.5 centavos por fila de concepto`, Math.abs(hoja - pant) <= 0.015 * co.length, true)
  }
  console.log('')
}

// --- 3) repartirColumnas: separador de 1 columna entre bloques, cobertura A..N, ancho parejo ---
const ANCHOS = [14, 55, 9, 15, 12, 16, 12, 16, 12, 16, 12, 16, 12, 16]
const anchoBloque = ([a, b]) => ANCHOS.slice(a - 1, b).reduce((s, w) => s + w, 0)
for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) {
  const r = repartirColumnas(n)
  check(`reparto n=${n}: cantidad de bloques`, r.length, n)
  check(`reparto n=${n}: empieza en A`, r[0][0], 1)
  check(`reparto n=${n}: termina en N`, r[n - 1][1], 14)
  r.forEach(([a, b], i) => {
    check(`reparto n=${n}: bloque ${i + 1} válido`, a <= b, true)
    if (i > 0) check(`reparto n=${n}: ${n <= 7 ? 'una columna libre' : 'contiguos (sin espacio para separador)'} entre bloque ${i} y ${i + 1}`, a - r[i - 1][1], n <= 7 ? 2 : 1)
  })
  if (n >= 4 && n <= 6) {
    const w = r.map(anchoBloque)
    const media = w.reduce((s, x) => s + x, 0) / w.length
    const desv = Math.max(...w.map(x => Math.abs(x - media) / media))
    console.log(`  n=${n}: bloques ${r.map(([a, b]) => `${String.fromCharCode(64 + a)}${a === b ? '' : ':' + String.fromCharCode(64 + b)}`).join(' | ')} | anchos ${w.join('/')} | desviación máx. ${(desv * 100).toFixed(0)} %`)
    check(`reparto n=${n}: desviación de ancho ≤ 60 %`, desv <= 0.6, true)
  }
}

// --- 4) Firmas en el libro: 0 a 8 firmantes (la relación sintética lleva 1 nota de J bajo el TOTAL) ---
// Hasta 4 firmantes en una fila; con 5 o más, dos filas (3+2, 3+3, 4+3, 4+4) con dos filas libres entre ambas
const NOTAS = 1
const cursor = rt + 2 + NOTAS // última fila ocupada antes de las firmas
const tamanosFilas = n => (n === 0 ? [] : n <= 4 ? [n] : [Math.ceil(n / 2), n - Math.ceil(n / 2)])
const maxCocientePorFila = {}
for (const n of [0, 1, 2, 3, 4, 5, 6, 7, 8]) {
  const firmas = firmasDe(n)
  const wsF = await generar(firmas)
  const tam = tamanosFilas(n)
  const ultima = n ? cursor + 3 + tam.length * 3 + (tam.length - 1) * 2 - 1 : cursor
  check(`n=${n}: área de impresión incluye todas las firmas`, wsF.pageSetup.printArea, `A1:N${ultima}`)
  check(`n=${n}: ancho de una página`, [wsF.pageSetup.fitToPage, wsF.pageSetup.fitToWidth, wsF.pageSetup.orientation], [true, 1, 'landscape'])
  if (!n) {
    check('n=0: sin filas de firma bajo la nota', wsF.getRow(cursor + 1).hasValues || wsF.getRow(cursor + 3).hasValues, false)
    check('n=0: genera sin error y conserva TOTAL', wsF.getCell(`A${rt}`).value, 'TOTAL')
    continue
  }
  check(`n=${n}: dos filas vacías antes de las firmas`, [wsF.getRow(cursor + 1).hasValues, wsF.getRow(cursor + 2).hasValues], [false, false])
  let rf = cursor + 3
  let indice = 0
  const cocientes = []
  tam.forEach((k, g) => {
    if (g > 0) {
      check(`n=${n}: dos filas libres entre la fila 1 y la fila 2 de firmas`, [wsF.getRow(rf - 2).hasValues, wsF.getRow(rf - 1).hasValues], [false, false])
    }
    const bloques = repartirColumnas(k)
    check(`n=${n} fila ${g + 1}: ${k} bloques`, bloques.length, k)
    check(`n=${n} fila ${g + 1}: empieza en A y termina en N`, [bloques[0][0], bloques[k - 1][1]], [1, 14])
    const anchos = bloques.map(([a, b]) => anchoBloque([a, b]))
    cocientes.push(Math.max(...anchos) / Math.min(...anchos))
    bloques.forEach(([a, b], i) => {
      const f = firmas[indice++]
      const t = `n=${n} fila ${g + 1} firma ${i + 1}`
      check(`${t}: puesto`, wsF.getCell(rf, a).value, f.puesto)
      check(`${t}: puesto en negritas`, wsF.getCell(rf, a).font.bold, true)
      check(`${t}: nombre`, wsF.getCell(rf + 1, a).value, f.nombre)
      check(`${t}: entidad`, wsF.getCell(rf + 2, a).value ?? '', f.entidad)
      check(`${t}: nombre en gris`, wsF.getCell(rf + 1, a).font.color?.argb, 'FF6B7280')
      for (let c = a; c <= b; c++) check(`${t}: borde superior col ${c}`, wsF.getCell(rf, c).border?.top?.style, 'thin')
      if (b > a) check(`${t}: puesto combinado`, wsF.getCell(rf, b).master.address, wsF.getCell(rf, a).address)
      if (i > 0) {
        const sep = a - 1
        check(`${t}: una columna separadora (${sep}) sin borde`, wsF.getCell(rf, sep).border?.top?.style, undefined)
        check(`${t}: separador sin texto`, wsF.getCell(rf, sep).value, null)
        check(`${t}: no se traslapa con el bloque anterior`, a - bloques[i - 1][1], 2)
      }
    })
    rf += 3 + 2
  })
  maxCocientePorFila[n] = cocientes
  check(`n=${n}: títulos intactos`, [wsF.getCell('A8').value, wsF.getCell('E8').value, wsF.getCell('M8').value], ['Item', 'Contrato Actual', 'Saldo'])
}
console.log('\n  Máximo cociente (bloque más ancho / más angosto) por fila de firmas:')
for (const [n, cs] of Object.entries(maxCocientePorFila)) {
  console.log(`   ${n} firmantes: ${cs.map((c, i) => `fila ${i + 1} (${tamanosFilas(+n)[i]} bloques) ${c.toFixed(2)}`).join(' | ')}`)
  cs.forEach((c, i) => check(`n=${n} fila ${i + 1}: cociente de ancho ≤ 1.7`, c <= 1.7, true))
}
console.log('')
// Sin ninguna fila con J valor no hay nota y las firmas quedan 3 filas bajo el TOTAL
{
  const lineasOk = lineasEsta.map(l => (l.clave === '1.2.1' ? ln('c121', '1.2.1', 0.4667, 31337.37) : l))
  const r2 = construirFilasRelacion({ conceptos, acumAnterior, lineasEsta: lineasOk })
  const w = await generar(firmasDe(4), { filas: r2.filas })
  check('sin J valor: no hay nota', String(w.getCell(`A${rt + 2}`).value ?? '').startsWith('Nota:'), false)
  check('sin J valor: firmas 3 filas bajo el TOTAL', w.getCell(rt + 3, 1).value, 'Puesto 1')
  check('sin J valor: área de impresión', w.pageSetup.printArea, `A1:N${rt + 5}`)
}

// --- 5) armarFirmas contra la lógica original de la pantalla (copiada de HEAD:RelacionEstimacion.jsx) ---
function firmantesOriginal(firmantesActivos, contrato, contratista) {
  const empresaDe = puesto =>
    puesto === 'contratista' ? (contratista?.razon_social || contratista?.nombre || '')
    : puesto === 'interventora' ? ''
    : (contrato?.spvs?.razon_social || '')
  return (firmantesActivos || []).map(puesto => ({
    puesto,
    titulo: getLabelPuesto(puesto, contrato?.spvs),
    nombre: getNombreFirmante(puesto, contrato?.spvs, contrato),
    empresa: empresaDe(puesto),
  }))
}
const spvs = [
  { razon_social: 'Alianza SAPI', project_manager: 'PM Uno', supervision_socio: 'Sup Dos', puesto_supervision_socio: 'Supervisor Técnico', nombre_interventora: 'Int Tres', gte_ingenieria: 'Gte Ing', subdirector_construccion: 'Sub Con', director_operaciones: 'Dir Ops', gte_control_proyectos: 'Gte CP' },
  { razon_social: 'Mismo Nombre', project_manager: 'Mismo Nombre', puesto_supervision_socio: '   ' },
  { razon_social: '', project_manager: '' },
  null,
]
const contratos = [{ firmante_contratista: 'Juan Pérez' }, { firmante_contratista: 'Constructora Ejemplo' }, {}]
const contratistas = [{ razon_social: 'Constructora Ejemplo' }, { nombre: 'Nombre corto' }, {}, null]
const todos = PUESTOS_FIRMANTES.map(p => p.key)
let combos = 0
for (const spv of spvs) for (const ct of contratos) for (const cta of contratistas) for (const puestos of [todos, [], null, ['contratista'], ['supervision', 'interventora']]) {
  const contrato = { ...ct, spvs: spv }
  const orig = firmantesOriginal(puestos, contrato, cta)
  const nuevo = armarFirmas({ puestos, spv, contrato, contratista: cta })
  combos++
  check(`armarFirmas #${combos} cantidad`, nuevo.length, orig.length)
  orig.forEach((o, i) => {
    const n = nuevo[i]
    check(`armarFirmas #${combos}.${i} key`, n.key, o.puesto)
    check(`armarFirmas #${combos}.${i} título`, n.puesto, o.titulo)
    check(`armarFirmas #${combos}.${i} nombre`, n.nombre, o.nombre)
    check(`armarFirmas #${combos}.${i} entidad`, n.entidad, o.empresa && o.empresa !== o.nombre ? o.empresa : '')
  })
}

console.log(`${total} casos, ${fallas} fallas`)
process.exit(fallas ? 1 : 0)
