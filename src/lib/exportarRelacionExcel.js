import { nombreArchivo } from './nombresArchivo.js' // con extensión para poder importarlo desde Node

const OSCURO = 'FF1F2937'
const GRIS_GRUPO = 'FFE5E7EB'
const GRIS_ETIQUETA = 'FF6B7280'
const BORDE = { style: 'thin', color: { argb: 'FF9CA3AF' } }
const BORDE_SUAVE = { style: 'thin', color: { argb: 'FFE5E7EB' } }
const FMT_CANT = '#,##0.00'
const FMT_MXN = '"$"#,##0.00'
const FMT_SALDO_CANT = '#,##0.00;[Red]-#,##0.00'
const FMT_SALDO_MXN = '"$"#,##0.00;[Red]-"$"#,##0.00'
const FMT_FECHA = 'dd/mm/yyyy'
const LAST_COL = 14 // N
const FILA_HDR = 8  // encabezado de tabla en filas 8-9; datos desde la 10
const AZUL_DATO = 'FF1D4ED8'
const NEGRO = 'FF000000'
const TOL_J = 0.01 // J es fórmula solo si coincide con el importe guardado dentro de 1 centavo

const ANCHOS = [14, 55, 9, 15, 12, 16, 12, 16, 12, 16, 12, 16, 12, 16]

// Reparte las 14 columnas en n bloques de firma. Entre bloques vecinos se sacrifica una columna
// existente (queda vacía solo en las filas de firma), para que las líneas no se toquen.
// Elige los cortes que dejan los bloques con el ancho (en caracteres) más parejo.
// Con 8 o más firmantes no caben los separadores (se necesitan 2n-1 columnas): los bloques quedan contiguos.
// Regresa [[desde, hasta], ...] (n rangos, 1-based).
export function repartirColumnas(n) {
  if (n <= 1) return [[1, LAST_COL]]
  const sep = 2 * n - 1 <= LAST_COL ? 1 : 0
  let mejor = null
  const ancho = (a, b) => ANCHOS.slice(a - 1, b).reduce((s, w) => s + w, 0)

  // elegidos: primera columna posterior a cada bloque (separador si sep = 1, o inicio del siguiente bloque si sep = 0)
  function probar(desde, elegidos) {
    if (elegidos.length === n - 1) {
      const bloques = []
      let ini = 1
      elegidos.forEach(c => { bloques.push([ini, c - 1]); ini = c + sep })
      bloques.push([ini, LAST_COL])
      if (ini > LAST_COL) return
      const anchos = bloques.map(([a, b]) => ancho(a, b))
      const media = anchos.reduce((s, w) => s + w, 0) / anchos.length
      const costo = anchos.reduce((s, w) => s + (w - media) ** 2, 0)
      if (!mejor || costo < mejor.costo) mejor = { costo, bloques }
      return
    }
    for (let c = desde; c <= LAST_COL; c++) probar(c + 1 + sep, [...elegidos, c])
  }
  probar(2, [])
  return mejor.bloques
}

const aFecha = s => {
  if (!s) return null
  const [y, m, d] = String(s).slice(0, 10).split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

const esConcepto = f => f.tipo === 'CO' || !f.tipo

// ROUND(x, dec) de Excel: mitad hacia afuera de cero, sobre 15 cifras significativas
export function redondeoExcel(n, dec = 2) {
  const k = 10 ** dec
  const r = Math.sign(n) * Math.round(Number((Math.abs(n) * k).toPrecision(15))) / k
  return r === 0 ? 0 : r // evita -0
}

const mxn = n => (n == null ? '—' : '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 4 }))

// Lista de rangos contiguos de filas de hoja de una columna: "F12:F13,F15,F17:F20"
function listaRangos(columna, rows) {
  const out = []
  let ini = null
  let prev = null
  rows.forEach(r => {
    if (ini === null) ini = r
    else if (r !== prev + 1) { out.push([ini, prev]); ini = r }
    prev = r
  })
  if (ini !== null) out.push([ini, prev])
  return out.map(([a, b]) => (a === b ? `${columna}${a}` : `${columna}${a}:${columna}${b}`)).join(',')
}

// Genera el libro; separado de la descarga para poder probarlo en Node
export async function construirLibroRelacion({ estimacion, contrato, contratista, spv, periodo, oc, filas, firmas = [] }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Relación', {
    views: [{ state: 'frozen', ySplit: FILA_HDR + 1 }],
    pageSetup: {
      orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      printTitlesRow: `${FILA_HDR}:${FILA_HDR + 1}`,
    },
  })

  ws.columns = ANCHOS.map(width => ({ width }))

  // Títulos
  ws.mergeCells(1, 1, 1, LAST_COL)
  ws.getCell('A1').value = spv.nombre
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.mergeCells(2, 1, 2, LAST_COL)
  ws.getCell('A2').value = 'Relación de Estimación'
  ws.getCell('A2').font = { bold: true, size: 12 }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  // Encabezado: pares etiqueta / valor
  const etiqueta = (celda, texto, hasta) => {
    if (hasta) ws.mergeCells(`${celda}:${hasta}`)
    const c = ws.getCell(celda)
    c.value = texto
    c.font = { color: { argb: GRIS_ETIQUETA }, size: 9 }
  }
  const valor = (celda, v, { hasta, fmt } = {}) => {
    if (hasta) ws.mergeCells(`${celda}:${hasta}`)
    const c = ws.getCell(celda)
    c.value = v
    c.font = { bold: true }
    c.alignment = { horizontal: 'left' }
    if (fmt) c.numFmt = fmt
  }
  etiqueta('A4', 'Contrato');       valor('B4', contrato?.numero)
  etiqueta('A5', 'Propietario');    valor('B5', spv.propietario)
  etiqueta('A6', 'Contratista');    valor('B6', contratista)
  etiqueta('D4', 'Proyecto', 'E4'); valor('F4', spv.proyecto, { hasta: 'I4' })
  etiqueta('D5', 'Período de ejecución', 'E5')
  valor('F5', aFecha(periodo.inicio), { fmt: FMT_FECHA })
  ws.getCell('G5').value = 'al'
  ws.getCell('G5').alignment = { horizontal: 'center' }
  valor('H5', aFecha(periodo.fin), { fmt: FMT_FECHA })
  etiqueta('K4', 'No. Estimación', 'L4'); valor('M4', estimacion.numero_estimacion)
  etiqueta('K5', 'OC vigente', 'L5');     valor('M5', oc, { hasta: 'N5' })

  // Encabezado de tabla, dos niveles
  // texto solo en la celda maestra; las esclavas de un rango combinado reciben solo estilo
  // (escribirles null borra el texto de la maestra)
  const hdr = (celda, texto) => {
    const c = ws.getCell(celda)
    if (texto !== undefined) c.value = texto
    c.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OSCURO } }
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
    c.border = { top: BORDE, left: BORDE, bottom: BORDE, right: BORDE }
  }
  ;['Item', 'Descripción', 'Unidad', 'P.U.'].forEach((t, i) => {
    const col = String.fromCharCode(65 + i)
    hdr(`${col}${FILA_HDR}`, t)
    hdr(`${col}${FILA_HDR + 1}`)
    ws.mergeCells(`${col}${FILA_HDR}:${col}${FILA_HDR + 1}`)
  })
  ;['Contrato Actual', 'Acumulado Anterior', 'Esta Estimación', 'Nuevo Acumulado', 'Saldo'].forEach((t, i) => {
    const c1 = String.fromCharCode(69 + i * 2)
    const c2 = String.fromCharCode(70 + i * 2)
    hdr(`${c1}${FILA_HDR}`, t)
    hdr(`${c2}${FILA_HDR}`)
    hdr(`${c1}${FILA_HDR + 1}`, 'Cantidad')
    hdr(`${c2}${FILA_HDR + 1}`, 'Importe')
    ws.mergeCells(`${c1}${FILA_HDR}:${c2}${FILA_HDR}`)
  })

  // Filas de grupo y de concepto
  const primera = FILA_HDR + 2
  const fmts = [null, null, null, FMT_MXN, FMT_CANT, FMT_MXN, FMT_CANT, FMT_MXN,
    FMT_CANT, FMT_MXN, FMT_CANT, FMT_MXN, FMT_SALDO_CANT, FMT_SALDO_MXN]
  const COL_DATO = [9] // solo I (cantidad de esta estimación) en azul; el resto de la fila de concepto, en negro

  // Resultado de cada fórmula de concepto, igual al que daría Excel
  const calc = filas.map(f => {
    if (f.tipo === 'AG') return null
    const K = f.acumCant + f.estaCant
    const F = redondeoExcel(f.contratoCant * f.pu)
    const jFormula = redondeoExcel(f.estaCant * f.pu)
    const jValor = Math.abs(f.estaImp - jFormula) > TOL_J + 1e-9 // P.U. cobrado distinto: J = importe guardado
    const J = jValor ? f.estaImp : jFormula
    const L = f.acumImp + J
    return { K, F, J, jValor, L, M: redondeoExcel(f.contratoCant - K, 6), N: F - L }
  })
  const resultado = (j, c) => (c === 'H' ? filas[j].acumImp : calc[j][c])
  const sumaRes = (idxs, c) => idxs.reduce((acc, j) => acc + resultado(j, c), 0)

  const notasJ = []
  filas.forEach((f, i) => {
    const r = ws.getRow(primera + i)
    const n = primera + i
    let vals
    if (f.tipo === 'AG') {
      // Importes de grupo: SUM de los conceptos CO que cuelgan de él (mismo criterio que sumarHijosAG)
      const hijos = []
      filas.forEach((h, j) => {
        if (h.tipo === 'CO' && f.jerarquia && h.jerarquia && h.jerarquia.startsWith(f.jerarquia + '.')) hijos.push(j)
      })
      const suma = c => (hijos.length
        ? { formula: `SUM(${listaRangos(c, hijos.map(j => primera + j))})`, result: sumaRes(hijos, c) }
        : 0)
      vals = [f.clave, f.descripcion, null, null, null, suma('F'), null, suma('H'),
        null, suma('J'), null, suma('L'), null, suma('N')]
    } else {
      const c = calc[i]
      vals = [f.clave, f.descripcion, f.unidad, f.pu, f.contratoCant,
        { formula: `ROUND(E${n}*D${n},2)`, result: c.F },
        f.acumCant, f.acumImp, f.estaCant,
        c.jValor ? f.estaImp : { formula: `ROUND(I${n}*D${n},2)`, result: c.J },
        { formula: `G${n}+I${n}`, result: c.K },
        { formula: `H${n}+J${n}`, result: c.L },
        { formula: `ROUND(E${n}-K${n},6)`, result: c.M },
        { formula: `F${n}-L${n}`, result: c.N }]
      if (c.jValor) {
        const pc = f.puCobrado ?? (f.estaCant ? f.estaImp / f.estaCant : null)
        notasJ.push(`${f.clave}: P.U. cobrado ${mxn(pc)} (contratado ${mxn(f.pu)}); importe de esta estimación ${mxn(f.estaImp)}`)
      }
    }
    for (let col = 1; col <= LAST_COL; col++) {
      const cell = r.getCell(col)
      cell.value = vals[col - 1] ?? null
      if (fmts[col - 1]) cell.numFmt = fmts[col - 1]
      cell.border = { top: BORDE_SUAVE, left: BORDE_SUAVE, bottom: BORDE_SUAVE, right: BORDE_SUAVE }
      cell.alignment = {
        vertical: 'top',
        ...(col === 2 ? { wrapText: true } : {}),
        ...(col >= 4 ? { horizontal: 'right' } : {}),
      }
      if (f.tipo === 'AG') {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_GRUPO } }
      } else {
        const esDato = COL_DATO.includes(col)
        cell.font = { color: { argb: esDato ? AZUL_DATO : NEGRO } }
      }
    }
    r.getCell(1).alignment = { vertical: 'top', horizontal: 'left', indent: f.nivel }
    if (f.tipo !== 'AG' && calc[i].jValor) {
      r.getCell(10).note = 'Valor, no fórmula: el P.U. cobrado difiere del contratado. Ver nota bajo la tabla.'
    }
  })

  // TOTAL: SUM de los importes de las filas de concepto (no de los grupos)
  const rt = primera + filas.length
  ws.mergeCells(rt, 1, rt, 4)
  for (let c = 1; c <= LAST_COL; c++) {
    const cell = ws.getCell(rt, c)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OSCURO } }
  }
  ws.getCell(rt, 1).value = 'TOTAL'
  ws.getCell(rt, 1).alignment = { horizontal: 'right' }
  const idxCO = filas.map((f, j) => j).filter(j => esConcepto(filas[j]))
  ;['F', 'H', 'J', 'L', 'N'].forEach(col => {
    const cell = ws.getCell(`${col}${rt}`)
    cell.value = idxCO.length
      ? { formula: `SUM(${listaRangos(col, idxCO.map(j => primera + j))})`, result: sumaRes(idxCO, col) }
      : 0
    cell.numFmt = col === 'N' ? FMT_SALDO_MXN : FMT_MXN
    cell.alignment = { horizontal: 'right' }
  })

  // Nota bajo la tabla: filas donde J es valor (P.U. cobrado distinto del contratado)
  let cursor = rt
  if (notasJ.length) {
    const nota = (fila, texto, font) => {
      ws.mergeCells(fila, 1, fila, LAST_COL)
      const c = ws.getCell(fila, 1)
      c.value = texto
      c.font = font
      c.alignment = { horizontal: 'left', vertical: 'top', wrapText: true }
    }
    nota(rt + 2, 'Nota: en las siguientes filas el importe de Esta Estimación (columna J) es un valor (azul) y no una fórmula, porque el P.U. cobrado difiere del contratado:', { bold: true, size: 9, color: { argb: GRIS_ETIQUETA } })
    notasJ.forEach((texto, k) => nota(rt + 3 + k, '• ' + texto, { size: 9, color: { argb: GRIS_ETIQUETA } }))
    cursor = rt + 2 + notasJ.length
  }

  // Firmas: dos filas libres bajo el TOTAL (o la nota) y un bloque por firmante, repartido a lo ancho.
  // Hasta 4 firmantes en una fila; con 5 o más, dos filas (3+2, 3+3, 4+3, 4+4) con dos filas libres
  // entre ambas para firmar. Cada fila se reparte con repartirColumnas (por ancho en caracteres).
  let ultima = cursor
  if (firmas.length) {
    const mitad = Math.ceil(firmas.length / 2)
    const grupos = firmas.length <= 4 ? [firmas] : [firmas.slice(0, mitad), firmas.slice(mitad)]
    ws.getRow(cursor + 1).height = 22
    ws.getRow(cursor + 2).height = 22
    let rf = cursor + 3
    grupos.forEach((grupo, g) => {
      if (g > 0) { // dos filas libres entre la primera fila de firmas y la segunda
        ws.getRow(rf).height = 22
        ws.getRow(rf + 1).height = 22
        rf += 2
      }
      repartirColumnas(grupo.length).forEach(([desde, hasta], i) => {
        const f = grupo[i]
        const lineas = [
          [f.puesto, { bold: true }],
          [f.nombre, { color: { argb: GRIS_ETIQUETA }, size: 9 }],
          [f.entidad, { color: { argb: GRIS_ETIQUETA }, size: 9 }],
        ]
        lineas.forEach(([texto, font], k) => {
          const fila = rf + k
          for (let c = desde; c <= hasta; c++) {
            ws.getCell(fila, c).font = font
            if (k === 0) ws.getCell(fila, c).border = { top: BORDE } // línea de firma
          }
          const m = ws.getCell(fila, desde)
          m.value = texto || null
          m.alignment = { horizontal: 'center', vertical: 'top', wrapText: true }
          if (hasta > desde) ws.mergeCells(fila, desde, fila, hasta)
        })
      })
      rf += 3
    })
    ultima = rf - 1
  }
  ws.pageSetup.printArea = `A1:N${ultima}`

  return wb
}

export async function exportarRelacionExcel(datos) {
  const wb = await construirLibroRelacion(datos)
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo({ prefijo: 'RelacionEst', numero: datos.estimacion.numero_estimacion, contrato: datos.contrato?.numero, ext: 'xlsx' })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
