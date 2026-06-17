import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route, NavLink } from 'react-router-dom'
import { supabase } from './lib/supabase'
import Login from './pages/Login'
import MisContratos from './pages/MisContratos'
import EstimacionesContrato from './pages/EstimacionesContrato'
import EstadoCuenta from './pages/EstadoCuenta'
import CaratulaEstimacion from './pages/CaratulaEstimacion'
import EstimacionDetalle from './pages/EstimacionDetalle'

function App() {
  const [session, setSession] = useState(null)
  const [cargandoSesion, setCargandoSesion] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setCargandoSesion(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  if (cargandoSesion) {
    return <div className="min-h-screen bg-gray-50" />
  }

  if (!session) {
    return <Login />
  }

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between print:hidden">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">GI</span>
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 text-sm">Portal GI</h1>
              <p className="text-xs text-gray-500">Portal de contratistas</p>
            </div>
          </div>
          <nav className="flex gap-1 items-center">
            <NavLink to="/" end className={({ isActive }) => `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-emerald-50 text-emerald-700' : 'text-gray-600 hover:bg-gray-100'}`}>
              Mis contratos
            </NavLink>
            <button
              onClick={() => supabase.auth.signOut()}
              className="px-4 py-2 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors ml-2"
            >
              Cerrar sesión
            </button>
          </nav>
        </header>
        <main className="max-w-7xl mx-auto px-6 py-8">
          <Routes>
            <Route path="/" element={<MisContratos />} />
            <Route path="/contrato/:id/estimaciones" element={<EstimacionesContrato />} />
            <Route path="/contrato/:id/estado-cuenta" element={<EstadoCuenta />} />
            <Route path="/contrato/:id/estimacion/:estimacionId/caratula" element={<CaratulaEstimacion />} />
            <Route path="/contrato/:id/estimacion/:estimacionId" element={<EstimacionDetalle />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

export default App
