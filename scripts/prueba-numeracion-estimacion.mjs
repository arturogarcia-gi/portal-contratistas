// node scripts/prueba-numeracion-estimacion.mjs
import { siguienteNumeroEstimacion, ESTADOS_NO_CONSUMEN_NUMERO } from '../src/lib/numeracionEstimacion.js'

let total = 0
let fallas = 0
function check(nombre, real, esperado) {
  total++
  if (real !== esperado) {
    fallas++
    console.log(`FALLA ${nombre}: real=${real} esperado=${esperado}`)
  }
}
const e = (numero_estimacion, estado = 'autorizada') => ({ numero_estimacion, estado })

check('arreglo vacío', siguienteNumeroEstimacion([]), 1)
check('undefined', siguienteNumeroEstimacion(undefined), 1)
check('[1,2,3]', siguienteNumeroEstimacion([e(1), e(2), e(3)]), 4)
check('#3 rechazada se reutiliza', siguienteNumeroEstimacion([e(1), e(2), e(3, 'rechazada')]), 3)
check('#2 rechazada con #3 vigente → 4', siguienteNumeroEstimacion([e(1), e(2, 'rechazada'), e(3)]), 4)
check('borrador cuenta', siguienteNumeroEstimacion([e(1), e(2, 'borrador')]), 3)
check('borrador cancelado como último se reutiliza', siguienteNumeroEstimacion([e(1), e(2, 'cancelada')]), 2)
check('rechazada_auditoria no cuenta', siguienteNumeroEstimacion([e(1), e(2, 'rechazada_auditoria')]), 2)
check('cancelada de en medio no duplica', siguienteNumeroEstimacion([e(1), e(2, 'cancelada'), e(3)]), 4)
check('solo no consumen → 1', siguienteNumeroEstimacion([e(1, 'cancelada'), e(2, 'rechazada'), e(3, 'rechazada_auditoria')]), 1)
check('numero nulo se ignora', siguienteNumeroEstimacion([e(null), e(undefined), e(2)]), 3)
check('solo nulos → 1', siguienteNumeroEstimacion([e(null), e(null, 'borrador')]), 1)
check('desordenados', siguienteNumeroEstimacion([e(3), e(1), e(5), e(2)]), 6)
check('desordenados con rechazada máxima', siguienteNumeroEstimacion([e(3), e(7, 'rechazada'), e(1)]), 4)
check('estados en revisión/correccion consumen', siguienteNumeroEstimacion([e(1, 'en_revision'), e(2, 'en_correccion'), e(3, 'en_revision_auditoria')]), 4)
check('número como texto', siguienteNumeroEstimacion([{ numero_estimacion: '4', estado: 'pagada' }]), 5)
check('lista de estados', ESTADOS_NO_CONSUMEN_NUMERO.join(','), 'cancelada,rechazada,rechazada_auditoria')

console.log(fallas ? `${fallas} FALLAS de ${total}` : `OK: ${total} pruebas`)
if (fallas) process.exit(1)
