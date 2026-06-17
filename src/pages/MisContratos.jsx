import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

function formatMXN(n) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 }).format(n)
}

function formatFecha(f) {
  if (!f) return '—'
  return new Date(f + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default function MisContratos() {
  const navigate = useNavigate()
  const [contratos, setContratos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  async function fetchContratos() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('No hay sesión activa.')

      const { data: acceso, error: accesoError } = await supabase
        .from('usuarios_contratistas')
        .select('contratista_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (accesoError) throw accesoError

      if (!acceso) {
        setContratos([])
        return
      }

      const { data, error: contratosError } = await supabase
        .from('contratos')
        .select('id, numero, descripcion, monto_original, fecha_inicio, fecha_fin, spvs(nombre)')
        .eq('contratista_id', acceso.contratista_id)
      if (contratosError) throw contratosError

      setContratos(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => fetchContratos(), 0)
    return () => clearTimeout(t)
  }, [])

  if (loading) return <div className="text-center py-12 text-gray-400 text-sm">Cargando...</div>

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-gray-900">Mis contratos</h2>
        <p className="text-sm text-gray-500 mt-1">Contratos asignados a tu empresa</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 mb-4">{error}</div>
      )}

      {!error && contratos.length === 0 && (
        <div className="text-center py-12 text-gray-400 text-sm">No tienes contratos asignados</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {contratos.map(c => (
          <div key={c.id} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-1 bg-emerald-50 text-emerald-700 rounded text-xs font-medium">
                {c.numero}
              </span>
              <span className="text-xs text-gray-500">{c.spvs?.nombre}</span>
            </div>
            <p className="text-sm text-gray-900 font-medium mb-3">{c.descripcion || 'Sin descripción'}</p>
            <p className="text-lg font-semibold text-gray-900 mb-3">{formatMXN(c.monto_original)}</p>
            <div className="flex justify-between text-xs text-gray-500 mb-4">
              <span>Inicio: {formatFecha(c.fecha_inicio)}</span>
              <span>Fin: {formatFecha(c.fecha_fin)}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => navigate(`/contrato/${c.id}/estimaciones`)}
                className="flex-1 px-3 py-2 text-sm bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Ver estimaciones
              </button>
              <button
                onClick={() => navigate(`/contrato/${c.id}/estado-cuenta`)}
                className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 transition-colors"
              >
                Estado de cuenta
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
