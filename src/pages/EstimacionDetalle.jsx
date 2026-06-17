import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

function formatFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  return `${d}/${meses[parseInt(m) - 1]}/${y}`
}

const ESTADO_COLORS = {
  borrador: 'bg-gray-50 text-gray-600',
  pendiente: 'bg-amber-50 text-amber-700',
  pendiente_revision: 'bg-blue-50 text-blue-600',
  en_revision: 'bg-blue-50 text-blue-700',
  confirmada: 'bg-emerald-50 text-emerald-700',
  autorizada: 'bg-emerald-50 text-emerald-700',
  rechazada: 'bg-red-50 text-red-700',
  rechazada_auditoria: 'bg-red-50 text-red-700',
  en_correccion: 'bg-amber-100 text-amber-800',
  correo_enviado: 'bg-purple-50 text-purple-700',
  pagada: 'bg-green-50 text-green-700',
  cancelada: 'bg-red-100 text-red-900',
}

const ESTADO_LABELS = {
  borrador: 'Borrador',
  pendiente: 'Pendiente',
  pendiente_revision: 'Pendiente revisión',
  en_revision: 'En revisión',
  confirmada: 'Confirmada',
  autorizada: 'Autorizada',
  rechazada: 'Rechazada',
  rechazada_auditoria: 'Rechazada por auditoría',
  en_correccion: 'En corrección',
  correo_enviado: 'Correo enviado',
  pagada: 'Pagada',
  cancelada: 'Cancelada',
}

export default function EstimacionDetalle() {
  const { id, estimacionId } = useParams()
  const navigate = useNavigate()
  const [estimacion, setEstimacion] = useState(null)
  const [lineas, setLineas] = useState([])
  const [conceptos, setConceptos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [cambiandoEstado, setCambiandoEstado] = useState(false)
  const [eventoCancelacion, setEventoCancelacion] = useState(null)

  const fetchDatos = useCallback(async () => {
    try {
      const { data: est, error: estError } = await supabase
        .from('estimaciones')
        .select('*, contratos(*, contratistas(nombre), spvs(nombre)), periodos(label, id, contrato_id)')
        .eq('id', estimacionId)
        .maybeSingle()
      if (estError) throw estError
      if (!est) {
        setError('Estimación no encontrada o sin acceso')
        return
      }
      setEstimacion(est)

      const { data: lins, error: linsError } = await supabase
        .from('estimacion_lineas')
        .select('*')
        .eq('estimacion_id', estimacionId)
        .order('created_at')
      if (linsError) throw linsError
      setLineas(lins || [])

      const { data: cats, error: catsError } = await supabase
        .from('conceptos')
        .select('id, clave, clave_concepto, descripcion, tipo, jerarquia, orden')
        .eq('contrato_id', id)
        .order('orden', { ascending: true })
      if (catsError) throw catsError
      setConceptos(cats || [])

      if (est.estado === 'cancelada') {
        const { data: ev } = await supabase
          .from('aprobacion_eventos')
          .select('comentario, usuario_nombre')
          .eq('estimacion_id', estimacionId)
          .eq('paso', 'cancelada')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        setEventoCancelacion(ev)
      } else {
        setEventoCancelacion(null)
      }
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, estimacionId])

  useEffect(() => {
    const t = setTimeout(() => fetchDatos(), 0)
    return () => clearTimeout(t)
  }, [fetchDatos])

  async function handleEnviarRevision() {
    if (!window.confirm('¿Enviar esta estimación a revisión?')) return
    setCambiandoEstado(true)
    try {
      const { error: updError } = await supabase
        .from('estimaciones')
        .update({ estado: 'en_revision' })
        .eq('id', estimacionId)
      if (updError) throw updError
      navigate(`/contrato/${id}/estimaciones`)
    } catch (e) {
      setError(e.message)
    } finally {
      setCambiandoEstado(false)
    }
  }

  async function handleCancelar() {
    if (!window.confirm('¿Cancelar esta estimación? Esta acción no se puede deshacer.')) return
    setCambiandoEstado(true)
    try {
      const { error: updError } = await supabase
        .from('estimaciones')
        .update({ estado: 'cancelada' })
        .eq('id', estimacionId)
      if (updError) throw updError
      navigate(`/contrato/${id}/estimaciones`)
    } catch (e) {
      setError(e.message)
    } finally {
      setCambiandoEstado(false)
    }
  }

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
  if (!estimacion) return <div className="text-center py-12 text-gray-400 text-sm">{error || 'Estimación no encontrada.'}</div>

  const contrato = estimacion.contratos
  const valorEstimacion = estimacion.subtotal
  const amortizacion = estimacion.amortizacion_anticipo
  const fondoGarantia = estimacion.fondo_garantia
  const subtotal = valorEstimacion - amortizacion - fondoGarantia
  const iva = estimacion.iva
  const totalNeto = estimacion.total_neto
  const tieneEjecucion = estimacion.fecha_inicio_ejecucion && estimacion.fecha_fin_ejecucion

  return (
    <div>
      <div className="text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-emerald-600">Mis contratos</Link>
        <span className="mx-2">/</span>
        <Link to={`/contrato/${id}/estimaciones`} className="hover:text-emerald-600">{contrato?.numero}</Link>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">{estimacion.folio}</span>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[estimacion.estado]}`}>
              {ESTADO_LABELS[estimacion.estado]}
            </span>
            <span className="px-2 py-1 bg-gray-100 text-gray-600 rounded-full text-xs">{estimacion.periodos?.label}</span>
            {!tieneEjecucion && (
              <span className="px-2 py-1 bg-amber-50 text-amber-600 rounded-full text-xs">⚠️ Sin período de ejecución</span>
            )}
          </div>
          <h2 className="text-xl font-semibold text-gray-900 font-mono">{estimacion.folio}</h2>
          <p className="text-sm text-gray-500 mt-1">{contrato?.numero} · {contrato?.contratistas?.nombre}</p>
          {tieneEjecucion && (
            <p className="text-xs text-gray-500 mt-1">
              Ejecución: {formatFecha(estimacion.fecha_inicio_ejecucion)} — {formatFecha(estimacion.fecha_fin_ejecucion)}
            </p>
          )}
          {estimacion.estado === 'pagada' && estimacion.fecha_pago && (
            <p className="text-xs text-green-600 mt-1 font-medium">✓ Pagada el {formatFecha(estimacion.fecha_pago)}</p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap justify-end">
          <Link to={`/contrato/${id}/estimacion/${estimacionId}/caratula`}
            className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
            🖨️ Ver carátula
          </Link>
          {estimacion.estado === 'borrador' && (
            <button onClick={handleEnviarRevision} disabled={cambiandoEstado}
              className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40">
              Enviar a revisión
            </button>
          )}
          {['borrador', 'en_revision'].includes(estimacion.estado) && (
            <button onClick={handleCancelar} disabled={cambiandoEstado}
              className="px-4 py-2 text-sm border border-red-300 text-red-700 rounded-lg hover:bg-red-50 disabled:opacity-40">
              Cancelar
            </button>
          )}
        </div>
      </div>

      {(estimacion.estado === 'rechazada' || estimacion.estado === 'rechazada_auditoria') && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-red-800">
            {estimacion.estado === 'rechazada' ? '❌ Estimación rechazada definitivamente' : '❌ Rechazada por auditoría'}
          </p>
        </div>
      )}

      {estimacion.estado === 'en_correccion' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-amber-800">↩ Estimación devuelta para corrección</p>
          <p className="text-xs text-amber-700 mt-1">El folio fue invalidado. Contacta a Generación Industrial para conocer los siguientes pasos.</p>
        </div>
      )}

      {estimacion.estado === 'cancelada' && (
        <div className="bg-red-100 border border-red-300 rounded-xl p-4 mb-6">
          <p className="text-sm font-medium text-red-900">🚫 Estimación cancelada</p>
          {eventoCancelacion && (
            <p className="text-xs text-red-800 mt-1">
              {eventoCancelacion.comentario} — por {eventoCancelacion.usuario_nombre}
            </p>
          )}
        </div>
      )}

      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 mb-6 flex items-center justify-between">
        <div>
          <p className="text-xs text-emerald-600 font-medium mb-1">Folio de validación</p>
          <p className="text-2xl font-mono font-bold text-emerald-700">{estimacion.folio}</p>
          <p className="text-xs text-emerald-500 mt-1">Anota este folio en tu carátula física</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-emerald-600 mb-1">Generado</p>
          <p className="text-sm text-emerald-700">{new Date(estimacion.created_at).toLocaleDateString('es-MX')}</p>
        </div>
      </div>

      {/* Datos de facturación */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 mb-6">
        <h3 className="font-medium text-gray-900 text-sm mb-3">Datos de facturación</h3>
        <div className="flex items-center gap-8 flex-wrap">
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">No. Factura:</span>
            <span className="text-xs font-medium text-gray-800">{estimacion.numero_factura || '—'}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500">Fecha factura:</span>
            <span className="text-xs font-medium text-gray-800">{formatFecha(estimacion.fecha_factura)}</span>
          </div>
          {estimacion.fecha_pago && (
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-500">Fecha pago:</span>
              <span className="text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded px-2 py-1">
                {formatFecha(estimacion.fecha_pago)}
              </span>
            </div>
          )}
          {(estimacion.numero_factura || estimacion.fecha_factura) && (
            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded-full text-xs font-medium">
              ✓ Factura registrada
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Valor de Estimación</p>
          <p className="text-lg font-semibold text-gray-900">{formatMXN(valorEstimacion)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Subtotal</p>
          <p className="text-lg font-semibold text-gray-900">{formatMXN(subtotal)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">IVA 16%</p>
          <p className="text-lg font-semibold text-gray-700">{formatMXN(iva)}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-xs text-gray-500 mb-1">Total neto a pagar</p>
          <p className="text-lg font-semibold text-emerald-600">{formatMXN(totalNeto)}</p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-medium text-gray-900 text-sm mb-4">Desglose financiero</h3>
          <div className="space-y-2">
            {[
              ['Valor de Estimación', formatMXN(valorEstimacion), 'text-gray-900'],
              [`Amortización ${contrato?.pct_anticipo}%`, `−${formatMXN(amortizacion)}`, 'text-amber-600'],
              [`Fondo garantía ${contrato?.pct_fondo_garantia}%`, `−${formatMXN(fondoGarantia)}`, 'text-amber-600'],
            ].map(([label, value, color]) => (
              <div key={label} className="flex justify-between py-1 border-b border-gray-50">
                <span className="text-xs text-gray-500">{label}</span>
                <span className={`text-xs font-medium ${color}`}>{value}</span>
              </div>
            ))}
            <div className="flex justify-between py-1 border-b border-gray-200">
              <span className="text-xs font-medium text-gray-700">Subtotal</span>
              <span className="text-xs font-semibold text-gray-900">{formatMXN(subtotal)}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-gray-50">
              <span className="text-xs text-gray-500">IVA 16%</span>
              <span className="text-xs font-medium text-gray-700">{formatMXN(iva)}</span>
            </div>
            <div className="flex justify-between pt-2">
              <span className="text-xs font-semibold text-gray-900">Total neto</span>
              <span className="text-sm font-bold text-emerald-600">{formatMXN(totalNeto)}</span>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 col-span-2">
          <h3 className="font-medium text-gray-900 text-sm mb-4">Datos de la estimación</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Contrato', contrato?.numero],
              ['Contratista', contrato?.contratistas?.nombre],
              ['SPV', `${contrato?.spv_id} · ${contrato?.spvs?.nombre}`],
              ['Periodo', estimacion.periodos?.label],
              ['No. Estimación', `#${estimacion.numero_estimacion}`],
              ['Fecha', new Date(estimacion.created_at).toLocaleDateString('es-MX')],
              ['Ejecución inicio', formatFecha(estimacion.fecha_inicio_ejecucion)],
              ['Ejecución fin', formatFecha(estimacion.fecha_fin_ejecucion)],
            ].map(([label, value]) => (
              <div key={label}>
                <p className="text-xs text-gray-500">{label}</p>
                <p className="text-sm font-medium text-gray-800">{value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100">
          <h3 className="font-medium text-gray-900 text-sm">Conceptos estimados ({lineas.length})</h3>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Clave</th>
              <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Descripción</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Cant. periodo</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">PU</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Val. PU</th>
              <th className="text-center px-4 py-3 text-xs font-medium text-gray-500">Val. Vol.</th>
              <th className="text-right px-4 py-3 text-xs font-medium text-gray-500">Importe</th>
            </tr>
          </thead>
          <tbody>
            {(() => {
              if (conceptos.length === 0) {
                return lineas.map((l) => (
                  <tr key={l.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{l.clave}</td>
                    <td className="px-4 py-2 text-gray-800 text-xs">{l.descripcion}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{Number(l.cantidad_periodo).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatMXN(l.pu_cobrado)}</td>
                    <td className="px-4 py-2 text-center">
                      {l.validacion_pu === 'ok' && <span className="text-emerald-600 text-xs">✓</span>}
                      {l.validacion_pu === 'revisar' && <span className="text-amber-500 text-xs" title={`PU con diferencia. Contratado: ${formatMXN(l.pu_contratado)} · Cobrado: ${formatMXN(l.pu_cobrado)}`}>⚠️</span>}
                      {l.validacion_pu === 'fuera' && <span className="text-red-500 text-xs" title={`PU FUERA de contrato. Contratado: ${formatMXN(l.pu_contratado)} · Cobrado: ${formatMXN(l.pu_cobrado)}`}>✗</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {l.validacion_volumen === 'ok' && <span className="text-emerald-600 text-xs">✓</span>}
                      {l.validacion_volumen === 'limite' && <span className="text-amber-500 text-xs" title={`Volumen al límite. Contratado: ${l.cantidad_contratada} ${l.unidad} · Este periodo: ${l.cantidad_periodo}`}>⚠️</span>}
                      {l.validacion_volumen === 'excede' && <span className="text-red-500 text-xs" title={`EXCEDE volumen contratado. Contratado: ${l.cantidad_contratada} ${l.unidad} · Este periodo: ${l.cantidad_periodo}`}>✗</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMXN(l.importe_periodo)}</td>
                  </tr>
                ))
              }
              const agColors = ['#0A0A0A', '#0070C0', '#4472C4', '#C00000', '#375623', '#006666']
              const lineaById = {}
              const lineaByClave = {}
              lineas.forEach(l => {
                if (l.concepto_id) lineaById[l.concepto_id] = l
                if (l.clave) lineaByClave[l.clave] = l
              })
              const conceptosOrdenados = [...conceptos].sort((a, b) => {
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
              return conceptosOrdenados.map(concepto => {
                const nivel = (concepto.jerarquia?.match(/\./g) || []).length
                const indentPx = 16 + nivel * 16
                if (concepto.tipo === 'AG') {
                  const color = agColors[Math.min(nivel, 5)]
                  const importeAG = conceptosOrdenados
                    .filter(c => c.tipo === 'CO' && c.jerarquia && concepto.jerarquia && c.jerarquia.startsWith(concepto.jerarquia + '.'))
                    .reduce((sum, c) => {
                      const l = lineaById[c.id] || lineaByClave[c.clave_concepto] || lineaByClave[c.clave]
                      return sum + (l?.importe_periodo || 0)
                    }, 0)
                  return (
                    <tr key={concepto.id} className="border-b border-gray-100 bg-gray-50/50">
                      <td className="px-4 py-1.5 font-mono text-xs text-gray-400" style={{ paddingLeft: `${indentPx}px` }}>{concepto.jerarquia}</td>
                      <td className="px-4 py-1.5 text-xs font-bold" style={{ color, paddingLeft: '16px' }}>{concepto.descripcion}</td>
                      <td className="px-4 py-1.5 text-right text-gray-400 text-xs">—</td>
                      <td className="px-4 py-1.5 text-right text-gray-400 text-xs">—</td>
                      <td className="px-4 py-1.5 text-center text-gray-400 text-xs">—</td>
                      <td className="px-4 py-1.5 text-center text-gray-400 text-xs">—</td>
                      <td className="px-4 py-1.5 text-right font-semibold text-xs text-gray-700">{importeAG > 0 ? formatMXN(importeAG) : '—'}</td>
                    </tr>
                  )
                }
                const linea = lineaById[concepto.id] || lineaByClave[concepto.clave_concepto] || lineaByClave[concepto.clave]
                if (!linea) return null
                return (
                  <tr key={concepto.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600" style={{ paddingLeft: `${indentPx}px` }}>{linea.clave}</td>
                    <td className="px-4 py-2 text-gray-800 text-xs" style={{ paddingLeft: '16px' }}>{linea.descripcion}</td>
                    <td className="px-4 py-2 text-right text-gray-700">{Number(linea.cantidad_periodo).toLocaleString()}</td>
                    <td className="px-4 py-2 text-right text-gray-600">{formatMXN(linea.pu_cobrado)}</td>
                    <td className="px-4 py-2 text-center">
                      {linea.validacion_pu === 'ok' && <span className="text-emerald-600 text-xs">✓</span>}
                      {linea.validacion_pu === 'revisar' && <span className="text-amber-500 text-xs" title={`PU con diferencia. Contratado: ${formatMXN(linea.pu_contratado)} · Cobrado: ${formatMXN(linea.pu_cobrado)}`}>⚠️</span>}
                      {linea.validacion_pu === 'fuera' && <span className="text-red-500 text-xs" title={`PU FUERA de contrato. Contratado: ${formatMXN(linea.pu_contratado)} · Cobrado: ${formatMXN(linea.pu_cobrado)}`}>✗</span>}
                    </td>
                    <td className="px-4 py-2 text-center">
                      {linea.validacion_volumen === 'ok' && <span className="text-emerald-600 text-xs">✓</span>}
                      {linea.validacion_volumen === 'limite' && <span className="text-amber-500 text-xs" title={`Volumen al límite. Contratado: ${linea.cantidad_contratada} ${linea.unidad} · Este periodo: ${linea.cantidad_periodo}`}>⚠️</span>}
                      {linea.validacion_volumen === 'excede' && <span className="text-red-500 text-xs" title={`EXCEDE volumen contratado. Contratado: ${linea.cantidad_contratada} ${linea.unidad} · Este periodo: ${linea.cantidad_periodo}`}>✗</span>}
                    </td>
                    <td className="px-4 py-2 text-right font-medium text-gray-900">{formatMXN(linea.importe_periodo)}</td>
                  </tr>
                )
              })
            })()}
          </tbody>
          <tfoot>
            <tr className="bg-gray-50 border-t border-gray-200">
              <td colSpan={6} className="px-4 py-3 text-sm font-semibold text-gray-700 text-right">Valor de Estimación</td>
              <td className="px-4 py-3 text-right font-bold text-gray-900">{formatMXN(valorEstimacion)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
