// node scripts/verificar-sync-lib.mjs
// Compara cada archivo copiado de la app interna con su original (ignorando CRLF/LF).
// Termina con código 1 si alguno difiere o falta. Correr después de copiar cualquier cosa de la app.
// La app se busca en ../estimaciones-gi-mty; se puede cambiar con APP_GI_PATH.
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const portal = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const app = resolve(process.env.APP_GI_PATH || resolve(portal, '..', 'estimaciones-gi-mty'))

// Lista explícita. Todo lo que se copia de la app debe estar aquí; lo propio del portal NO va
// (src/lib/fechas.js, totalesEstimacion.js, eventosDocumento.js, supabase.js: ver docs/04-sincronizacion-de-lib.md).
const COPIADOS = [
  'src/lib/amortizacionAnticipo.js',
  'src/lib/estadosEstimacion.js',
  'src/lib/estatusContrato.js',
  'src/lib/exportarRelacionExcel.js',
  'src/lib/firmantes.js',
  'src/lib/format.js',
  'src/lib/iva.js',
  'src/lib/nombresArchivo.js',
  'src/lib/numeracionEstimacion.js',
  'src/lib/plantillaCarga.js',
  'src/lib/relacionEstimacion.js',
  'src/lib/saldoContrato.js',
  'scripts/prueba-amortizacion.mjs',
  'scripts/prueba-exportar-relacion.mjs',
  'scripts/prueba-numeracion-estimacion.mjs',
  'scripts/prueba-plantilla-carga.mjs',
  'scripts/prueba-saldo-contrato.mjs',
]

if (!existsSync(app)) {
  console.error(`No se encontró la app en ${app} (usa APP_GI_PATH para indicarla).`)
  process.exit(1)
}

const leer = ruta => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n')
const difieren = []
for (const rel of COPIADOS) {
  const enPortal = resolve(portal, rel)
  const enApp = resolve(app, rel)
  if (!existsSync(enApp)) { difieren.push(`${rel}  (no existe en la app)`); continue }
  if (!existsSync(enPortal)) { difieren.push(`${rel}  (no existe en el portal)`); continue }
  if (leer(enPortal) !== leer(enApp)) difieren.push(`${rel}  (contenido distinto)`)
}

if (difieren.length) {
  console.log(`DIFIEREN ${difieren.length} de ${COPIADOS.length} archivos copiados de la app:`)
  difieren.forEach(d => console.log('  - ' + d))
  process.exit(1)
}
console.log(`OK: ${COPIADOS.length} archivos idénticos a la app`)
