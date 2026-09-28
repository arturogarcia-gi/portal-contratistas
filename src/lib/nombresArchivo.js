// Convención de nombres de archivo: Prefijo_#numero_contrato_extra_fecha
// Piezas separadas por "_", palabras dentro de una pieza por "-".
// Sin acentos ni espacios, y sin piezas vacías o "undefined".

// "Estimación 3" → "Estimacion-3", "1a Quincena Ene 2026" → "1a-Quincena-Ene-2026"
function limpiar(valor) {
  return String(valor)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9#-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

// Fecha LOCAL en AAAAMMDD
export function fechaLocal(date = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`
}

const vacio = v => v === null || v === undefined || String(v).trim() === ''

// nombreArchivo({ prefijo: 'Estimacion', numero: 3, contrato: 'P05-2026-001' })  → "Estimacion_#3_P05-2026-001"
// nombreArchivo({ prefijo: 'CxPagar', fecha: true, ext: 'xlsx' })                 → "CxPagar_20260924.xlsx"
export function nombreArchivo({ prefijo, numero, contrato, extra, fecha, ext }) {
  const piezas = [
    prefijo,
    vacio(numero) ? null : `#${limpiar(numero)}`,
    contrato,
    extra,
    fecha === true ? fechaLocal() : fecha,
  ]
  const base = piezas.filter(p => !vacio(p)).map(limpiar).filter(Boolean).join('_')
  return ext ? `${base}.${ext}` : base
}
