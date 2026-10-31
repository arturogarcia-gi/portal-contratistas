// Plantilla de carga de estimación (diseño de la Relación; solo se escribe en la columna I) y su lector.
import { redondeoExcel, listaRangos } from './exportarRelacionExcel.js'
import { ordenarJerarquia } from './relacionEstimacion.js'
import { nombreArchivo } from './nombresArchivo.js'
import { formatMXN2 } from './format.js'

export const VERSION_PLANTILLA = 1
// Misma regla que la carga y la descarga anteriores de NuevaEstimacion y que el portal:
// el acumulado anterior suma las estimaciones del contrato en estos estados.
export const ESTADOS_CUENTAN_ACUMULADO = ['en_revision', 'autorizada', 'correo_enviado', 'con_factura', 'pagada']

const OSCURO = 'FF1F2937'
const AMARILLO = 'FFFFF2CC'
const ROJO_CLARO = 'FFFFC7CE'
const GRIS_GRUPO = 'FFE5E7EB'
const GRIS_ETIQUETA = 'FF6B7280'
const BORDE = { style: 'thin', color: { argb: 'FF9CA3AF' } }
const BORDE_SUAVE = { style: 'thin', color: { argb: 'FFE5E7EB' } }
const FMT_CANT = '#,##0.00'
const FMT_CANT_I = '#,##0.00##'
const FMT_MXN = '"$"#,##0.00'
const FMT_SALDO_CANT = '#,##0.00;[Red]-#,##0.00'
const FMT_SALDO_MXN = '"$"#,##0.00;[Red]-"$"#,##0.00'
const ANCHOS = [14, 55, 9, 15, 12, 16, 12, 16, 12, 16, 12, 16, 12, 16, 38]
const FILA_HDR = 8
const PRIMERA = 10
const TOL_SALDO = 1e-9
const TOL_ACUM = 1e-6
const MSG_VALIDACION = 'Escribe un número válido, con el separador decimal de tu equipo, que no pase del saldo disponible.'

// Acumulado anterior por concepto: { [concepto_id]: { cantidad, importe } }
export async function cargarAcumuladoConceptos(supabase, contratoId) {
  const { data: ests, error } = await supabase
    .from('estimaciones').select('id').eq('contrato_id', contratoId).in('estado', ESTADOS_CUENTAN_ACUMULADO)
  if (error) throw error
  const acumulado = {}
  if (ests && ests.length > 0) {
    const { data: lineas, error: errLin } = await supabase
      .from('estimacion_lineas').select('concepto_id, cantidad_periodo, importe_periodo').in('estimacion_id', ests.map(e => e.id))
    if (errLin) throw errLin
    ;(lineas || []).forEach(l => {
      if (!l.concepto_id) return
      const a = acumulado[l.concepto_id] || (acumulado[l.concepto_id] = { cantidad: 0, importe: 0 })
      a.cantidad += l.cantidad_periodo || 0
      a.importe += l.importe_periodo || 0
    })
  }
  return acumulado
}

// Compensaciones obligatorias por convenio: un concepto cuya cantidad vigente quedó por DEBAJO de lo ya estimado
// (estimado > cantidad_contratada). La siguiente estimación debe registrar un ajuste negativo exacto igual al exceso,
// de modo que el concepto termine con estimado = vigente. Opera sobre el estado YA autorizado del catálogo (a
// diferencia de avisoConvenio.js, que evalúa las líneas de un convenio en borrador). Nada se guarda: se deriva.
// acumulado puede ser { [id]: { cantidad, importe } } (cargarAcumuladoConceptos) o { [id]: número }.
// Devuelve un Map por concepto_id: { concepto_id, clave, cantidad_pendiente } (6 decimales, tolerancia 1e-9).
export function calcularCompensacionPendiente({ conceptos, acumulado }) {
  const pendientes = new Map()
  for (const c of conceptos || []) {
    if (c.tipo === 'AG') continue
    const id = c.concepto_id ?? c.id
    const a = acumulado?.[id]
    const estimado = typeof a === 'number' ? a : (Number(a?.cantidad) || 0)
    const exceso = estimado - (Number(c.cantidad_contratada) || 0)
    if (exceso > TOL_SALDO) pendientes.set(id, { concepto_id: id, clave: c.clave, cantidad_pendiente: redondear6(exceso) })
  }
  return pendientes
}

// Mensaje del bloqueo por valor negativo (lo usan el lector y el guardia): el faltante se redondea hacia arriba al centavo
const mensajeValorNegativo = valor => {
  const faltante = Math.ceil(-valor * 100 - 1e-9) / 100
  return `El valor de la estimación quedaría en ${formatMXN2(valor)} por las compensaciones obligatorias: agrega trabajo del periodo por al menos ${formatMXN2(faltante)}.`
}

// Guardia común ANTES de guardar una estimación (crear o reemplazar), venga de donde venga la captura:
// cada compensación pendiente debe aparecer con su cantidad exacta y el valor (Σ cantidad × pu_cobrado) no puede ser
// negativo. `conceptos` y `acumulado` deben venir frescos y resueltos; `lineas` son las que se van a insertar.
export function validarCompensaciones({ conceptos, acumulado, lineas }) {
  const errores = []
  for (const [id, p] of calcularCompensacionPendiente({ conceptos, acumulado })) {
    const exacto = -p.cantidad_pendiente
    const aplicado = (lineas || []).filter(l => l.concepto_id === id).reduce((s, l) => s + (Number(l.cantidad_periodo) || 0), 0)
    if (Math.abs(aplicado - exacto) > TOL_SALDO) {
      errores.push(`${p.clave}: la estimación debe incluir la compensación obligatoria por convenio de ${exacto} y trae ${redondear6(aplicado)}.`)
    }
  }
  const valorNeto = (lineas || []).reduce((s, l) => s + (Number(l.cantidad_periodo) || 0) * (Number(l.pu_cobrado) || 0), 0)
  if (valorNeto < -TOL_SALDO) errores.push(mensajeValorNegativo(valorNeto))
  return { ok: errores.length === 0, errores, valorNeto }
}

// ---------------------------------------------------------------------------------------------
// Generador
// ---------------------------------------------------------------------------------------------
export async function construirLibroPlantilla({ conceptos, acumulado, contrato, periodo, numeroEstimacion, fechaDescarga = new Date() }) {
  const ExcelJS = (await import('exceljs')).default
  const wb = new ExcelJS.Workbook()
  const compensaciones = calcularCompensacionPendiente({ conceptos, acumulado })
  const ws = wb.addWorksheet('Estimación', {
    views: [{ state: 'frozen', ySplit: FILA_HDR + 1 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: `${FILA_HDR}:${FILA_HDR + 1}` },
  })
  ws.columns = ANCHOS.map(width => ({ width }))
  ws.getColumn(15).hidden = true // O: id del concepto

  ws.mergeCells('A1:N1')
  ws.getCell('A1').value = contrato?.spvs?.nombre || ''
  ws.getCell('A1').font = { bold: true, size: 16 }
  ws.getCell('A1').alignment = { horizontal: 'center' }
  ws.mergeCells('A2:N2')
  ws.getCell('A2').value = 'Plantilla de carga de estimación'
  ws.getCell('A2').font = { bold: true, size: 12 }
  ws.getCell('A2').alignment = { horizontal: 'center' }
  const etiqueta = (c, t) => { ws.getCell(c).value = t; ws.getCell(c).font = { color: { argb: GRIS_ETIQUETA }, size: 9 } }
  const valor = (c, v) => { ws.getCell(c).value = v; ws.getCell(c).font = { bold: true }; ws.getCell(c).alignment = { horizontal: 'left' } }
  etiqueta('A4', 'Contrato');         valor('B4', contrato?.numero || '')
  etiqueta('A5', 'Período');          valor('B5', periodo?.label || '')
  etiqueta('K4', 'Estimación (provisional)'); valor('M4', numeroEstimacion)
  ws.getCell('K5').value = 'El número definitivo se asigna al guardar.'
  ws.getCell('K5').font = { italic: true, size: 9, color: { argb: GRIS_ETIQUETA } }
  ws.mergeCells('A6:N6')
  ws.getCell('A6').value = 'Escribe solo en la columna amarilla "Esta Estimación – Cantidad". El resto de la hoja está protegido.' +
    (compensaciones.size > 0 ? ' Las celdas en rojo son compensaciones obligatorias por convenio: no se editan y se aplican al cargar.' : '')
  ws.getCell('A6').font = { italic: true, size: 9, color: { argb: GRIS_ETIQUETA } }

  // Encabezado de tabla en dos niveles (texto solo en la maestra; las esclavas reciben solo estilo)
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
  hdr(`O${FILA_HDR}`, 'id (no editar)')
  hdr(`O${FILA_HDR + 1}`)
  ws.mergeCells(`O${FILA_HDR}:O${FILA_HDR + 1}`)

  // Filas
  const ordenados = ordenarJerarquia(conceptos)
  const esAG = c => c.tipo === 'AG'
  const nivelDe = c => (c.jerarquia?.match(/\./g) || []).length
  const rowDe = i => PRIMERA + i
  const calc = ordenados.map(c => {
    if (esAG(c)) return null
    const pu = c.precio_unitario || 0
    const E = c.cantidad_contratada || 0
    const a = acumulado[c.id] || { cantidad: 0, importe: 0 }
    // Compensación obligatoria precargada en I (negativa); si no hay, I queda vacía (0)
    const I = compensaciones.has(c.id) ? -compensaciones.get(c.id).cantidad_pendiente : 0
    const F = redondeoExcel(E * pu)
    const J = redondeoExcel(I * pu)
    const K = a.cantidad + I
    const L = redondeoExcel(a.importe + J)
    return { pu, E, G: a.cantidad, H: a.importe, I, F, J, K, L, M: redondeoExcel(E - K, 6), N: redondeoExcel(F - L) }
  })
  const fmts = [null, null, null, FMT_MXN, FMT_CANT, FMT_MXN, FMT_CANT, FMT_MXN, FMT_CANT_I, FMT_MXN, FMT_CANT, FMT_MXN, FMT_SALDO_CANT, FMT_SALDO_MXN]
  const filasCO = []
  ordenados.forEach((c, i) => {
    const r = rowDe(i)
    const row = ws.getRow(r)
    let vals
    if (esAG(c)) {
      // Importes de grupo: SUM de los CO que cuelgan de él (mismo criterio que sumarHijosAG)
      const hijos = ordenados.map((h, j) => j).filter(j => ordenados[j].tipo === 'CO' && c.jerarquia && ordenados[j].jerarquia && ordenados[j].jerarquia.startsWith(c.jerarquia + '.'))
      const suma = (col, k) => (hijos.length
        ? { formula: `SUM(${listaRangos(col, hijos.map(rowDe))})`, result: hijos.reduce((s, j) => s + calc[j][k], 0) }
        : 0)
      vals = [c.clave, c.descripcion, null, null, null, suma('F', 'F'), null, suma('H', 'H'), null, suma('J', 'J'), null, suma('L', 'L'), null, suma('N', 'N')]
    } else {
      const k = calc[i]
      filasCO.push(i)
      vals = [c.clave, c.descripcion, c.unidad, k.pu, k.E,
        { formula: `ROUND(E${r}*D${r},2)`, result: k.F },
        k.G, k.H, k.I !== 0 ? k.I : null,
        { formula: `ROUND(I${r}*D${r},2)`, result: k.J },
        { formula: `G${r}+I${r}`, result: k.K },
        { formula: `ROUND(H${r}+J${r},2)`, result: k.L },
        { formula: `ROUND(E${r}-K${r},6)`, result: k.M },
        { formula: `ROUND(F${r}-L${r},2)`, result: k.N }]
    }
    for (let col = 1; col <= 14; col++) {
      const cell = row.getCell(col)
      cell.value = vals[col - 1] ?? null
      if (fmts[col - 1]) cell.numFmt = fmts[col - 1]
      cell.border = { top: BORDE_SUAVE, left: BORDE_SUAVE, bottom: BORDE_SUAVE, right: BORDE_SUAVE }
      cell.alignment = { vertical: 'top', ...(col === 2 ? { wrapText: true } : {}), ...(col >= 4 ? { horizontal: 'right' } : {}) }
      if (esAG(c)) {
        cell.font = { bold: true }
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GRIS_GRUPO } }
      } else {
        cell.font = { color: { argb: 'FF000000' } }
      }
    }
    row.getCell(1).alignment = { vertical: 'top', horizontal: 'left', indent: nivelDe(c) }
    if (!esAG(c)) {
      row.getCell(15).value = c.id // id oculto del concepto
      // Única celda editable: I (cantidad de esta estimación), con fondo amarillo y validación
      const ci = row.getCell(9)
      if (compensaciones.has(c.id)) {
        // Compensación obligatoria por convenio: valor precargado, celda bloqueada, sin validación y en rojo claro
        ci.protection = { locked: true }
        ci.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROJO_CLARO } }
        ci.font = { color: { argb: 'FF9C0006' } }
        ci.note = 'Compensación obligatoria por convenio'
      } else {
        ci.protection = { locked: false }
        ci.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: AMARILLO } }
        ci.font = { color: { argb: 'FF1D4ED8' } }
        ci.dataValidation = {
          type: 'decimal', operator: 'between', allowBlank: true,
          formulae: [0, `ROUND($E${r}-$G${r},6)`],
          showInputMessage: true, promptTitle: 'Cantidad de esta estimación',
          prompt: 'Cantidad ejecutada en el período. Máximo: el saldo disponible.',
          showErrorMessage: true, errorStyle: 'stop', errorTitle: 'Cantidad no válida', error: MSG_VALIDACION,
        }
      }
    }
  })

  // TOTAL: SUM de los importes de las filas de concepto
  const rt = PRIMERA + ordenados.length
  ws.mergeCells(rt, 1, rt, 4)
  for (let c = 1; c <= 14; c++) {
    const cell = ws.getCell(rt, c)
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: OSCURO } }
  }
  ws.getCell(rt, 1).value = 'TOTAL'
  ws.getCell(rt, 1).alignment = { horizontal: 'right' }
  ;['F', 'H', 'J', 'L', 'N'].forEach(col => {
    const cell = ws.getCell(`${col}${rt}`)
    cell.value = filasCO.length
      ? { formula: `SUM(${listaRangos(col, filasCO.map(rowDe))})`, result: filasCO.reduce((s, j) => s + calc[j][col], 0) }
      : 0
    cell.numFmt = col === 'N' ? FMT_SALDO_MXN : FMT_MXN
    cell.alignment = { horizontal: 'right' }
  })

  // Fila completa en rojo cuando el saldo en cantidad (M) queda negativo
  if (ordenados.length) {
    ws.addConditionalFormatting({
      ref: `A${PRIMERA}:N${rt - 1}`,
      rules: [{
        type: 'expression', priority: 1, formulae: [`$M${PRIMERA}<0`],
        style: { fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFFFC7CE' } }, font: { color: { argb: 'FF9C0006' } } },
      }],
    })
  }
  ws.pageSetup.printArea = `A1:N${rt}`

  // Hoja protegida SIN contraseña: se pueden seleccionar celdas; formatear, insertar y borrar quedan bloqueados
  await ws.protect(undefined, { selectLockedCells: true, selectUnlockedCells: true })

  // Metadatos para el lector (hoja muy oculta)
  const meta = wb.addWorksheet('_meta', { state: 'veryHidden' })
  const filaFin = PRIMERA + ordenados.length - 1
  ;[
    ['version', VERSION_PLANTILLA],
    ['contrato_id', contrato?.id ?? null],
    ['periodo_id', periodo?.id ?? null],
    ['numero_estimacion', numeroEstimacion ?? null],
    ['fecha_descarga', fechaDescarga.toISOString()],
    ['col_cantidad', 'I'],
    ['col_acumulado', 'G'],
    ['col_id', 'O'],
    ['fila_inicio', PRIMERA],
    ['fila_fin', filaFin],
  ].forEach(par => meta.addRow(par))
  await meta.protect(undefined, {})

  return wb
}

export async function descargarPlantillaCarga(wb, { contrato, periodo }) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo({ prefijo: 'PlantillaCarga', contrato: contrato?.numero, extra: periodo?.label, ext: 'xlsx' })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------------------------------------------------------------------------------------------
// Lector (wb = libro leído con XLSX.read). No importa xlsx: trabaja sobre las celdas.
// ---------------------------------------------------------------------------------------------
export const esPlantillaNueva = wb => !!wb?.Sheets?._meta

function leerMeta(wb) {
  const hoja = wb.Sheets._meta
  const meta = {}
  for (let r = 1; r <= 60; r++) {
    const k = hoja[`A${r}`]?.v
    if (k === undefined) break
    meta[k] = hoja[`B${r}`]?.v
  }
  return meta
}

const redondear6 = n => Math.round(n * 1e6) / 1e6

// Revalida todo desde la base (Excel no valida al pegar). Devuelve { lineas, errores, avisos, excedidos, vacio }.
export function leerPlantillaCarga(wb, { contratoId, periodoId, conceptos, acumulado }) {
  const errores = []
  const avisos = []
  const excedidos = []
  const salida = (extra = {}) => ({ lineas: [], errores, avisos, excedidos, vacio: false, ...extra })

  const meta = leerMeta(wb)
  if (meta.version !== VERSION_PLANTILLA) {
    errores.push(`Versión de plantilla no reconocida (${meta.version ?? 'sin versión'}). Descarga la plantilla nueva desde esta pantalla.`)
    return salida()
  }
  if (meta.contrato_id !== contratoId) {
    errores.push('Esta plantilla es de otro contrato. Descarga la plantilla de este contrato desde esta pantalla.')
    return salida()
  }
  if (periodoId && meta.periodo_id && meta.periodo_id !== periodoId) {
    errores.push('Esta plantilla se descargó para otro período de este contrato. Descarga la plantilla desde el período en el que vas a cargar la estimación.')
    return salida()
  }

  const colCant = meta.col_cantidad || 'I'
  const colAcum = meta.col_acumulado || 'G'
  const colId = meta.col_id || 'O'
  const ws = wb.Sheets[wb.SheetNames.find(n => n !== '_meta')]
  const texto = a => String(ws?.[a]?.v ?? '').trim()
  if (!ws || texto(`${colCant}8`) !== 'Esta Estimación' || texto(`${colCant}9`) !== 'Cantidad') {
    errores.push(`No se encontró la columna "Esta Estimación – Cantidad" (${colCant}). Parece que se modificó la plantilla; descarga una nueva.`)
    return salida()
  }

  const candidatos = conceptos.filter(c => c.tipo !== 'AG')
  const porId = new Map(candidatos.map(c => [String(c.id), c]))
  const porClave = new Map()
  candidatos.forEach(c => { if (!porClave.has(c.clave)) porClave.set(c.clave, c) })

  const lineas = []
  const vistos = new Map() // concepto_id -> fila
  const cambiados = []

  // Compensaciones obligatorias por convenio, con el acumulado FRESCO que recibe esta función. Para estos conceptos
  // se ignora lo que traiga la hoja y se aplica el valor exacto; si la hoja traía otra cosa, solo se avisa.
  const compensaciones = calcularCompensacionPendiente({ conceptos, acumulado })
  const compensadas = new Set()
  const describir = v => (v === undefined || v === null || (typeof v === 'string' && v.trim() === '') ? 'vacío' : typeof v === 'number' ? String(v) : `"${v}"`)
  const aplicarCompensacion = (concepto, traia, fila) => {
    const exacto = -compensaciones.get(concepto.id).cantidad_pendiente
    const acumBase = acumulado[concepto.id]?.cantidad || 0
    compensadas.add(concepto.id)
    const igual = typeof traia === 'number' && Math.abs(traia - exacto) <= TOL_SALDO
    if (!igual) {
      avisos.push(fila
        ? `Compensación obligatoria en ${concepto.clave} (fila ${fila}): la hoja traía ${describir(traia)} y se aplicó el valor exacto ${exacto}.`
        : `Compensación obligatoria en ${concepto.clave}: la hoja no incluía este concepto y se aplicó el valor exacto ${exacto}.`)
    }
    lineas.push({
      clave: concepto.clave,
      descripcion: concepto.descripcion,
      unidad: concepto.unidad,
      concepto_id: concepto.id,
      cantidad_contratada: concepto.cantidad_contratada || 0,
      cantidad_acumulada_anterior: acumBase,
      cantidad_periodo: exacto,
      pu_contratado: concepto.precio_unitario || 0,
      pu_cobrado: concepto.precio_unitario || 0,
      encontrado: true,
    })
  }
  const inicio = Number(meta.fila_inicio) || 10
  const fin = Number(meta.fila_fin) || inicio
  for (let r = inicio; r <= fin; r++) {
    const idArchivo = texto(`${colId}${r}`)
    const claveArchivo = texto(`A${r}`)
    const celda = ws[`${colCant}${r}`]
    const crudo = celda?.v
    const etiqueta = `Fila ${r}${claveArchivo ? ` (${claveArchivo})` : ''}`

    let concepto = idArchivo ? porId.get(idArchivo) : undefined
    if (!concepto && claveArchivo) concepto = porClave.get(claveArchivo)

    // Acumulado de la hoja contra el acumulado actual de la base
    if (concepto) {
      const g = ws[`${colAcum}${r}`]
      const acumBase = acumulado[concepto.id]?.cantidad || 0
      if (g && typeof g.v === 'number' && Math.abs(g.v - acumBase) > TOL_ACUM) cambiados.push(concepto.clave)
    }

    // Concepto con compensación obligatoria: la regla de cantidad >= 0 no aplica; se usa el valor exacto
    if (concepto && compensaciones.has(concepto.id)) {
      if (vistos.has(concepto.id)) {
        errores.push(`${etiqueta}: el concepto ya aparece en la fila ${vistos.get(concepto.id)}; cada concepto va una sola vez.`)
        continue
      }
      vistos.set(concepto.id, r)
      aplicarCompensacion(concepto, crudo, r)
      continue
    }

    if (crudo === undefined || crudo === null || (typeof crudo === 'string' && crudo.trim() === '')) continue // vacía

    if (celda.t !== 'n' || typeof crudo !== 'number' || !Number.isFinite(crudo)) {
      errores.push(`${etiqueta}: "${crudo}" no es un número válido; escribe solo dígitos y el separador decimal de tu equipo (sin texto).`)
      continue
    }
    if (crudo === 0) continue // 0 se ignora
    if (crudo < 0) {
      errores.push(`${etiqueta}: la cantidad no puede ser negativa (${crudo}).`)
      continue
    }
    if (!concepto) {
      errores.push(`${etiqueta}: no se encontró el concepto${idArchivo ? ` (id "${idArchivo}")` : ''} en el catálogo de este contrato.`)
      continue
    }
    if (vistos.has(concepto.id)) {
      errores.push(`${etiqueta}: el concepto ya aparece en la fila ${vistos.get(concepto.id)}; cada concepto va una sola vez.`)
      continue
    }
    vistos.set(concepto.id, r)

    const acumBase = acumulado[concepto.id]?.cantidad || 0
    const saldo = (concepto.cantidad_contratada || 0) - acumBase
    if (crudo > saldo + TOL_SALDO) {
      excedidos.push({ clave: concepto.clave, cantidad: crudo, saldo: redondear6(saldo) })
      errores.push(`${concepto.clave} — ${(concepto.descripcion || '').slice(0, 50)}: cantidad ${crudo} supera el saldo disponible (${redondear6(saldo)} ${concepto.unidad || ''})`.trim())
      continue
    }
    lineas.push({
      clave: concepto.clave,
      descripcion: concepto.descripcion,
      unidad: concepto.unidad,
      concepto_id: concepto.id,
      cantidad_contratada: concepto.cantidad_contratada || 0,
      cantidad_acumulada_anterior: acumBase,
      cantidad_periodo: crudo,
      pu_contratado: concepto.precio_unitario || 0,
      pu_cobrado: concepto.precio_unitario || 0,
      encontrado: true,
    })
  }

  // Compensaciones pendientes cuyo concepto no venía en la hoja: también son obligatorias
  for (const id of compensaciones.keys()) {
    if (compensadas.has(id)) continue
    const concepto = candidatos.find(c => (c.concepto_id ?? c.id) === id)
    if (concepto) aplicarCompensacion(concepto, undefined, null)
  }

  if (cambiados.length) {
    const MAX_CLAVES = 8
    const muestra = cambiados.slice(0, MAX_CLAVES).join(', ') + (cambiados.length > MAX_CLAVES ? `, … y ${cambiados.length - MAX_CLAVES} más` : '')
    avisos.push(`El acumulado cambió en ${cambiados.length} concepto${cambiados.length === 1 ? '' : 's'} desde la descarga (${muestra}). Se usó el acumulado actual.`)
  }
  // Valor de la estimación (antes de amortización, fondo e IVA): Σ cantidad_periodo × pu_cobrado, sin redondear
  // (igual que NuevaEstimacion.jsx). Con las compensaciones ya aplicadas, un valor negativo bloquea toda la carga.
  const valorNeto = lineas.reduce((s, l) => s + l.cantidad_periodo * l.pu_cobrado, 0)
  if (valorNeto < -TOL_SALDO) errores.push(mensajeValorNegativo(valorNeto))
  if (!errores.length && !lineas.length) {
    avisos.push('El archivo no trae ninguna cantidad en la columna "Esta Estimación – Cantidad". Captura al menos un concepto y vuelve a subirlo.')
    return salida({ vacio: true })
  }
  return salida({ lineas, valorNeto })
}
