import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
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

const FIRMANTES = [
  { cargo: 'Gte. Control de Proyectos', nombre: 'Ing. Arturo García' },
  { cargo: 'Director de Operaciones', nombre: 'Ing. Jorge Batarse' },
  { cargo: 'Gte. Ingeniería y Proyectos', nombre: 'Ing. Rubén Treviño' },
]

export default function CaratulaEstimacion() {
  const { id, estimacionId } = useParams()
  const navigate = useNavigate()
  const [estimacion, setEstimacion] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDatos = useCallback(async () => {
    try {
      const { data, error: estError } = await supabase
        .from('estimaciones')
        .select('*, contratos(*, contratistas(nombre, razon_social), spvs(nombre, razon_social)), periodos(label, fecha_inicio, fecha_fin)')
        .eq('id', estimacionId)
        .maybeSingle()
      if (estError) throw estError
      if (!data) {
        setError('Estimación no encontrada o sin acceso')
        return
      }
      setEstimacion(data)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [estimacionId])

  useEffect(() => {
    const t = setTimeout(() => fetchDatos(), 0)
    return () => clearTimeout(t)
  }, [fetchDatos])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando carátula...</div>
  if (!estimacion) return <div className="text-center py-12 text-gray-400 text-sm">{error || 'Estimación no encontrada.'}</div>

  const contrato = estimacion.contratos
  const contratista = contrato?.contratistas
  const valorEstimacion = estimacion.subtotal
  const amortizacion = estimacion.amortizacion_anticipo
  const fondoGarantia = estimacion.fondo_garantia
  const subtotal = valorEstimacion - amortizacion - fondoGarantia
  const iva = estimacion.iva
  const totalNeto = estimacion.total_neto
  const urlEstimacion = `${window.location.origin}/contrato/${id}/estimacion/${estimacionId}/caratula`
  const tieneEjecucion = estimacion.fecha_inicio_ejecucion && estimacion.fecha_fin_ejecucion
  const nombreContratista = contratista?.razon_social || contratista?.nombre || '—'

  return (
    <div>
      <div className="flex gap-3 mb-3 print:hidden">
        <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
          ← Regresar
        </button>
        <button onClick={() => window.print()} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div className="max-w-2xl mx-auto mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 print:hidden">
        <p className="text-xs font-semibold text-blue-800 mb-1">⚙️ Al imprimir, configura lo siguiente en Chrome:</p>
        <div className="grid grid-cols-3 gap-2 text-xs text-blue-700">
          <span>• Márgenes → <strong>Ninguno</strong></span>
          <span>• Encabezados y pies → <strong>Desactivar</strong></span>
          <span>• Para PDF → <strong>Guardar como PDF</strong></span>
        </div>
      </div>

      <div className="bg-white border border-gray-300 rounded-xl max-w-2xl mx-auto p-5 print:border-0 print:rounded-none print:max-w-full print:p-0 print:mx-0">

        <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
          <h1 className="text-lg font-bold text-gray-900 uppercase tracking-wide">Generación Industrial MTY</h1>
          <h2 className="text-base font-semibold text-gray-700 mt-0.5">Carátula de Estimación</h2>
        </div>

        <div className="flex items-center justify-between mb-4 bg-gray-50 rounded-lg p-3">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">Folio de validación</p>
            <p className="text-lg font-mono font-bold text-gray-900">{estimacion.folio}</p>
            <p className="text-xs text-gray-500 mt-1">Escanea el QR para verificar en la app</p>
          </div>
          <div className="flex flex-col items-center">
            <QRCodeSVG value={urlEstimacion} size={85} level="M" />
            <p className="text-xs text-gray-400 mt-1">Verificar estimación</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contrato</p>
              <p className="text-sm font-semibold text-gray-900">{contrato?.numero}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contratista</p>
              <p className="text-sm font-semibold text-gray-900">{nombreContratista}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Cliente</p>
              <p className="text-sm font-semibold text-gray-900">{contrato?.spv_id} · {contrato?.spvs?.razon_social}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">No. Estimación</p>
              <p className="text-sm font-semibold text-gray-900">#{estimacion.numero_estimacion}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Fecha de presentación</p>
              <p className="text-sm font-semibold text-gray-900">{formatFecha(estimacion.created_at?.split('T')[0])}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Período de ejecución</p>
              {tieneEjecucion ? (
                <p className="text-sm font-semibold text-gray-900">
                  {formatFecha(estimacion.fecha_inicio_ejecucion)} — {formatFecha(estimacion.fecha_fin_ejecucion)}
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic">Del __________ al __________</p>
              )}
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
          <div className="bg-gray-800 px-3 py-1.5">
            <p className="text-white text-sm font-semibold">Resumen financiero</p>
          </div>
          <div className="divide-y divide-gray-100">
            {[
              ['Valor de Estimación', formatMXN(valorEstimacion)],
              [`Amortización anticipo ${contrato?.pct_anticipo}%`, `−${formatMXN(amortizacion)}`],
              [`Fondo de garantía ${contrato?.pct_fondo_garantia}%`, `−${formatMXN(fondoGarantia)}`],
              ['Subtotal', formatMXN(subtotal)],
              ['IVA 16%', formatMXN(iva)],
            ].map(([label, valor]) => (
              <div key={label} className="flex justify-between px-3 py-1.5">
                <span className="text-sm text-gray-600">{label}</span>
                <span className="text-sm font-medium text-gray-900">{valor}</span>
              </div>
            ))}
            <div className="flex justify-between px-3 py-2 bg-gray-50">
              <span className="text-sm font-bold text-gray-900">TOTAL NETO A PAGAR</span>
              <span className="text-base font-bold text-gray-900">{formatMXN(totalNeto)}</span>
            </div>
          </div>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-3 py-1.5">
            <p className="text-white text-sm font-semibold">Firmas de autorización</p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-gray-200">
            {FIRMANTES.map((f) => (
              <div key={f.cargo} className="p-3 text-center">
                <div className="h-10 border-b border-gray-300 mb-2"></div>
                <p className="text-xs text-gray-900 font-semibold">{f.nombre}</p>
                <p className="text-xs text-gray-500">{f.cargo}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 text-center">
          <p className="text-xs text-gray-400">
            Powered by Controlia · {new Date().toLocaleDateString('es-MX', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <style>{`
        @media print {
          .print\\:hidden { display: none !important; }
          body { background: white; }
          nav, header { display: none !important; }
          @page { margin: 0.5cm; size: letter portrait; }
        }
      `}</style>
    </div>
  )
}
