// node scripts/prueba-plantilla-carga.mjs
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import JSZip from 'jszip' // dependencia de exceljs; se usa para revisar el XML tal como lo escribe
import {
  construirLibroPlantilla, leerPlantillaCarga, esPlantillaNueva, cargarAcumuladoConceptos,
  ESTADOS_CUENTAN_ACUMULADO, VERSION_PLANTILLA, calcularCompensacionPendiente, validarCompensaciones,
} from '../src/lib/plantillaCarga.js'
import { calcAmortizacion } from '../src/lib/amortizacionAnticipo.js'

let total = 0
let fallas = 0
function check(nombre, real, esperado) {
  total++
  if (JSON.stringify(real) !== JSON.stringify(esperado)) {
    fallas++
    console.log(`FALLA ${nombre}: real=${JSON.stringify(real)} esperado=${JSON.stringify(esperado)}`)
  }
}
const contiene = (nombre, lista, fragmento) => check(nombre, lista.some(t => t.includes(fragmento)), true)

// --- Datos sintéticos con la forma de la base ---
const CONTRATO = { id: 'ct-1', numero: 'P05-2026-001', spvs: { nombre: 'Alianza Energía' } }
const PERIODO = { id: 'pe-1', label: '1a Quincena Nov 2026' }
const c = (id, clave, descripcion, unidad, E, pu, orden) => ({ id, clave, descripcion, unidad, tipo: 'CO', jerarquia: clave, orden, cantidad_contratada: E, precio_unitario: pu })
const conceptos = [
  { id: 'g1', clave: '1', descripcion: 'OBRA CIVIL', tipo: 'AG', jerarquia: '1', orden: 1 },
  c('c11', '1.1', 'Excavación a mano', 'm3', 120.5, 345.67, 2),
  c('c12', '1.2', 'Concreto', 'm3', 67.2, 2890.1234, 3),
  c('c13', '1.3', 'Acero (saldo agotado)', 'kg', 1000.75, 31.337, 4),
  c('c14', '1.4', 'Pieza especial', 'pza', 0.8333, 98765.4321, 5),
  { id: 'g2', clave: '2', descripcion: 'ELÉCTRICO', tipo: 'AG', jerarquia: '2', orden: 6 },
  c('c21', '2.1', 'Cable', 'm', 300.5, 210.99, 7),
  c('c22', '2.2', 'Terminales', 'lot', 12.4667, 1500, 8),
  c('c23', '2.3', 'Transformador (suministro del cliente, P.U. 0)', 'pza', 25, 0, 9),
  c('c24', '2.4', 'Conectores', 'pza', 0.4667, 7777.77, 10),
]
const acumulado = {
  c11: { cantidad: 40.25, importe: 40.25 * 345.67 * 0.95 }, // acumulado a otro precio
  c12: { cantidad: 20.1667, importe: 20.1667 * 2890.1234 },
  c13: { cantidad: 1000.75, importe: 1000.75 * 31.337 },
  c21: { cantidad: 150.125, importe: 150.125 * 210.99 },
  c22: { cantidad: 0.1667, importe: 0.1667 * 1500 },
  c23: { cantidad: 5, importe: 0 },
  c24: { cantidad: 0.4, importe: 0.4 * 7777.77 },
}
const FILA = { c11: 11, c12: 12, c13: 13, c14: 14, c21: 16, c22: 17, c23: 18, c24: 19 }
const CTX = { contratoId: 'ct-1', periodoId: 'pe-1', conceptos, acumulado }

const wbPlantilla = await construirLibroPlantilla({
  conceptos, acumulado, contrato: CONTRATO, periodo: PERIODO, numeroEstimacion: 7, fechaDescarga: new Date('2026-10-30T15:04:05.000Z'),
})
const bufBase = Buffer.from(await wbPlantilla.xlsx.writeBuffer())

// Llena la plantilla (alterando lo que haga falta) y la lee como lo haría NuevaEstimacion
async function leer(modificar, ctx = CTX) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bufBase)
  modificar(wb.getWorksheet('Estimación'), wb)
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  const xl = XLSX.read(buf, { type: 'buffer' })
  return { r: leerPlantillaCarga(xl, ctx), xl }
}
const claves = r => r.lineas.map(l => l.clave)

// ============ A) La plantilla en sí ============
{
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bufBase)
  const ws = wb.getWorksheet('Estimación')
  const meta = wb.getWorksheet('_meta')
  check('hoja protegida sin contraseña', [ws.sheetProtection?.sheet, ws.sheetProtection?.hashValue], [true, undefined])
  check('_meta veryHidden', meta.state, 'veryHidden')
  const m = {}; meta.eachRow(row => { m[row.getCell(1).value] = row.getCell(2).value })
  check('metadatos', m, { version: VERSION_PLANTILLA, contrato_id: 'ct-1', periodo_id: 'pe-1', numero_estimacion: 7, fecha_descarga: '2026-10-30T15:04:05.000Z', col_cantidad: 'I', col_acumulado: 'G', col_id: 'O', fila_inicio: 10, fila_fin: 19 })
  check('columna O oculta', ws.getColumn(15).hidden, true)
  check('ids en O solo en conceptos', [10, 11, 15, 16].map(r => ws.getCell(`O${r}`).value ?? null), [null, 'c11', null, 'c21'])
  // Solo la columna I de las filas de concepto es editable
  const desbloqueadas = []
  ws.eachRow({ includeEmpty: false }, (row, rn) => row.eachCell({ includeEmpty: true }, (cell, cn) => { if (cell.protection?.locked === false) desbloqueadas.push(cell.address) }))
  check('únicas celdas desbloqueadas = I de conceptos', desbloqueadas.sort(), Object.values(FILA).map(f => `I${f}`).sort())
  check('I amarilla', ws.getCell('I11').fill.fgColor.argb, 'FFFFF2CC')
  check('número de estimación rotulado como provisional', [ws.getCell('K4').value, ws.getCell('M4').value, ws.getCell('K5').value], ['Estimación (provisional)', 7, 'El número definitivo se asigna al guardar.'])
  // Validación de datos
  const dv = ws.getCell('I11').dataValidation
  check('validación: decimal entre 0 y el saldo', [dv.type, dv.operator, dv.formulae[0]], ['decimal', 'between', 0])
  // exceljs no relee formula2; se revisa en el XML escrito
  const zip = await JSZip.loadAsync(bufBase)
  const xml = await zip.file('xl/worksheets/sheet1.xml').async('string')
  check('XML: segunda fórmula de la validación = saldo', xml.includes('sqref="I11"><formula1>0</formula1><formula2>ROUND($E11-$G11,6)</formula2>'), true)
  check('XML: 8 validaciones', (xml.match(/<dataValidation /g) || []).length, 8)
  check('XML: protección sin contraseña (sin hash) y sin permisos de formato/insertar/borrar', xml.includes('<sheetProtection sheet="1"/>'), true)
  check('validación: mensaje en español', dv.error, 'Escribe un número válido, con el separador decimal de tu equipo, que no pase del saldo disponible.')
  check('validación: bloquea (stop)', [dv.errorStyle, dv.showErrorMessage], ['stop', true])
  check('validación: no hay en filas de grupo', ws.getCell('I10').dataValidation ?? null, null)
  // Formato condicional
  const cf = ws.conditionalFormattings
  check('formato condicional: expresión $M10<0 sobre la tabla', [cf.length, cf[0].ref, cf[0].rules[0].formulae], [1, 'A10:N19', ['$M10<0']])
  // Fórmulas: forma y resultados precalculados
  check('F fórmula', ws.getCell('F11').value.formula, 'ROUND(E11*D11,2)')
  check('J fórmula', ws.getCell('J11').value.formula, 'ROUND(I11*D11,2)')
  check('K fórmula', ws.getCell('K11').value.formula, 'G11+I11')
  check('L fórmula (redondeada)', ws.getCell('L11').value.formula, 'ROUND(H11+J11,2)')
  check('M fórmula', ws.getCell('M11').value.formula, 'ROUND(E11-K11,6)')
  check('N fórmula (redondeada)', ws.getCell('N11').value.formula, 'ROUND(F11-L11,2)')
  check('grupo 1: SUM de sus CO', ws.getCell('F10').value.formula, 'SUM(F11:F14)')
  check('TOTAL: SUM de los CO (rangos contiguos)', ws.getCell('F20').value.formula, 'SUM(F11:F14,F16:F19)')
  check('resultado precalculado presente (F11)', ws.getCell('F11').value.result, Math.round(120.5 * 345.67 * 100) / 100)
  // Residuo -0.00: el concepto agotado (1.3) no queda en negativo
  const N13 = ws.getCell('N13').value.result ?? 0
  const M13 = ws.getCell('M13').value.result ?? 0
  check('concepto agotado: M = 0 y N no es negativo (sin -0.00)', [M13, N13 >= 0], [0, true])
}

// ============ B) Lector ============
// 1. válido
{
  const { r } = await leer(ws => {
    ws.getCell('I11').value = 12.3456; ws.getCell('I12').value = 47.0333 // saldo exacto
    ws.getCell('I13').value = 0; ws.getCell('I14').value = 0.1667
    ws.getCell('I16').value = 20.5; ws.getCell('I18').value = 4.25 // P.U. 0
  })
  check('válido: sin errores ni avisos', [r.errores, r.avisos, r.vacio], [[], [], false])
  check('válido: líneas (0 y vacías se ignoran)', claves(r), ['1.1', '1.2', '1.4', '2.1', '2.3'])
  check('válido: cantidades exactas', r.lineas.map(l => l.cantidad_periodo), [12.3456, 47.0333, 0.1667, 20.5, 4.25])
  check('válido: acumulado anterior de la base', r.lineas.map(l => l.cantidad_acumulada_anterior), [40.25, 20.1667, 0, 150.125, 5])
  check('válido: forma de línea (igual que el lector viejo)', Object.keys(r.lineas[0]), ['clave', 'descripcion', 'unidad', 'concepto_id', 'cantidad_contratada', 'cantidad_acumulada_anterior', 'cantidad_periodo', 'pu_contratado', 'pu_cobrado', 'encontrado'])
  const l23 = r.lineas.find(l => l.clave === '2.3')
  check('concepto con P.U. 0: se puede estimar, pu 0', [l23.cantidad_periodo, l23.pu_contratado, l23.pu_cobrado, l23.concepto_id], [4.25, 0, 0, 'c23'])
}
// 2. sobre saldo (bloquea y lista clave, cantidad capturada y saldo)
{
  const { r } = await leer(ws => { ws.getCell('I11').value = 80.2501; ws.getCell('I16').value = 150.376; ws.getCell('I14').value = 0.5 })
  check('sobre saldo: excedidos', r.excedidos, [{ clave: '1.1', cantidad: 80.2501, saldo: 80.25 }, { clave: '2.1', cantidad: 150.376, saldo: 150.375 }])
  check('sobre saldo: 2 errores (bloquea)', r.errores.length, 2)
  contiene('sobre saldo: el mensaje trae la clave, la cantidad y el saldo', r.errores, '1.1 — Excavación a mano: cantidad 80.2501 supera el saldo disponible (80.25 m3)')
}
// 3. negativo
{
  const { r } = await leer(ws => { ws.getCell('I11').value = -1 })
  check('negativo: error con la fila', r.errores.length, 1)
  contiene('negativo: mensaje', r.errores, 'Fila 11 (1.1): la cantidad no puede ser negativa (-1)')
  check('negativo: sin líneas válidas', r.lineas, [])
}
// 4. texto
{
  const { r } = await leer(ws => { ws.getCell('I11').value = 'abc' })
  contiene('texto: error con la fila', r.errores, 'Fila 11 (1.1): "abc" no es un número válido')
}
// 5. coma decimal
{
  const { r } = await leer(ws => { ws.getCell('I11').value = '12,5' })
  contiene('coma decimal: error con la fila (no se redondea en silencio)', r.errores, 'Fila 11 (1.1): "12,5" no es un número válido')
  check('coma decimal: no genera línea', r.lineas, [])
}
// 6. id repetido
{
  const { r } = await leer(ws => { ws.getCell('O12').value = 'c11'; ws.getCell('I11').value = 1; ws.getCell('I12').value = 1 })
  contiene('id repetido: error', r.errores, 'Fila 12 (1.2): el concepto ya aparece en la fila 11')
}
// 7. concepto agotado
{
  const { r } = await leer(ws => { ws.getCell('I13').value = 1 })
  check('agotado: excedido con saldo 0', r.excedidos, [{ clave: '1.3', cantidad: 1, saldo: 0 }])
  const v = await leer(ws => { ws.getCell('I13').value = 0; ws.getCell('I11').value = 1 })
  check('agotado con 0: se ignora', [claves(v.r), v.r.errores], [['1.1'], []])
}
// 8. plantilla de otro contrato
{
  const { r } = await leer(() => {}, { ...CTX, contratoId: 'ct-OTRO' })
  check('otro contrato: error y no continúa', [r.errores.length, r.lineas], [1, []])
  contiene('otro contrato: mensaje', r.errores, 'Esta plantilla es de otro contrato')
}
// 9. id inexistente con clave válida / sin clave válida
{
  const { r } = await leer(ws => { ws.getCell('O11').value = 'no-existe'; ws.getCell('I11').value = 5 })
  check('id inexistente con clave válida: resuelve por clave', [claves(r), r.errores], [['1.1'], []])
  const x = await leer(ws => { ws.getCell('O12').value = 'no-existe'; ws.getCell('A12').value = 'ZZZ'; ws.getCell('I12').value = 5 })
  contiene('id y clave inexistentes: error con la fila', x.r.errores, 'Fila 12 (ZZZ): no se encontró el concepto (id "no-existe")')
}
// 10. acumulado cambiado entre la descarga y la carga
{
  const nuevoAcum = { ...acumulado, c11: { cantidad: 50.25, importe: 0 }, c21: { cantidad: 100, importe: 0 } }
  const { r } = await leer(ws => { ws.getCell('I11').value = 10; ws.getCell('I12').value = 1 }, { ...CTX, acumulado: nuevoAcum })
  check('acumulado cambiado: aviso con el conteo, sin bloquear', [r.errores, r.lineas.length], [[], 2])
  contiene('acumulado cambiado: mensaje', r.avisos, 'El acumulado cambió en 2 conceptos desde la descarga (1.1, 2.1)')
  check('acumulado cambiado: usa el acumulado actual de la base', r.lineas[0].cantidad_acumulada_anterior, 50.25)
  const v = await leer(ws => { ws.getCell('I11').value = 75 }, { ...CTX, acumulado: nuevoAcum }) // saldo real 70.25
  // Todos los conceptos con acumulado distinto: el aviso da el conteo y las claves (hasta 8)
  const todos = Object.fromEntries(Object.entries(acumulado).map(([k, a]) => [k, { ...a, cantidad: a.cantidad + 0.5 }]))
  const t = await leer(ws => { ws.getCell('I14').value = 0.1 }, { ...CTX, acumulado: { ...todos, c14: { cantidad: 0.5, importe: 0 } } })
  contiene('acumulado cambiado en todos: conteo y claves', t.r.avisos, 'El acumulado cambió en 8 conceptos desde la descarga (1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4)')
  check('acumulado cambiado y se viola el saldo: bloquea', [v.r.errores.length, v.r.excedidos], [1, [{ clave: '1.1', cantidad: 75, saldo: 70.25 }]])
}
// 11. archivo vacío
{
  const { r } = await leer(() => {})
  check('archivo vacío: vacio=true, sin líneas, con aviso', [r.vacio, r.lineas, r.errores], [true, [], []])
  contiene('archivo vacío: mensaje', r.avisos, 'El archivo no trae ninguna cantidad')
}
// 12. columna I cambiada o ausente / versión / sin _meta / otro período
{
  const { r } = await leer(ws => { ws.getCell('I8').value = 'Otra cosa' })
  contiene('columna I cambiada: error claro', r.errores, 'No se encontró la columna "Esta Estimación – Cantidad" (I)')
  const v = await leer((ws, wb) => { wb.getWorksheet('_meta').getCell('B1').value = 99 })
  contiene('versión desconocida: error', v.r.errores, 'Versión de plantilla no reconocida (99)')
  const p = await leer(ws => { ws.getCell('I11').value = 1 }, { ...CTX, periodoId: 'pe-OTRO' })
  check('otro período: error y no continúa', [p.r.errores.length, p.r.lineas, p.r.vacio], [1, [], false])
  contiene('otro período: mensaje claro', p.r.errores, 'Esta plantilla se descargó para otro período de este contrato. Descarga la plantilla desde el período')
  const plana = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(plana, XLSX.utils.aoa_to_sheet([['Tipo', 'Clave', 'Vol. Este Periodo'], ['CO', '1.1', 5]]), 'Estimación')
  check('plantilla anterior (sin _meta): no se detecta como nueva', esPlantillaNueva(plana), false)
  check('plantilla nueva: se detecta', esPlantillaNueva(XLSX.read(bufBase, { type: 'buffer' })), true)
}

// ============ C) Regla de saldo: mismos estados que la carga/descarga anteriores ============
{
  check('estados que cuentan para el acumulado (igual que NuevaEstimacion.jsx:101 y :213 y el portal)', ESTADOS_CUENTAN_ACUMULADO, ['en_revision', 'autorizada', 'correo_enviado', 'con_factura', 'pagada'])
  const consultas = []
  const falso = {
    from: tabla => {
      const q = { tabla, filtros: [] }
      const api = {
        select: () => api,
        eq: (k, v) => { q.filtros.push(['eq', k, v]); return api },
        in: (k, v) => { q.filtros.push(['in', k, v]); consultas.push(q); return Promise.resolve(tabla === 'estimaciones'
          ? { data: [{ id: 'e1' }, { id: 'e2' }], error: null }
          : { data: [{ concepto_id: 'c11', cantidad_periodo: 1.5, importe_periodo: 100 }, { concepto_id: 'c11', cantidad_periodo: 2, importe_periodo: 50.5 }, { concepto_id: null, cantidad_periodo: 9, importe_periodo: 9 }, { concepto_id: 'c12', cantidad_periodo: 3, importe_periodo: 7 }], error: null }) },
      }
      return api
    },
  }
  const acum = await cargarAcumuladoConceptos(falso, 'ct-1')
  check('acumulado: suma por concepto e ignora líneas sin concepto', acum, { c11: { cantidad: 3.5, importe: 150.5 }, c12: { cantidad: 3, importe: 7 } })
  check('acumulado: filtra por contrato y por los estados que cuentan', consultas[0].filtros, [['eq', 'contrato_id', 'ct-1'], ['in', 'estado', ESTADOS_CUENTAN_ACUMULADO]])
  check('acumulado: líneas de las estimaciones encontradas', consultas[1].filtros, [['in', 'estimacion_id', ['e1', 'e2']]])
}

// ============ D) Compensación obligatoria por convenio (paso d) y valor neto negativo (paso e) ============
// Concepto 1.1 rebajado a 0 con 75 estimadas y 1.2 rebajado a 40 con 100 estimadas: la siguiente estimación debe
// registrar -75 y -60. 1.3 y 1.4 son conceptos normales.
const cd = (id, clave, descripcion, vigente, pu, orden) => ({ id, clave, descripcion, unidad: 'm3', tipo: 'CO', jerarquia: clave, orden, cantidad_contratada: vigente, precio_unitario: pu })
const conceptosD = [
  { id: 'gD', clave: '1', descripcion: 'GRUPO', tipo: 'AG', jerarquia: '1', orden: 1 },
  cd('k1', '1.1', 'Rebajado a 0 (estimado 75)', 0, 100, 2),
  cd('k2', '1.2', 'Rebajado a 40 (estimado 100)', 40, 10, 3),
  cd('k3', '1.3', 'Normal', 200, 20, 4),
  cd('k4', '1.4', 'Normal para completar el valor', 200, 100, 5),
]
const acumuladoD = { k1: { cantidad: 75, importe: 7500 }, k2: { cantidad: 100, importe: 1000 }, k3: { cantidad: 50, importe: 1000 }, k4: { cantidad: 0, importe: 0 } }
const CTX_D = { contratoId: 'ct-1', periodoId: 'pe-1', conceptos: conceptosD, acumulado: acumuladoD }
const wbD = await construirLibroPlantilla({ conceptos: conceptosD, acumulado: acumuladoD, contrato: CONTRATO, periodo: PERIODO, numeroEstimacion: 8 })
const bufD = Buffer.from(await wbD.xlsx.writeBuffer())
async function leerD(modificar, ctx = CTX_D) {
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bufD)
  modificar(wb.getWorksheet('Estimación'))
  const buf = Buffer.from(await wb.xlsx.writeBuffer())
  return leerPlantillaCarga(XLSX.read(buf, { type: 'buffer' }), ctx)
}
const res = v => v.result ?? 0 // exceljs descarta al releer un resultado igual a 0
const textoNota = n => (typeof n === 'string' ? n : (n?.texts || []).map(t => t.text).join(''))
const cantidades = r => r.lineas.map(l => l.cantidad_periodo)

// 13. calcularCompensacionPendiente
{
  const m = calcularCompensacionPendiente({ conceptos: conceptosD, acumulado: acumuladoD })
  check('13. compensaciones pendientes: 1.1 (75) y 1.2 (60), sin los conceptos normales ni los grupos', [...m.values()], [
    { concepto_id: 'k1', clave: '1.1', cantidad_pendiente: 75 }, { concepto_id: 'k2', clave: '1.2', cantidad_pendiente: 60 }])
  const numerico = calcularCompensacionPendiente({ conceptos: conceptosD, acumulado: { k1: 75, k2: 100, k3: 50, k4: 0 } })
  check('13. acepta el acumulado en forma numérica (mapa de cantidades de la plantilla anterior)', [...numerico.keys()], ['k1', 'k2'])
  const borde = calcularCompensacionPendiente({ conceptos: [cd('a', '1', 'x', 0.3, 1, 1), cd('b', '2', 'y', 10, 1, 2)], acumulado: { a: 0.1 + 0.2, b: 10 + 1e-12 } })
  check('13. el ruido de punto flotante y exceso dentro de 1e-9 no cuentan', borde.size, 0)
  check('13. sin estimaciones no hay compensación', calcularCompensacionPendiente({ conceptos: conceptosD, acumulado: {} }).size, 0)
}

// 14. La plantilla precarga la compensación, bloqueada, en rojo y con nota
{
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(bufD)
  const ws = wb.getWorksheet('Estimación')
  check('14. 1.1 precarga -75 y 1.2 precarga -60', [ws.getCell('I11').value, ws.getCell('I12').value], [-75, -60])
  // (bloqueada es el valor por defecto de Excel: el archivo no lo escribe, solo marca las desbloqueadas)
  check('14. las celdas de compensación están bloqueadas', [ws.getCell('I11').protection?.locked !== false, ws.getCell('I12').protection?.locked !== false], [true, true])
  check('14. fondo rojo claro', [ws.getCell('I11').fill.fgColor.argb, ws.getCell('I12').fill.fgColor.argb], ['FFFFC7CE', 'FFFFC7CE'])
  check('14. nota "Compensación obligatoria por convenio"', textoNota(ws.getCell('I11').note), 'Compensación obligatoria por convenio')
  check('14. sin validación de datos en la celda de compensación', ws.getCell('I11').dataValidation ?? null, null)
  check('14. los conceptos normales siguen igual: vacía, desbloqueada, amarilla y con validación', [ws.getCell('I13').value ?? null, ws.getCell('I13').protection?.locked, ws.getCell('I13').fill.fgColor.argb, !!ws.getCell('I13').dataValidation], [null, false, 'FFFFF2CC', true])
  const desbloqueadas = []
  ws.eachRow(row => row.eachCell({ includeEmpty: true }, cell => { if (cell.protection?.locked === false) desbloqueadas.push(cell.address) }))
  check('14. solo I13 e I14 quedan editables', desbloqueadas.sort(), ['I13', 'I14'])
  check('14. fórmulas con la compensación: K = 0 y M = 0 en 1.1; J = -7,500', [res(ws.getCell('K11').value), res(ws.getCell('M11').value), ws.getCell('J11').value.result], [0, 0, -7500])
  check('14. TOTAL de Esta Estimación = -8,100', ws.getCell('J15').value.result, -8100)
  check('14. la instrucción de la hoja menciona las celdas rojas', String(ws.getCell('A6').value).includes('compensaciones obligatorias'), true)
  const wbA = new ExcelJS.Workbook()
  await wbA.xlsx.load(bufBase)
  check('14. sin compensaciones la instrucción no las menciona (plantilla de la sección A)', String(wbA.getWorksheet('Estimación').getCell('A6').value).includes('compensaciones'), false)
}

// 15. Hoja con el valor exacto + trabajo en conceptos normales (mezcla): sin aviso, valor positivo
{
  const r = await leerD(ws => { ws.getCell('I13').value = 10; ws.getCell('I14').value = 120 })
  check('15. sin errores ni avisos', [r.errores, r.avisos], [[], []])
  check('15. líneas: dos compensaciones y dos normales, en el orden de la hoja', [r.lineas.map(l => l.clave), cantidades(r)], [['1.1', '1.2', '1.3', '1.4'], [-75, -60, 10, 120]])
  check('15. valor neto = -7,500 - 600 + 200 + 12,000 = 4,100 (positivo, normal)', r.valorNeto, 4100)
}

// 16. Hoja con la compensación alterada: aviso y se aplica igual el valor exacto
{
  const variantes = [
    ['de más (-80)', ws => { ws.getCell('I11').value = -80 }, 'traía -80'],
    ['de menos (-50)', ws => { ws.getCell('I11').value = -50 }, 'traía -50'],
    ['vacía', ws => { ws.getCell('I11').value = null }, 'traía vacío'],
    ['en cero', ws => { ws.getCell('I11').value = 0 }, 'traía 0'],
    ['positiva (+5)', ws => { ws.getCell('I11').value = 5 }, 'traía 5'],
    ['con texto', ws => { ws.getCell('I11').value = 'abc' }, 'traía "abc"'],
  ]
  for (const [nombre, modificar, fragmento] of variantes) {
    const r = await leerD(ws => { modificar(ws); ws.getCell('I14').value = 120 })
    check(`16. compensación ${nombre}: sin errores, un aviso y se aplica -75`, [r.errores, r.avisos.length, r.lineas.find(l => l.clave === '1.1').cantidad_periodo], [[], 1, -75])
    check(`16. compensación ${nombre}: el aviso dice lo que traía y el valor exacto`, r.avisos[0].includes('1.1') && r.avisos[0].includes(fragmento) && r.avisos[0].includes('valor exacto -75'), true)
  }
}

// 17. Regresión: un concepto SIN compensación pendiente sigue con la regla de siempre
{
  const neg = await leerD(ws => { ws.getCell('I13').value = -5; ws.getCell('I14').value = 120 })
  check('17. concepto normal con negativo: sigue rechazando', neg.errores.some(e => e.includes('Fila 13 (1.3): la cantidad no puede ser negativa (-5)')), true)
  const pasa = await leerD(ws => { ws.getCell('I13').value = 151; ws.getCell('I14').value = 120 }) // saldo 150
  check('17. concepto normal sobre el saldo: sigue rechazando', pasa.excedidos, [{ clave: '1.3', cantidad: 151, saldo: 150 }])
}

// 18. Valor neto negativo: bloquea con el faltante exacto (redondeado hacia arriba al centavo)
{
  const r = await leerD(() => {})
  check('18. solo compensaciones: valor -8,100 -> un error que bloquea', [r.errores.length, r.valorNeto], [1, -8100])
  check('18. el mensaje pide agregar trabajo por al menos $8,100.00', r.errores[0].includes('agrega trabajo del periodo por al menos $8,100.00'), true)
  const conPU = conceptosD.map(c => (c.id === 'k1' ? { ...c, precio_unitario: 100.123 } : c)) // -7,509.225 - 600 = -8,109.225
  const r2 = await leerD(() => {}, { ...CTX_D, conceptos: conPU })
  check('18. el faltante se redondea hacia arriba al centavo ($8,109.23)', r2.errores[0].includes('por al menos $8,109.23'), true)
  const poco = await leerD(ws => { ws.getCell('I14').value = 50 }) // 5,000 -> -3,100
  check('18. con algo de trabajo pero insuficiente: faltan $3,100.00', poco.errores[0].includes('por al menos $3,100.00'), true)
}

// 19. Valor neto exactamente 0: no bloquea; amortización y fondo salen en 0 solos
{
  const r = await leerD(ws => { ws.getCell('I14').value = 81 }) // 8,100 - 7,500 - 600 = 0
  check('19. valor 0: sin errores y no es "archivo vacío"', [r.errores, r.vacio, Math.abs(r.valorNeto) <= 1e-9], [[], false, true])
  const contrato = { pct_anticipo: 30, pct_fondo_garantia: 5, monto_vigente: 100000 }
  const antPct = calcAmortizacion({ valorEstimacion: 0, contrato, anticipos: [{ monto: 30000, estado: 'autorizado' }], amortizadoPrevio: 0, yaEstimado: 0 })
  const antProp = calcAmortizacion({ valorEstimacion: 0, contrato, anticipos: [{ monto: 30000, estado: 'autorizado', convenio_id: 'x' }], amortizadoPrevio: 0, yaEstimado: 0 })
  check('19. amortización 0 en los dos modos y fondo de garantía 0 (sin código nuevo)', [antPct.amortizacion, antProp.amortizacion, 0 * (contrato.pct_fondo_garantia / 100)], [0, 0, 0])
}

// 20. Compensación cuyo concepto no venía en la hoja: también es obligatoria
{
  const r = await leerD(ws => { ws.getCell('O11').value = null; ws.getCell('A11').value = null; ws.getCell('I11').value = null; ws.getCell('I14').value = 120 })
  check('20. se aplica -75 aunque la fila no esté, con aviso', [r.errores, r.lineas.map(l => l.clave).sort(), r.lineas.find(l => l.clave === '1.1').cantidad_periodo], [[], ['1.1', '1.2', '1.4'], -75])
  check('20. el aviso dice que la hoja no incluía el concepto', r.avisos.some(a => a.includes('1.1') && a.includes('la hoja no incluía este concepto')), true)
}

// 21. Un concepto con compensación repetido en dos filas: error
{
  const r = await leerD(ws => { ws.getCell('O13').value = 'k1'; ws.getCell('I13').value = 5; ws.getCell('I14').value = 120 })
  check('21. la fila repetida de un concepto con compensación da error', r.errores.some(e => e.includes('Fila 13') && e.includes('ya aparece en la fila 11')), true)
}

// 22. Se usa el acumulado FRESCO al leer, no el de cuando se generó la plantilla
{
  const fresco = { ...acumuladoD, k1: { cantidad: 90, importe: 9000 } } // ahora hay 90 estimadas: el exceso es 90
  const r = await leerD(ws => { ws.getCell('I14').value = 150 }, { ...CTX_D, acumulado: fresco })
  check('22. aplica el valor recalculado (-90) y avisa que la hoja traía -75', [r.lineas.find(l => l.clave === '1.1').cantidad_periodo, r.avisos.some(a => a.includes('1.1') && a.includes('traía -75') && a.includes('valor exacto -90'))], [-90, true])
  const ya = { ...acumuladoD, k2: { cantidad: 40, importe: 400 } } // 1.2 ya no tiene exceso (estimado 40 = vigente 40)
  const r2 = await leerD(ws => { ws.getCell('I14').value = 120 }, { ...CTX_D, acumulado: ya })
  check('22. si la compensación ya no está pendiente, el negativo de la hoja se rechaza como siempre', r2.errores.some(e => e.includes('Fila 12 (1.2): la cantidad no puede ser negativa (-60)')), true)
}

// ============ E) Guardia común antes de guardar (cierra la estimación sin líneas y la plantilla anterior) ============
const ln = (concepto_id, cantidad_periodo, pu_cobrado) => ({ concepto_id, cantidad_periodo, pu_cobrado })
const guardia = lineas => validarCompensaciones({ conceptos: conceptosD, acumulado: acumuladoD, lineas })

// 23. Compensaciones exactas + trabajo: pasa
{
  const g = guardia([ln('k1', -75, 100), ln('k2', -60, 10), ln('k3', 10, 20), ln('k4', 120, 100)])
  check('23. compensaciones exactas con trabajo: pasa, valor 4,100', [g.ok, g.errores, g.valorNeto], [true, [], 4100])
}
// 24. Estimación sin líneas con compensaciones pendientes: no pasa (cierra el hueco de "Continuar" sin archivo)
{
  const g = guardia([])
  check('24. sin líneas y con compensaciones pendientes: no pasa y nombra las dos', [g.ok, g.errores.length, g.errores[0].includes('1.1') && g.errores[0].includes('trae 0'), g.errores[1].includes('1.2')], [false, 2, true, true])
}
// 25. Trabajo sin la compensación (lo que permitía la plantilla anterior): no pasa
{
  const g = guardia([ln('k3', 10, 20), ln('k4', 120, 100)])
  check('25. trabajo sin compensar: no pasa', [g.ok, g.errores.length, g.errores.every(e => e.includes('debe incluir la compensación obligatoria'))], [false, 2, true])
}
// 26. Compensación parcial o de más: no pasa
{
  const parcial = guardia([ln('k1', -50, 100), ln('k2', -60, 10), ln('k4', 120, 100)])
  check('26. compensación parcial (-50 en vez de -75): no pasa y dice lo que trae', [parcial.ok, parcial.errores.length, parcial.errores[0].includes('de -75 y trae -50')], [false, 1, true])
  const demas = guardia([ln('k1', -80, 100), ln('k2', -60, 10), ln('k4', 120, 100)])
  check('26. compensación de más (-80): no pasa', [demas.ok, demas.errores[0].includes('trae -80')], [false, true])
}
// 27. Compensaciones exactas pero valor negativo: solo falla el valor, con el faltante
{
  const g = guardia([ln('k1', -75, 100), ln('k2', -60, 10)])
  check('27. valor negativo: un solo error, pide agregar trabajo por al menos $8,100.00', [g.ok, g.errores.length, g.errores[0].includes('por al menos $8,100.00')], [false, 1, true])
}
// 28. Valor exactamente 0: pasa
{
  const g = guardia([ln('k1', -75, 100), ln('k2', -60, 10), ln('k4', 81, 100)])
  check('28. valor exactamente 0: pasa', [g.ok, Math.abs(g.valorNeto) <= 1e-9], [true, true])
}
// 29. Sin compensaciones pendientes el guardia no cambia nada (incluida la estimación sin líneas, como hoy)
{
  const sin = { conceptos: conceptosD, acumulado: {} }
  check('29. sin compensaciones pendientes: estimación sin líneas pasa, como hoy', validarCompensaciones({ ...sin, lineas: [] }).ok, true)
  check('29. sin compensaciones pendientes: líneas normales pasan', validarCompensaciones({ ...sin, lineas: [ln('k3', 10, 20), ln('k4', 5, 100)] }).ok, true)
}
// 30. Dos líneas del mismo concepto que suman la compensación exacta: pasa
{
  check('30. -50 y -25 suman la compensación de -75', guardia([ln('k1', -50, 100), ln('k1', -25, 100), ln('k2', -60, 10), ln('k4', 120, 100)]).ok, true)
}
// 31. Carrera: el acumulado cambió después de armar las líneas
{
  const g = validarCompensaciones({ conceptos: conceptosD, acumulado: { ...acumuladoD, k1: { cantidad: 90, importe: 9000 } }, lineas: [ln('k1', -75, 100), ln('k2', -60, 10), ln('k4', 150, 100)] })
  check('31. el acumulado fresco pide -90 y las líneas traen -75: no pasa', [g.ok, g.errores[0].includes('de -90 y trae -75')], [false, true])
}
// 32. Lo que produce el lector con la hoja exacta pasa el guardia (los dos son coherentes)
{
  const r = await leerD(ws => { ws.getCell('I13').value = 10; ws.getCell('I14').value = 120 })
  check('32. las líneas del lector pasan el guardia', guardia(r.lineas).ok, true)
}

console.log(`${total} casos, ${fallas} fallas`)
process.exit(fallas ? 1 : 0)
