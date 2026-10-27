import { round2 } from './format.js'

// Estimaciones cuya amortización y valor bruto cuentan para el saldo de anticipo y la tasa.
export const ESTADOS_AMORTIZACION_AUTORIZADA = ['autorizada', 'correo_enviado', 'con_factura', 'pagada']

// Anticipos ya autorizados en adelante; 'pendiente' (o sin estado) no cuenta.
const ESTADOS_ANTICIPO_VIGENTE = ['autorizado', 'correo_enviado', 'con_factura', 'pagado']

// Modo 'pct': un solo anticipo sin convenio_id (fórmula histórica, con pct_anticipo del contrato).
// Modo 'proporcional': más de un anticipo, o cualquiera con convenio_id.
//   tasa = saldo de anticipo por amortizar / saldo por estimar (monto_vigente - yaEstimado)
export function calcAmortizacion({ valorEstimacion, contrato, anticipos, amortizadoPrevio, yaEstimado }) {
  const vigentes = (anticipos || []).filter(a => ESTADOS_ANTICIPO_VIGENTE.includes(a.estado))
  const montoAnticipos = vigentes.reduce((s, a) => s + (Number(a.monto) || 0), 0)
  const saldoAnticipo = round2(montoAnticipos - (amortizadoPrevio || 0))
  const proporcional = vigentes.length > 1 || vigentes.some(a => a.convenio_id)

  if (!proporcional) {
    // Mismo cálculo y redondeo que NuevaEstimacion.jsx:433-436 (sin round2 en la amortización)
    const amortizacionSinTope = valorEstimacion * ((contrato?.pct_anticipo || 0) / 100)
    return {
      amortizacion: Math.min(amortizacionSinTope, Math.max(saldoAnticipo, 0)),
      tasa: (contrato?.pct_anticipo || 0) / 100,
      modo: 'pct',
      saldoAnticipo,
      montoAnticipos: round2(montoAnticipos),
    }
  }

  const montoVigente = contrato?.monto_vigente ?? contrato?.monto_original ?? 0
  const saldoPorEstimar = round2(montoVigente - (yaEstimado || 0))
  const tasa = saldoPorEstimar <= 0 ? 1 : Math.max(0, Math.min(1, saldoAnticipo / saldoPorEstimar))
  const amortizacion = Math.max(0, Math.min(round2(valorEstimacion * tasa), saldoAnticipo, valorEstimacion))
  return { amortizacion, tasa, modo: 'proporcional', saldoAnticipo, montoAnticipos: round2(montoAnticipos) }
}

// Trae anticipos y las sumas previas con las mismas reglas para todas las pantallas.
// excluirEstimacionIds: la estimación en curso y/o la que se reemplaza.
// Lanza el error de Supabase: un fallo no debe convertirse en amortización 0 en silencio.
export async function cargarDatosAmortizacion(supabase, contratoId, { excluirEstimacionIds = [] } = {}) {
  const excluir = excluirEstimacionIds.filter(Boolean)
  const [antsRes, estsRes] = await Promise.all([
    supabase.from('anticipos').select('*').eq('contrato_id', contratoId),
    supabase.from('estimaciones').select('id, subtotal, amortizacion_anticipo')
      .eq('contrato_id', contratoId)
      .in('estado', ESTADOS_AMORTIZACION_AUTORIZADA),
  ])
  const error = antsRes.error || estsRes.error
  if (error) throw error
  const ests = (estsRes.data || []).filter(e => !excluir.includes(e.id))
  return {
    anticipos: antsRes.data || [],
    amortizadoPrevio: ests.reduce((s, e) => s + (Number(e.amortizacion_anticipo) || 0), 0),
    yaEstimado: ests.reduce((s, e) => s + (Number(e.subtotal) || 0), 0),
  }
}
