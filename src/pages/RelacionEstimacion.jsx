import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(n || 0)
}

function formatCantidad(n) {
  return Number(n || 0).toLocaleString('es-MX', { maximumFractionDigits: 2 })
}

function formatFecha(f) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  return `${d}/${meses[parseInt(m)-1]}/${y}`
}

function ordenarJerarquia(conceptos) {
  return [...conceptos].sort((a, b) => {
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

const ESTADOS_ACTIVOS = ['en_revision', 'autorizada', 'correo_enviado', 'pagada']

export default function RelacionEstimacion() {
  const { id, estimacionId } = useParams()
  const navigate = useNavigate()
  const [estimacion, setEstimacion] = useState(null)
  const [conceptos, setConceptos] = useState([])
  const [lineasEsta, setLineasEsta] = useState([])
  const [acumAnterior, setAcumAnterior] = useState({})
  const [ocVigente, setOcVigente] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchDatos = useCallback(async () => {
    try {
      const { data: est, error: estError } = await supabase
        .from('estimaciones')
        .select('*, contratos(*, contratistas(*), spvs(*)), periodos(label)')
        .eq('id', estimacionId)
        .maybeSingle()
      if (estError) throw estError
      if (!est) {
        setError('Estimación no encontrada o sin acceso')
        return
      }
      setEstimacion(est)

      const { data: cats } = await supabase
        .from('conceptos')
        .select('id, clave, clave_concepto, descripcion, unidad, tipo, jerarquia, orden, cantidad_contratada, precio_unitario')
        .eq('contrato_id', id)
        .order('orden', { ascending: true })
      setConceptos(cats || [])

      const { data: lins } = await supabase
        .from('estimacion_lineas')
        .select('concepto_id, clave, cantidad_periodo, importe_periodo')
        .eq('estimacion_id', estimacionId)
      setLineasEsta(lins || [])

      const { data: anteriores } = await supabase
        .from('estimaciones')
        .select('id')
        .eq('contrato_id', id)
        .in('estado', ESTADOS_ACTIVOS)
        .lt('numero_estimacion', est.numero_estimacion)

      const mapaAcum = {}
      if (anteriores && anteriores.length > 0) {
        const { data: linPrev } = await supabase
          .from('estimacion_lineas')
          .select('concepto_id, cantidad_periodo, importe_periodo')
          .in('estimacion_id', anteriores.map(e => e.id))
        ;(linPrev || []).forEach(l => {
          if (!l.concepto_id) return
          if (!mapaAcum[l.concepto_id]) mapaAcum[l.concepto_id] = { cantidad: 0, importe: 0 }
          mapaAcum[l.concepto_id].cantidad += l.cantidad_periodo || 0
          mapaAcum[l.concepto_id].importe += l.importe_periodo || 0
        })
      }
      setAcumAnterior(mapaAcum)

      const { data: oc } = await supabase
        .from('convenios')
        .select('numero')
        .eq('contrato_id', id)
        .eq('estado', 'autorizado')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      setOcVigente(oc)
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

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando relación de estimación...</div>
  if (!estimacion) return <div className="text-center py-12 text-gray-400 text-sm">{error || 'Estimación no encontrada.'}</div>

  const contrato = estimacion.contratos
  const contratista = contrato?.contratistas
  const nombreContratista = contratista?.razon_social || contratista?.nombre || '—'
  const nombreSpv = (contrato?.spvs?.razon_social || '').replace(/\s*(S\.\s?A\.|A\.C\.|S\.C\.).*$/i, '').trim() || contrato?.spvs?.nombre || '—'

  const lineaEstaByConcepto = {}
  const lineaEstaByClave = {}
  lineasEsta.forEach(l => {
    if (l.concepto_id) lineaEstaByConcepto[l.concepto_id] = l
    if (l.clave) lineaEstaByClave[l.clave] = l
  })

  const conceptosOrdenados = ordenarJerarquia(conceptos)

  function calcularFila(concepto) {
    const pu = concepto.precio_unitario || 0
    const cantContratoActual = concepto.cantidad_contratada || 0
    const impContratoActual = cantContratoActual * pu
    const acum = acumAnterior[concepto.id] || { cantidad: 0, importe: 0 }
    const linea = lineaEstaByConcepto[concepto.id] || lineaEstaByClave[concepto.clave_concepto] || lineaEstaByClave[concepto.clave]
    const estaCant = linea?.cantidad_periodo || 0
    const estaImp = linea?.importe_periodo || 0
    const nuevoCant = acum.cantidad + estaCant
    const nuevoImp = acum.importe + estaImp
    const saldoCant = cantContratoActual - nuevoCant
    const saldoImp = impContratoActual - nuevoImp
    return {
      pu, cantContratoActual, impContratoActual,
      acumCant: acum.cantidad, acumImp: acum.importe,
      estaCant, estaImp, nuevoCant, nuevoImp, saldoCant, saldoImp,
    }
  }

  function sumarHijosAG(jerarquiaPadre, campo) {
    return conceptosOrdenados
      .filter(c => c.tipo === 'CO' && c.jerarquia && jerarquiaPadre && c.jerarquia.startsWith(jerarquiaPadre + '.'))
      .reduce((sum, c) => sum + calcularFila(c)[campo], 0)
  }

  const totales = conceptosOrdenados
    .filter(c => c.tipo === 'CO' || !c.tipo)
    .reduce((acc, c) => {
      const f = calcularFila(c)
      acc.contratoActual += f.impContratoActual
      acc.acumAnterior += f.acumImp
      acc.esta += f.estaImp
      acc.nuevoAcumulado += f.nuevoImp
      acc.saldo += f.saldoImp
      return acc
    }, { contratoActual: 0, acumAnterior: 0, esta: 0, nuevoAcumulado: 0, saldo: 0 })

  return (
    <div>
      <div className="flex gap-3 mb-4 print:hidden">
        <button onClick={() => navigate(`/contrato/${id}/estimacion/${estimacionId}`)} className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600">
          ← Regresar
        </button>
        <button onClick={() => window.print()} className="px-4 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700">
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4 print:hidden">{error}</div>
      )}

      <div className="bg-white border border-gray-300 rounded-xl max-w-[1500px] mx-auto p-5 print:border-0 print:rounded-none print:max-w-full print:p-0 print:mx-0">

        <div className="text-center border-b-2 border-gray-800 pb-3 mb-4">
          <h1 className="text-lg font-bold text-gray-900 uppercase tracking-wide">{nombreSpv}</h1>
          <h2 className="text-base font-semibold text-gray-700 mt-0.5 uppercase tracking-wide">Relación de Estimación</h2>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Propietario</p>
              <p className="text-sm font-semibold text-gray-900">{contrato?.spvs?.razon_social || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contratista</p>
              <p className="text-sm font-semibold text-gray-900">{nombreContratista}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Proyecto</p>
              <p className="text-sm font-semibold text-gray-900">{contrato?.spvs?.nombre_corto} · {contrato?.spvs?.nombre_proyecto}</p>
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contrato</p>
              <p className="text-sm font-semibold text-gray-900">{contrato?.numero}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Período de ejecución</p>
              <p className="text-sm font-semibold text-gray-900">
                {formatFecha(estimacion.fecha_inicio_ejecucion)} — {formatFecha(estimacion.fecha_fin_ejecucion)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">OC vigente</p>
              <p className="text-sm font-semibold text-gray-900">{ocVigente?.numero || 'Sin convenios'}</p>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr className="bg-gray-800 text-white">
                <th rowSpan={2} className="px-2 py-1.5 text-left font-medium border border-gray-300">Item</th>
                <th rowSpan={2} className="px-2 py-1.5 text-left font-medium border border-gray-300">Descripción</th>
                <th rowSpan={2} className="px-2 py-1.5 text-left font-medium border border-gray-300">Unidad</th>
                <th rowSpan={2} className="px-2 py-1.5 text-right font-medium border border-gray-300">P.U.</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium border border-gray-300">Contrato Actual</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium border border-gray-300">Acumulado Anterior</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium border border-gray-300">Esta Estimación</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium border border-gray-300">Nuevo Acumulado</th>
                <th colSpan={2} className="px-2 py-1.5 text-center font-medium border border-gray-300">Saldo</th>
              </tr>
              <tr className="bg-gray-100 text-gray-600">
                {['Cantidad','Importe','Cantidad','Importe','Cantidad','Importe','Cantidad','Importe','Cantidad','Importe'].map((h, i) => (
                  <th key={i} className="px-2 py-1 text-right font-normal border border-gray-300">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {conceptosOrdenados.map((concepto, idx) => {
                const nivel = (concepto.jerarquia?.match(/\./g) || []).length
                const indentPx = 8 + nivel * 10

                if (concepto.tipo === 'AG') {
                  const impContratoActual = sumarHijosAG(concepto.jerarquia, 'impContratoActual')
                  const impAcumAnterior = sumarHijosAG(concepto.jerarquia, 'acumImp')
                  const impEsta = sumarHijosAG(concepto.jerarquia, 'estaImp')
                  const impNuevoAcumulado = sumarHijosAG(concepto.jerarquia, 'nuevoImp')
                  const impSaldo = sumarHijosAG(concepto.jerarquia, 'saldoImp')
                  return (
                    <tr key={concepto.id} className="bg-gray-200/60">
                      <td className="px-2 py-1 border border-gray-200 font-mono font-bold" style={{ paddingLeft: indentPx }}>{concepto.jerarquia}</td>
                      <td className="px-2 py-1 border border-gray-200 font-bold">{concepto.descripcion}</td>
                      <td className="px-2 py-1 border border-gray-200 text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right font-semibold">{formatMXN(impContratoActual)}</td>
                      <td className="px-2 py-1 border border-gray-200 text-right text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right font-semibold">{formatMXN(impAcumAnterior)}</td>
                      <td className="px-2 py-1 border border-gray-200 text-right text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right font-semibold">{formatMXN(impEsta)}</td>
                      <td className="px-2 py-1 border border-gray-200 text-right text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right font-semibold">{formatMXN(impNuevoAcumulado)}</td>
                      <td className="px-2 py-1 border border-gray-200 text-right text-gray-400">—</td>
                      <td className="px-2 py-1 border border-gray-200 text-right font-semibold">{formatMXN(impSaldo)}</td>
                    </tr>
                  )
                }

                const f = calcularFila(concepto)
                return (
                  <tr key={concepto.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                    <td className="px-2 py-1 border border-gray-200 font-mono text-gray-600" style={{ paddingLeft: indentPx }}>
                      {concepto.clave_concepto || concepto.clave}
                    </td>
                    <td className="px-2 py-1 border border-gray-200 text-gray-800">{concepto.descripcion}</td>
                    <td className="px-2 py-1 border border-gray-200 text-gray-600">{concepto.unidad}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-700">{formatMXN(f.pu)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-700">{formatCantidad(f.cantContratoActual)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-900">{formatMXN(f.impContratoActual)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-700">{formatCantidad(f.acumCant)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-900">{formatMXN(f.acumImp)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-700">{formatCantidad(f.estaCant)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right font-medium text-gray-900">{formatMXN(f.estaImp)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-700">{formatCantidad(f.nuevoCant)}</td>
                    <td className="px-2 py-1 border border-gray-200 text-right text-gray-900">{formatMXN(f.nuevoImp)}</td>
                    <td className={`px-2 py-1 border border-gray-200 text-right ${f.saldoCant < 0 ? 'text-red-600' : 'text-gray-700'}`}>{formatCantidad(f.saldoCant)}</td>
                    <td className={`px-2 py-1 border border-gray-200 text-right font-medium ${f.saldoImp < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatMXN(f.saldoImp)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="bg-gray-800 text-white font-semibold">
                <td colSpan={4} className="px-2 py-1.5 border border-gray-300 text-right">TOTAL</td>
                <td className="px-2 py-1.5 border border-gray-300"></td>
                <td className="px-2 py-1.5 border border-gray-300 text-right">{formatMXN(totales.contratoActual)}</td>
                <td className="px-2 py-1.5 border border-gray-300"></td>
                <td className="px-2 py-1.5 border border-gray-300 text-right">{formatMXN(totales.acumAnterior)}</td>
                <td className="px-2 py-1.5 border border-gray-300"></td>
                <td className="px-2 py-1.5 border border-gray-300 text-right">{formatMXN(totales.esta)}</td>
                <td className="px-2 py-1.5 border border-gray-300"></td>
                <td className="px-2 py-1.5 border border-gray-300 text-right">{formatMXN(totales.nuevoAcumulado)}</td>
                <td className="px-2 py-1.5 border border-gray-300"></td>
                <td className="px-2 py-1.5 border border-gray-300 text-right">{formatMXN(totales.saldo)}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        {/* Firmas */}
        <div className="px-2 pt-6 pb-4">
          {(() => {
            const firmantes = [
              {
                titulo: 'Contratista',
                nombre: contrato?.firmante_contratista || '',
                empresa: contratista?.razon_social || contratista?.nombre || '',
                show: true,
              },
              {
                titulo: 'Project Manager',
                nombre: contrato?.spvs?.project_manager || '',
                empresa: contrato?.spvs?.razon_social || '',
                show: true,
              },
              {
                titulo: 'Supervisión Socio',
                nombre: contrato?.spvs?.supervision_socio || '',
                empresa: contrato?.spvs?.razon_social || '',
                show: contrato?.spvs?.tiene_supervision_socio === true,
              },
              {
                titulo: 'Interventora',
                nombre: contrato?.spvs?.nombre_interventora || '',
                empresa: contrato?.spvs?.nombre_interventora || '',
                show: contrato?.spvs?.tiene_interventora === true,
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
          .print\\:hidden { display: none !important; }
          body { background: white; }
          nav, header { display: none !important; }
        }
      `}</style>
    </div>
  )
}
