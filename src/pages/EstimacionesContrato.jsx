import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../lib/supabase'

const IVA_RATE = 0.16
const ESTADOS_CUENTAN_SALDO = ['en_revision', 'confirmada', 'correo_enviado', 'pagada']

function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

function formatFecha(f) {
  if (!f) return '—'
  return new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

const round2 = (n) => Math.round(n * 100) / 100

const ESTADO_COLORS = {
  autorizada: 'bg-emerald-50 text-emerald-700',
  correo_enviado: 'bg-blue-50 text-blue-700',
  pagada: 'bg-green-700 text-white',
  pendiente: 'bg-amber-50 text-amber-700',
}

const ESTADO_LABELS = {
  autorizada: 'Autorizada',
  correo_enviado: 'Correo enviado',
  pagada: 'Pagada',
  pendiente: 'Pendiente',
  borrador: 'Borrador',
}

function estadoEfectivo(estimacion) {
  return estimacion.fecha_pago ? 'pagada' : estimacion.estado
}

function ordenarPorJerarquia(lista) {
  return [...lista].sort((a, b) => {
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

async function fetchAcumuladoMap(contratoId) {
  const { data: ests } = await supabase
    .from('estimaciones')
    .select('id')
    .eq('contrato_id', contratoId)
    .in('estado', ESTADOS_CUENTAN_SALDO)

  const acumuladoMap = {}
  if (ests && ests.length > 0) {
    const { data: linPrev } = await supabase
      .from('estimacion_lineas')
      .select('concepto_id, cantidad_periodo')
      .in('estimacion_id', ests.map(e => e.id))
    ;(linPrev || []).forEach(l => {
      if (l.concepto_id) acumuladoMap[l.concepto_id] = (acumuladoMap[l.concepto_id] || 0) + l.cantidad_periodo
    })
  }
  return acumuladoMap
}

export default function EstimacionesContrato() {
  const { id } = useParams()
  const fileInputRef = useRef(null)

  const [contrato, setContrato] = useState(null)
  const [periodoAbierto, setPeriodoAbierto] = useState(null)
  const [estimaciones, setEstimaciones] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const [showModal, setShowModal] = useState(false)
  const [modalPaso, setModalPaso] = useState(1)
  const [conceptos, setConceptos] = useState([])
  const [acumuladoMap, setAcumuladoMap] = useState({})
  const [cargandoModal, setCargandoModal] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [uploadErrors, setUploadErrors] = useState([])
  const [lineasValidadas, setLineasValidadas] = useState([])
  const [creando, setCreando] = useState(false)
  const [errorCrear, setErrorCrear] = useState(null)
  const [creadoOk, setCreadoOk] = useState(false)
  const [fechaInicioEjec, setFechaInicioEjec] = useState('')
  const [fechaFinEjec, setFechaFinEjec] = useState('')

  const fetchDatos = useCallback(async () => {
    try {
      const { data: contratoData, error: contratoError } = await supabase
        .from('contratos')
        .select('numero, descripcion, monto_original, pct_anticipo, pct_fondo_garantia, spvs(nombre)')
        .eq('id', id)
        .maybeSingle()
      if (contratoError) throw contratoError
      if (!contratoData) {
        setError('Contrato no encontrado o sin acceso')
        setContrato(null)
        return
      }

      const { data: periodoData, error: periodoError } = await supabase
        .from('periodos')
        .select('id, label, fecha_inicio, fecha_fin')
        .eq('contrato_id', id)
        .eq('estado', 'abierto')
      if (periodoError) throw periodoError
      const periodo = periodoData?.[0] ?? null

      const { data: estData, error: estError } = await supabase
        .from('estimaciones')
        .select('id, numero_estimacion, total_neto, estado, numero_factura, fecha_factura, fecha_pago, created_at')
        .eq('contrato_id', id)
        .not('estado', 'eq', 'cancelada')
        .order('numero_estimacion', { ascending: true })
      if (estError) throw estError

      setContrato(contratoData)
      setPeriodoAbierto(periodo)
      setEstimaciones(estData || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const t = setTimeout(() => fetchDatos(), 0)
    return () => clearTimeout(t)
  }, [fetchDatos])

  async function handleAbrirModal() {
    setError(null)
    const { data: existentes, error: existentesError } = await supabase
      .from('estimaciones')
      .select('id')
      .eq('periodo_id', periodoAbierto.id)
      .in('estado', ['borrador', 'en_revision'])
    if (existentesError) {
      setError(existentesError.message)
      return
    }
    if (existentes && existentes.length > 0) {
      setError('Ya tienes una estimación en proceso para este periodo')
      return
    }

    setShowModal(true)
    setModalPaso(1)
    setUploadErrors([])
    setLineasValidadas([])
    setErrorCrear(null)
    setCreadoOk(false)
    setFechaInicioEjec(periodoAbierto?.fecha_inicio || '')
    setFechaFinEjec(periodoAbierto?.fecha_fin || '')
    setCargandoModal(true)
    try {
      const [{ data: cp, error: cpError }, mapa] = await Promise.all([
        supabase.from('conceptos').select('*').eq('contrato_id', id).eq('tipo', 'CO'),
        fetchAcumuladoMap(id),
      ])
      if (cpError) throw cpError
      setConceptos(ordenarPorJerarquia(cp || []))
      setAcumuladoMap(mapa)
    } catch (e) {
      setError(e.message)
    } finally {
      setCargandoModal(false)
    }
  }

  function handleCerrarModal() {
    setShowModal(false)
  }

  function handleDescargarPlantilla() {
    setDescargando(true)
    try {
      const S_HDR = { fill: { patternType: 'solid', fgColor: { rgb: 'FF0A0A0A' } }, font: { bold: true, color: { rgb: 'FFFFFFFF' } } }
      const S_NEG = { fill: { patternType: 'solid', fgColor: { rgb: 'FFFFC7CE' } }, font: { color: { rgb: 'FF9C0006' } } }
      const S_EDT = { fill: { patternType: 'solid', fgColor: { rgb: 'FFC6EFCE' } }, font: { color: { rgb: 'FF276221' } } }

      const COLS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I']
      const headerRow = [
        { t: 's', v: 'Clave', s: S_HDR },
        { t: 's', v: 'Descripcion', s: S_HDR },
        { t: 's', v: 'Unidad', s: S_HDR },
        { t: 's', v: 'Precio Unitario', s: S_HDR },
        { t: 's', v: 'Cantidad Contrato', s: S_HDR },
        { t: 's', v: 'Cantidad Estimada Previa', s: S_HDR },
        { t: 's', v: 'Saldo Disponible', s: S_HDR },
        { t: 's', v: 'Cantidad Esta Estimacion', s: S_EDT },
        { t: 's', v: 'Importe', s: S_HDR },
      ]

      const dataRows = conceptos.map((c, idx) => {
        const rowNum = idx + 2
        const acumAnt = acumuladoMap[c.id] || 0
        const saldo = (c.cantidad_contratada || 0) - acumAnt
        return [
          { t: 's', v: c.clave_concepto || c.clave || '' },
          { t: 's', v: c.descripcion || '' },
          { t: 's', v: c.unidad || '' },
          { t: 'n', v: c.precio_unitario || 0 },
          { t: 'n', v: c.cantidad_contratada || 0 },
          { t: 'n', v: acumAnt },
          { t: 'n', v: saldo, s: saldo <= 0 ? S_NEG : undefined },
          { t: 'n', v: 0, s: S_EDT },
          { t: 'f', f: `IF(H${rowNum}="",0,H${rowNum}*D${rowNum})` },
        ]
      })

      const allRows = [headerRow, ...dataRows]
      const ws = {}
      allRows.forEach((row, ri) => {
        row.forEach((cell, ci) => { ws[COLS[ci] + (ri + 1)] = cell })
      })
      ws['!ref'] = `A1:I${allRows.length}`
      ws['!cols'] = [
        { wch: 10 }, { wch: 50 }, { wch: 10 }, { wch: 14 },
        { wch: 16 }, { wch: 20 }, { wch: 16 }, { wch: 20 }, { wch: 14 },
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Estimación')

      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'binary', cellStyles: true })
      const buf = new ArrayBuffer(wbout.length)
      const view = new Uint8Array(buf)
      for (let i = 0; i < wbout.length; i++) view[i] = wbout.charCodeAt(i) & 0xFF
      const blob = new Blob([buf], { type: 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Plantilla_Estimacion_${contrato?.numero}_${periodoAbierto?.label}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (e) {
      setError('Error al generar la plantilla: ' + e.message)
    } finally {
      setDescargando(false)
    }
  }

  function procesarArchivo(file) {
    const reader = new FileReader()
    reader.onload = (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: '' })

        const errores = []
        const lineas = []

        for (const row of rows) {
          const clave = String(row['Clave'] || '').trim()
          if (!clave) continue

          const cantRaw = row['Cantidad Esta Estimacion']
          const cantidad = typeof cantRaw === 'number' ? cantRaw : parseFloat(cantRaw)
          if (cantRaw === '' || isNaN(cantidad)) continue
          if (cantidad === 0) continue

          const concepto = conceptos.find(c =>
            (c.clave_concepto && c.clave_concepto === clave) || c.clave === clave
          )
          if (!concepto) {
            errores.push(`Clave "${clave}": no encontrada en el catálogo del contrato`)
            continue
          }

          if (cantidad < 0) {
            errores.push(`${clave} — ${concepto.descripcion?.slice(0, 50)}: la cantidad no puede ser negativa`)
          }

          const acumAnt = acumuladoMap[concepto.id] || 0
          const saldo = (concepto.cantidad_contratada || 0) - acumAnt
          if (cantidad > saldo) {
            errores.push(`${clave} — ${concepto.descripcion?.slice(0, 50)}: cantidad ${cantidad} supera el saldo disponible (${saldo} ${concepto.unidad})`)
          }

          const puArchivo = parseFloat(row['Precio Unitario'])
          const puCatalogo = concepto.precio_unitario || 0
          if (!isNaN(puArchivo) && Math.abs(puArchivo - puCatalogo) > 0.01) {
            errores.push(`${clave} — ${concepto.descripcion?.slice(0, 50)}: el precio unitario fue modificado (catálogo: ${formatMXN(puCatalogo)}, archivo: ${formatMXN(puArchivo)})`)
          }

          const acumTotal = acumAnt + cantidad
          const pctVolumen = concepto.cantidad_contratada > 0 ? (acumTotal / concepto.cantidad_contratada) * 100 : 0

          lineas.push({
            clave,
            descripcion: concepto.descripcion,
            unidad: concepto.unidad,
            concepto_id: concepto.id,
            cantidad_contratada: concepto.cantidad_contratada || 0,
            cantidad_acumulada_anterior: acumAnt,
            cantidad_periodo: cantidad,
            cantidad_acumulada_total: acumTotal,
            pu_contratado: puCatalogo,
            pu_cobrado: puCatalogo,
            importe_periodo: round2(cantidad * puCatalogo),
            validacion_pu: 'ok',
            validacion_volumen: pctVolumen > 100 ? 'excede' : pctVolumen > 90 ? 'limite' : 'ok',
          })
        }

        if (errores.length > 0) {
          setUploadErrors(errores)
          setLineasValidadas([])
        } else {
          setUploadErrors([])
          setLineasValidadas(lineas)
        }
      } catch (e) {
        setUploadErrors(['Error al leer el archivo: ' + e.message])
      }
    }
    reader.readAsBinaryString(file)
  }

  function handleDrop(e) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    if (file) procesarArchivo(file)
  }

  function handleFileInputChange(e) {
    const file = e.target.files?.[0]
    if (file) procesarArchivo(file)
    e.target.value = ''
  }

  async function handleCrearEstimacion() {
    setCreando(true)
    setErrorCrear(null)
    try {
      const { data: estActivas, error: estActivasError } = await supabase
        .from('estimaciones')
        .select('numero_estimacion')
        .eq('contrato_id', id)
        .not('estado', 'eq', 'cancelada')
        .order('numero_estimacion', { ascending: false })
        .limit(1)
      if (estActivasError) throw estActivasError

      const numeroEst = (estActivas?.[0]?.numero_estimacion ?? 0) + 1
      const hash = Math.random().toString(36).substring(2, 10).toUpperCase()
      const folio = `EST-${contrato.numero}-${String(numeroEst).padStart(3, '0')}-${hash}`

      const valorEstimacion = lineasValidadas.reduce((sum, l) => sum + (l.importe_periodo || 0), 0)

      const { data: prevEsts, error: prevError } = await supabase
        .from('estimaciones')
        .select('subtotal')
        .eq('contrato_id', id)
        .in('estado', ['borrador', 'en_revision', 'autorizada', 'correo_enviado', 'pagada'])
      if (prevError) throw prevError
      const sumaPrevia = (prevEsts || []).reduce((sum, e) => sum + (e.subtotal || 0), 0)
      if (sumaPrevia + valorEstimacion > (contrato?.monto_original || 0)) {
        setErrorCrear('El monto supera el saldo disponible del contrato')
        return
      }

      const fondoGarantia = valorEstimacion * ((contrato?.pct_fondo_garantia || 0) / 100)
      const amortizacion = valorEstimacion * ((contrato?.pct_anticipo || 0) / 100)
      const subtotalNeto = round2(valorEstimacion - amortizacion - fondoGarantia)
      const iva = round2(subtotalNeto * IVA_RATE)
      const totalNeto = round2(subtotalNeto + iva)

      const { data: est, error: estError } = await supabase
        .from('estimaciones')
        .insert([{
          periodo_id: periodoAbierto.id,
          contrato_id: id,
          folio,
          numero_estimacion: numeroEst,
          estado: 'borrador',
          subtotal: valorEstimacion,
          iva,
          fondo_garantia: fondoGarantia,
          amortizacion_anticipo: amortizacion,
          total_neto: totalNeto,
          fecha_inicio_ejecucion: fechaInicioEjec,
          fecha_fin_ejecucion: fechaFinEjec,
        }])
        .select()
        .maybeSingle()
      if (estError) throw estError
      if (!est) throw new Error('No se pudo confirmar la creación de la estimación.')

      const { error: linError } = await supabase
        .from('estimacion_lineas')
        .insert(lineasValidadas.map(l => ({
          estimacion_id: est.id,
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
        })))
      if (linError) throw linError

      setCreadoOk(true)
      await fetchDatos()
    } catch (e) {
      setErrorCrear(e.message)
    } finally {
      setCreando(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>

  const totalEstimado = estimaciones.reduce((acc, e) => acc + (e.total_neto || 0), 0)
  const totalPagado = estimaciones
    .filter(e => estadoEfectivo(e) === 'pagada')
    .reduce((acc, e) => acc + (e.total_neto || 0), 0)
  const pendiente = totalEstimado - totalPagado

  const montoTotalArchivo = lineasValidadas.reduce((sum, l) => sum + (l.importe_periodo || 0), 0)

  return (
    <div>
      <div className="text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-emerald-600">Mis contratos</Link>
        <span className="mx-2">/</span>
        <span>{contrato?.numero}</span>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Estimaciones</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{contrato?.numero}</h2>
          <p className="text-sm text-gray-500 mt-1">{contrato?.descripcion} {contrato?.spvs?.nombre && `· ${contrato.spvs.nombre}`}</p>
        </div>
        <div className="flex gap-2">
          {periodoAbierto && (
            <button
              onClick={handleAbrirModal}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              + Nueva estimación
            </button>
          )}
          <Link to="/" className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            ← Mis contratos
          </Link>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total estimado</p>
          <p className="text-xl font-semibold text-gray-900">{formatMXN(totalEstimado)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total pagado</p>
          <p className="text-xl font-semibold text-green-700">{formatMXN(totalPagado)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Pendiente</p>
          <p className="text-xl font-semibold text-amber-600">{formatMXN(pendiente)}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">No.</th>
              <th className="text-left px-4 py-2 font-medium">Fecha</th>
              <th className="text-right px-4 py-2 font-medium">Monto</th>
              <th className="text-left px-4 py-2 font-medium">Factura</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {estimaciones.length === 0 && (
              <tr><td colSpan={6} className="text-center py-8 text-gray-400">No hay estimaciones registradas.</td></tr>
            )}
            {estimaciones.map(e => {
              const estado = estadoEfectivo(e)
              return (
                <tr key={e.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{e.numero_estimacion}</td>
                  <td className="px-4 py-3 text-gray-600">{formatFecha(e.fecha_pago || e.fecha_factura || e.created_at)}</td>
                  <td className="px-4 py-3 text-right font-medium text-gray-900">{formatMXN(e.total_neto)}</td>
                  <td className="px-4 py-3 text-gray-600">
                    {e.numero_factura || '—'}
                    {e.fecha_factura && <div className="text-xs text-gray-400">{formatFecha(e.fecha_factura)}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[estado] || 'bg-gray-100 text-gray-600'}`}>
                      {ESTADO_LABELS[estado] || estado}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <Link
                      to={`/contrato/${id}/estimacion/${e.id}`}
                      className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600"
                    >
                      Ver estimación
                    </Link>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">Nueva estimación</h3>
              <button onClick={handleCerrarModal} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
            </div>

            <div className="flex border-b border-gray-100">
              {['Exportar plantilla', 'Subir Excel'].map((label, i) => (
                <div key={label}
                  className={`flex-1 py-3 text-sm font-medium text-center ${modalPaso === i + 1 ? 'text-emerald-600 border-b-2 border-emerald-600' : 'text-gray-400'}`}>
                  {i + 1}. {label}
                </div>
              ))}
            </div>

            <div className="p-6 space-y-4">
              {cargandoModal ? (
                <div className="text-center py-12 text-gray-400 text-sm">Cargando catálogo...</div>
              ) : (
                <>
                  {modalPaso === 1 && (
                    <>
                      <div className="bg-gray-50 border border-gray-100 rounded-lg px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">Periodo {periodoAbierto?.label}</p>
                        <p className="text-xs text-gray-500">{formatFecha(periodoAbierto?.fecha_inicio)} — {formatFecha(periodoAbierto?.fecha_fin)}</p>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-sm font-medium text-gray-600 block mb-1">Fecha inicio de ejecución *</label>
                          <input type="date" required
                            value={fechaInicioEjec}
                            onChange={e => setFechaInicioEjec(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-emerald-400" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-gray-600 block mb-1">Fecha fin de ejecución *</label>
                          <input type="date" required
                            value={fechaFinEjec}
                            onChange={e => setFechaFinEjec(e.target.value)}
                            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-base focus:outline-none focus:border-emerald-400" />
                        </div>
                      </div>

                      <button
                        onClick={handleDescargarPlantilla}
                        disabled={descargando}
                        className="w-full px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40"
                      >
                        {descargando ? 'Generando...' : '⬇ Descargar plantilla Excel'}
                      </button>

                      <p className="text-xs text-gray-500">
                        Llena la columna <span className="font-medium text-emerald-700">"Cantidad Esta Estimacion"</span> y sube el archivo.
                      </p>
                    </>
                  )}

                  {modalPaso === 2 && (
                    <>
                      {creadoOk ? (
                        <div className="bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-lg px-4 py-3">
                          Estimación creada como borrador correctamente.
                        </div>
                      ) : (
                        <>
                          <div
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition-colors"
                          >
                            <p className="text-sm text-gray-600">Arrastra aquí el Excel llenado o haz clic para buscarlo</p>
                            <p className="text-xs text-gray-400 mt-1">.xlsx</p>
                            <input
                              ref={fileInputRef}
                              type="file"
                              accept=".xlsx,.xls"
                              className="hidden"
                              onChange={handleFileInputChange}
                            />
                          </div>

                          {uploadErrors.length > 0 && (
                            <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
                              <p className="text-sm font-medium text-red-700 mb-2">Se encontraron errores:</p>
                              <ul className="space-y-1">
                                {uploadErrors.map((err, i) => (
                                  <li key={i} className="text-xs text-red-600">• {err}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {uploadErrors.length === 0 && lineasValidadas.length > 0 && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
                              <p className="text-sm font-medium text-emerald-700 mb-2">Archivo válido</p>
                              <div className="grid grid-cols-2 gap-3">
                                <div>
                                  <p className="text-xs text-gray-500">Total de conceptos</p>
                                  <p className="text-lg font-semibold text-gray-900">{lineasValidadas.length}</p>
                                </div>
                                <div>
                                  <p className="text-xs text-gray-500">Monto total</p>
                                  <p className="text-lg font-semibold text-gray-900">{formatMXN(montoTotalArchivo)}</p>
                                </div>
                              </div>
                            </div>
                          )}

                          {errorCrear && (
                            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">{errorCrear}</div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-between px-6 py-4 border-t border-gray-100">
              <button onClick={handleCerrarModal} className="text-sm text-gray-500 hover:text-gray-700">
                {creadoOk ? 'Cerrar' : 'Cancelar'}
              </button>
              <div className="flex gap-2">
                {modalPaso === 2 && !creadoOk && (
                  <button onClick={() => setModalPaso(1)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50">
                    Atrás
                  </button>
                )}
                {modalPaso === 1 && (
                  <button onClick={() => setModalPaso(2)} disabled={cargandoModal || !fechaInicioEjec || !fechaFinEjec}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                    Siguiente →
                  </button>
                )}
                {modalPaso === 2 && !creadoOk && uploadErrors.length === 0 && lineasValidadas.length > 0 && (
                  <button onClick={handleCrearEstimacion} disabled={creando}
                    className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">
                    {creando ? 'Creando...' : 'Crear estimación'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
