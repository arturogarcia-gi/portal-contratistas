// node scripts/prueba-plantilla-carga.mjs
import ExcelJS from 'exceljs'
import * as XLSX from 'xlsx'
import JSZip from 'jszip' // dependencia de exceljs; se usa para revisar el XML tal como lo escribe
import {
  construirLibroPlantilla, leerPlantillaCarga, esPlantillaNueva, cargarAcumuladoConceptos,
  ESTADOS_CUENTAN_ACUMULADO, VERSION_PLANTILLA,
} from '../src/lib/plantillaCarga.js'

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

console.log(`${total} casos, ${fallas} fallas`)
process.exit(fallas ? 1 : 0)
