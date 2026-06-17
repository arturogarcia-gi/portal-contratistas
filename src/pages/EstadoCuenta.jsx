import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const IVA_RATE = 0.16

function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

function formatFecha(f) {
  if (!f) return '—'
  return new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

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
}

export default function EstadoCuenta() {
  const { id } = useParams()
  const [contrato, setContrato] = useState(null)
  const [movimientos, setMovimientos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const { data: contratoData, error: contratoError } = await supabase
          .from('contratos')
          .select('numero, descripcion, monto_original, spvs(nombre)')
          .eq('id', id)
          .single()
        if (contratoError) throw contratoError

        const { data: estimaciones, error: estError } = await supabase
          .from('estimaciones')
          .select('id, numero_estimacion, total_neto, subtotal, iva, fondo_garantia, amortizacion_anticipo, estado, numero_factura, fecha_factura, fecha_pago, created_at')
          .eq('contrato_id', id)
        if (estError) throw estError

        const { data: anticipos, error: antError } = await supabase
          .from('anticipos')
          .select('id, folio, monto, estado, numero_factura, fecha_autorizacion, fecha_pago, created_at')
          .eq('contrato_id', id)
        if (antError) throw antError

        const { data: fondos, error: fonError } = await supabase
          .from('fondos_garantia')
          .select('id, folio, monto, estado, numero_factura, fecha_autorizacion, fecha_pago, created_at')
          .eq('contrato_id', id)
        if (fonError) throw fonError

        const filasEstimaciones = (estimaciones || []).map(e => ({
          id: `est-${e.id}`,
          tipo: 'Estimación',
          concepto: `Estimación ${e.numero_estimacion}`,
          fechaFactura: e.fecha_factura,
          numeroFactura: e.numero_factura,
          montoEst: (e.subtotal || 0) + (e.iva || 0),
          subtotal: e.subtotal,
          iva: e.iva,
          total: e.total_neto,
          fechaPago: e.fecha_pago,
          estado: e.fecha_pago ? 'pagada' : e.estado,
          orden: e.created_at,
        }))

        const filasAnticipos = (anticipos || []).map(a => ({
          id: `ant-${a.id}`,
          tipo: 'Anticipo',
          concepto: `Anticipo${a.folio ? ' ' + a.folio : ''}`,
          fechaFactura: a.fecha_autorizacion,
          numeroFactura: a.numero_factura,
          montoEst: null,
          subtotal: a.monto,
          iva: (a.monto || 0) * IVA_RATE,
          total: (a.monto || 0) * (1 + IVA_RATE),
          fechaPago: a.fecha_pago,
          estado: a.fecha_pago ? 'pagada' : a.estado,
          orden: a.created_at,
        }))

        const filasFondos = (fondos || []).map(f => ({
          id: `fon-${f.id}`,
          tipo: 'Fondo de garantía',
          concepto: `Fondo de garantía${f.folio ? ' ' + f.folio : ''}`,
          fechaFactura: f.fecha_autorizacion,
          numeroFactura: f.numero_factura,
          montoEst: null,
          subtotal: f.monto,
          iva: (f.monto || 0) * IVA_RATE,
          total: (f.monto || 0) * (1 + IVA_RATE),
          fechaPago: f.fecha_pago,
          estado: f.fecha_pago ? 'pagada' : f.estado,
          orden: f.created_at,
        }))

        const todas = [...filasEstimaciones, ...filasAnticipos, ...filasFondos]
          .sort((a, b) => new Date(a.orden) - new Date(b.orden))

        setContrato(contratoData)
        setMovimientos(todas)
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    }, 0)
    return () => clearTimeout(t)
  }, [id])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>

  const totalEstimado = movimientos.reduce((acc, m) => acc + (m.total || 0), 0)
  const totalPagado = movimientos.filter(m => m.estado === 'pagada').reduce((acc, m) => acc + (m.total || 0), 0)
  const pendiente = totalEstimado - totalPagado

  return (
    <div>
      <div className="text-sm text-gray-500 mb-4">
        <Link to="/" className="hover:text-emerald-600">Mis contratos</Link>
        <span className="mx-2">/</span>
        <span>{contrato?.numero}</span>
        <span className="mx-2">/</span>
        <span className="text-gray-900 font-medium">Estado de cuenta</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900">{contrato?.numero}</h2>
          <p className="text-sm text-gray-500 mt-1">{contrato?.descripcion} {contrato?.spvs?.nombre && `· ${contrato.spvs.nombre}`}</p>
        </div>
        <Link to="/" className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
          ← Mis contratos
        </Link>
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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500 uppercase">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Tipo</th>
              <th className="text-left px-4 py-2 font-medium">Concepto</th>
              <th className="text-left px-4 py-2 font-medium">Fecha Fact.</th>
              <th className="text-left px-4 py-2 font-medium">No. Factura</th>
              <th className="text-right px-4 py-2 font-medium">Monto Est.</th>
              <th className="text-right px-4 py-2 font-medium">Subtotal</th>
              <th className="text-right px-4 py-2 font-medium">IVA</th>
              <th className="text-right px-4 py-2 font-medium">Total</th>
              <th className="text-left px-4 py-2 font-medium">Fecha Pago</th>
              <th className="text-left px-4 py-2 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {movimientos.length === 0 && (
              <tr><td colSpan={10} className="text-center py-8 text-gray-400">No hay movimientos registrados.</td></tr>
            )}
            {movimientos.map(m => (
              <tr key={m.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.tipo}</td>
                <td className="px-4 py-3 text-gray-900 font-medium whitespace-nowrap">{m.concepto}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatFecha(m.fechaFactura)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{m.numeroFactura || '—'}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{m.montoEst === null ? '—' : formatMXN(m.montoEst)}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{formatMXN(m.subtotal)}</td>
                <td className="px-4 py-3 text-right text-gray-600 whitespace-nowrap">{formatMXN(m.iva)}</td>
                <td className="px-4 py-3 text-right font-medium text-gray-900 whitespace-nowrap">{formatMXN(m.total)}</td>
                <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{formatFecha(m.fechaPago)}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${ESTADO_COLORS[m.estado] || 'bg-gray-100 text-gray-600'}`}>
                    {ESTADO_LABELS[m.estado] || m.estado}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
