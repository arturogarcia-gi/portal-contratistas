import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n || 0)
}

function formatFecha(f) {
  if (!f) return '—'
  const meses = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']
  const d = new Date(f + 'T12:00:00')
  return `${String(d.getDate()).padStart(2,'0')}-${meses[d.getMonth()]}-${String(d.getFullYear()).slice(2)}`
}

const IVA_PCT = 0.16

export default function EstadoCuenta() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [contrato, setContrato] = useState(null)
  const [estimaciones, setEstimaciones] = useState([])
  const [anticipos, setAnticipos] = useState([])
  const [fondos, setFondos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todos')

  const fetchData = useCallback(async () => {
    try {
      const [{ data: c, error: cError }, { data: e, error: eError }, { data: a, error: aError }, { data: f, error: fError }] = await Promise.all([
        supabase.from('contratos').select('*, contratistas(*), spvs(*)').eq('id', id).single(),
        supabase.from('estimaciones')
          .select('id, numero_estimacion, subtotal, fondo_garantia, amortizacion_anticipo, estado, numero_factura, fecha_factura, fecha_fin_ejecucion, fecha_pago, created_at')
          .eq('contrato_id', id)
          .not('estado', 'in', '(cancelada,rechazada,rechazada_auditoria)')
          .order('numero_estimacion', { ascending: true }),
        supabase.from('anticipos')
          .select('id, folio, monto, estado, numero_factura, fecha_autorizacion, fecha_pago, created_at')
          .eq('contrato_id', id)
          .order('created_at', { ascending: true }),
        supabase.from('fondos_garantia')
          .select('id, folio, monto, estado, numero_factura, fecha_autorizacion, fecha_pago, created_at')
          .eq('contrato_id', id)
          .order('created_at', { ascending: true }),
      ])
      if (cError) throw cError
      if (eError) throw eError
      if (aError) throw aError
      if (fError) throw fError
      setContrato(c)
      setEstimaciones(e || [])
      setAnticipos(a || [])
      setFondos(f || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    const t = setTimeout(() => fetchData(), 0)
    return () => clearTimeout(t)
  }, [fetchData])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>
  if (error) return <div className="text-center py-12 text-red-500 text-sm">{error}</div>
  if (!contrato) return <div className="text-center py-12 text-gray-400 text-sm">Contrato no encontrado.</div>

  const todasFilas = [
    ...estimaciones.map(e => ({
      tipo: 'Estimación',
      numero_factura: e.numero_factura || '—',
      referencia: `Est. #${e.numero_estimacion}`,
      monto_estimado: e.subtotal || 0,
      amort_anticipo: e.amortizacion_anticipo || 0,
      retencion_fondo: e.fondo_garantia || 0,
      estado: e.estado || 'borrador',
      fecha: e.fecha_factura || e.fecha_fin_ejecucion,
      fecha_pago: e.fecha_pago || null,
      path: `/contrato/${id}/estimacion/${e.id}`,
    })),
    ...anticipos.map(a => ({
      tipo: 'Anticipo',
      numero_factura: a.numero_factura || '—',
      referencia: 'Anticipo',
      monto_estimado: a.monto || 0,
      amort_anticipo: 0,
      retencion_fondo: 0,
      estado: a.estado || 'pendiente',
      fecha: a.fecha_autorizacion || a.created_at,
      fecha_pago: a.fecha_pago || null,
      path: null,
    })),
    ...fondos.map(f => ({
      tipo: 'Fondo Garantía',
      numero_factura: f.numero_factura || '—',
      referencia: 'Fondo de Garantía',
      monto_estimado: f.monto || 0,
      amort_anticipo: 0,
      retencion_fondo: 0,
      estado: f.estado || 'pendiente',
      fecha: f.fecha_autorizacion || f.created_at,
      fecha_pago: f.fecha_pago || null,
      path: null,
    })),
  ]

  const estados = ['todos', ...Array.from(new Set(todasFilas.map(f => f.estado)))]

  const filasFiltradas = filtroEstado === 'todos'
    ? todasFilas
    : todasFilas.filter(f => f.estado === filtroEstado)

  const totalMonto = filasFiltradas
    .filter(f => f.tipo === 'Estimación')
    .reduce((s, f) => s + f.monto_estimado, 0)
  const totalAmort = filasFiltradas
    .filter(f => f.tipo === 'Estimación')
    .reduce((s, f) => s + f.amort_anticipo, 0)
  const totalFondo = filasFiltradas
    .filter(f => f.tipo === 'Estimación')
    .reduce((s, f) => s + f.retencion_fondo, 0)
  const totalSubtotal = filasFiltradas.reduce((s, f) =>
    f.tipo === 'Estimación'
      ? s + (f.monto_estimado - f.amort_anticipo - f.retencion_fondo)
      : s + f.monto_estimado
  , 0)
  const totalIVA = totalSubtotal * IVA_PCT
  const totalNeto = totalSubtotal + totalIVA

  const nombreSpv = (contrato.spvs?.razon_social || '').replace(/\s*(S\.\s?A\.|A\.C\.|S\.C\.).*$/i, '').trim() || 'Generación Industrial Monterrey'

  const BADGE = {
    autorizada: 'bg-emerald-50 text-emerald-700',
    pagada: 'bg-blue-50 text-blue-700',
    enviada: 'bg-amber-50 text-amber-700',
    revision: 'bg-purple-50 text-purple-700',
    borrador: 'bg-gray-100 text-gray-500',
    pendiente: 'bg-yellow-50 text-yellow-700',
    cancelada: 'bg-red-50 text-red-600',
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6 print:hidden">
        <button onClick={() => navigate('/')} className="text-sm text-gray-400 hover:text-gray-600">Mis contratos</button>
        <span className="text-gray-300">/</span>
        <button onClick={() => navigate(`/contrato/${id}/estimaciones`)} className="text-sm text-gray-400 hover:text-gray-600">{contrato.numero}</button>
        <span className="text-gray-300">/</span>
        <span className="text-sm text-gray-700 font-medium">Estado de Cuenta</span>
      </div>

      <div className="flex items-start justify-between mb-6 print:hidden">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">Estado de Cuenta</h2>
          <p className="text-sm text-gray-500 mt-1">{contrato.numero} · {contrato.contratistas?.nombre}</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filtroEstado}
            onChange={e => setFiltroEstado(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-emerald-400 capitalize"
          >
            {estados.map(s => (
              <option key={s} value={s} className="capitalize">{s === 'todos' ? 'Todos los estados' : s}</option>
            ))}
          </select>
          <button onClick={() => window.print()} className="px-4 py-1.5 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
            🖨️ Imprimir
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">

        {/* Header impresión */}
        <div className="hidden print:block px-8 pt-6 pb-4 border-b border-gray-200">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-1">{nombreSpv}</p>
              <h1 className="text-lg font-bold text-gray-900">Estado de Cuenta</h1>
              <p className="text-sm text-gray-600 mt-0.5">{contrato.numero} · {contrato.descripcion}</p>
            </div>
            <div className="text-right text-xs text-gray-500 space-y-1">
              <p><span className="font-medium">Contratista:</span> {contrato.contratistas?.nombre}</p>
              <p><span className="font-medium">RFC:</span> {contrato.contratistas?.rfc || '—'}</p>
              <p><span className="font-medium">Proyecto:</span> {contrato.spvs?.nombre}</p>
              <p><span className="font-medium">Monto contrato:</span> {formatMXN(contrato.monto_original)}</p>
              <p><span className="font-medium">Fecha impresión:</span> {formatFecha(new Date().toISOString().split('T')[0])}</p>
            </div>
          </div>
        </div>

        {/* Tarjetas resumen */}
        <div className="grid grid-cols-4 gap-4 p-5 border-b border-gray-100 print:hidden">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Total estimado</p>
            <p className="text-base font-semibold text-gray-900">{formatMXN(totalMonto)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">Subtotal neto</p>
            <p className="text-base font-semibold text-gray-900">{formatMXN(totalSubtotal)}</p>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500 mb-1">IVA (16%)</p>
            <p className="text-base font-semibold text-gray-900">{formatMXN(totalIVA)}</p>
          </div>
          <div className="bg-emerald-50 rounded-lg p-3">
            <p className="text-xs text-emerald-600 mb-1">Total con IVA</p>
            <p className="text-base font-semibold text-emerald-700">{formatMXN(totalNeto)}</p>
          </div>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="text-left px-4 py-3 font-medium text-gray-500">Tipo</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">No. Factura</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500 print:hidden">Fecha Fact.</th>
                <th className="text-left px-4 py-3 font-medium text-gray-500">Concepto</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Monto Estimado</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Amort. Anticipo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Ret. Fondo</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Subtotal</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">IVA</th>
                <th className="text-right px-4 py-3 font-medium text-gray-500">Total</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500">Fecha Pago</th>
                <th className="text-center px-4 py-3 font-medium text-gray-500 print:hidden">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filasFiltradas.length === 0 ? (
                <tr>
                  <td colSpan={12} className="text-center py-10 text-gray-400">
                    No hay registros {filtroEstado !== 'todos' ? `con estado "${filtroEstado}"` : ''}
                  </td>
                </tr>
              ) : (
                filasFiltradas.map((fila, i) => {
                  const subtotal = fila.tipo === 'Estimación'
                    ? fila.monto_estimado - fila.amort_anticipo - fila.retencion_fondo
                    : fila.monto_estimado
                  const iva = subtotal * IVA_PCT
                  const total = subtotal + iva
                  return (
                    <tr
                      key={i}
                      onClick={() => fila.path && navigate(fila.path)}
                      className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${fila.path ? 'cursor-pointer' : ''} ${i % 2 === 0 ? '' : 'bg-gray-50/40'}`}
                    >
                      <td className="px-4 py-2.5">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          fila.tipo === 'Estimación' ? 'bg-emerald-50 text-emerald-700' :
                          fila.tipo === 'Anticipo' ? 'bg-blue-50 text-blue-700' :
                          'bg-orange-50 text-orange-700'
                        }`}>{fila.tipo}</span>
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 font-mono">{fila.numero_factura}</td>
                      <td className="px-4 py-2.5 text-gray-500 print:hidden">{formatFecha(fila.fecha?.split('T')[0])}</td>
                      <td className="px-4 py-2.5 text-gray-700">{fila.referencia}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800 font-medium">
                        {fila.tipo === 'Estimación' ? formatMXN(fila.monto_estimado) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-right text-red-500">{fila.amort_anticipo ? `(${formatMXN(fila.amort_anticipo)})` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-red-500">{fila.retencion_fondo ? `(${formatMXN(fila.retencion_fondo)})` : '—'}</td>
                      <td className="px-4 py-2.5 text-right text-gray-800">{formatMXN(subtotal)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-600">{formatMXN(iva)}</td>
                      <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatMXN(total)}</td>
                      <td className="px-4 py-2.5 text-center text-gray-600 text-xs">
                        {fila.fecha_pago ? formatFecha(fila.fecha_pago.split('T')[0]) : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-center print:hidden">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${fila.fecha_pago ? 'bg-blue-50 text-blue-700' : (BADGE[fila.estado] || 'bg-gray-100 text-gray-500')}`}>
                          {fila.fecha_pago ? 'Pagado' : fila.estado}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
            {filasFiltradas.length > 0 && (
              <tfoot>
                <tr className="bg-gray-900 text-white">
                  <td colSpan={4} className="px-4 py-3 font-semibold text-sm print:hidden">
                    TOTALES ({filasFiltradas.length} registro{filasFiltradas.length !== 1 ? 's' : ''})
                  </td>
                  <td colSpan={3} className="hidden print:table-cell px-4 py-3 font-semibold text-sm">
                    TOTALES ({filasFiltradas.length} registro{filasFiltradas.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMXN(totalMonto)}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-300">{totalAmort ? `(${formatMXN(totalAmort)})` : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-red-300">{totalFondo ? `(${formatMXN(totalFondo)})` : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMXN(totalSubtotal)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatMXN(totalIVA)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-300 text-sm">{formatMXN(totalNeto)}</td>
                  <td className="print:hidden" />
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Footer impresión */}
        <div className="hidden print:flex justify-between items-center px-8 py-4 border-t border-gray-200 mt-4">
          <p className="text-xs text-gray-400">GI MTY · {contrato.spvs?.nombre}</p>
        </div>

        {/* Firmas impresión */}
        <div className="hidden print:block px-8 pt-6 pb-8">
          {(() => {
            const firmantes = [
              {
                titulo: 'Contratista',
                nombre: contrato.firmante_contratista || '',
                empresa: contrato.contratistas?.razon_social || contrato.contratistas?.nombre || '',
                show: true,
              },
              {
                titulo: 'Project Manager',
                nombre: contrato.spvs?.project_manager || '',
                empresa: contrato.spvs?.razon_social || '',
                show: true,
              },
              {
                titulo: 'Supervisión Socio',
                nombre: contrato.spvs?.supervision_socio || '',
                empresa: contrato.spvs?.razon_social || '',
                show: contrato.spvs?.tiene_supervision_socio === true,
              },
              {
                titulo: 'Interventora',
                nombre: contrato.spvs?.nombre_interventora || '',
                empresa: contrato.spvs?.nombre_interventora || '',
                show: contrato.spvs?.tiene_interventora === true,
              },
            ].filter(f => f.show)
            return (
              <div className="grid gap-8 mt-8" style={{ gridTemplateColumns: `repeat(${firmantes.length}, minmax(0, 1fr))` }}>
                {firmantes.map(f => (
                  <div key={f.titulo} className="text-center">
                    <div className="border-t border-gray-400 pt-3 mt-12">
                      <p className="text-xs font-semibold text-gray-700">{f.titulo}</p>
                      {f.nombre && <p className="text-xs text-gray-500 mt-0.5">{f.nombre}</p>}
                      {f.empresa && f.empresa !== f.nombre && <p className="text-xs text-gray-400 mt-0.5">{f.empresa}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )
          })()}
        </div>
      </div>

      <style>{`
        @media print {
          @page { size: letter landscape; margin: 1cm; }
          .print\\:hidden { display: none !important; }
          body { background: white; }
          nav, header { display: none !important; }
          table { font-size: 8px !important; }
          th, td { padding: 3px 4px !important; }
        }
      `}</style>
    </div>
  )
}
