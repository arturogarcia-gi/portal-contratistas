// Única fuente de verdad de los puestos firmantes.
// key:       valor guardado en contrato_firmantes.puesto (no cambiar)
// label:     texto a mostrar
// spvColumn: columna de spvs con el nombre de la persona (null = no vive en spvs)
export const PUESTOS_FIRMANTES = [
  { key: 'contratista',              label: 'Contratista',                 spvColumn: null },
  { key: 'project_manager',          label: 'Project Manager',             spvColumn: 'project_manager' },
  { key: 'supervision',              label: 'Supervisión',                 spvColumn: 'supervision_socio' },
  { key: 'interventora',             label: 'Interventora',                spvColumn: 'nombre_interventora' },
  { key: 'gte_ingenieria',           label: 'Gte. Ingeniería',             spvColumn: 'gte_ingenieria' },
  { key: 'subdirector_construccion', label: 'Subdirector de Construcción', spvColumn: 'subdirector_construccion' },
  { key: 'director_operaciones',     label: 'Director de Operaciones',     spvColumn: 'director_operaciones' },
  { key: 'gte_control_proyectos',    label: 'Gte. Control de Proyectos',   spvColumn: 'gte_control_proyectos' },
]

export const PUESTOS_BY_KEY = Object.fromEntries(PUESTOS_FIRMANTES.map(p => [p.key, p]))

// Refleja el CHECK de contrato_firmantes.tipo_documento
export const TIPOS_DOCUMENTO_FIRMA = ['estimacion', 'conciliacion', 'caratula', 'estado_cuenta']

// Tipos de documento con firmantes para este SPV (estado_cuenta se puede apagar por SPV)
export function getTiposDocumentoFirma(spv) {
  return TIPOS_DOCUMENTO_FIRMA.filter(t => t !== 'estado_cuenta' || spv?.tiene_firmantes_estado_cuenta !== false)
}

// Mínimo y máximo de firmantes por tipo (la carátula tiene 3 casillas de firma)
export const MIN_FIRMANTES = { caratula: 1 }
export const MAX_FIRMANTES = { caratula: 3 }

// Columnas de spvs que hacen falta para imprimir firmas (para los selects explícitos)
export const SPV_FIRMANTE_COLUMNS = PUESTOS_FIRMANTES.map(p => p.spvColumn).filter(Boolean)

export function getLabelPuesto(puesto) {
  return PUESTOS_BY_KEY[puesto]?.label ?? puesto
}

// 'contratista' no vive en spvs: se lee de contrato.firmante_contratista
export function getNombreFirmante(puesto, spv, contrato) {
  if (puesto === 'contratista') return contrato?.firmante_contratista || ''
  const col = PUESTOS_BY_KEY[puesto]?.spvColumn
  return (col && spv?.[col]) || ''
}

// Puestos activos por default para un tipo de documento cuando el contrato
// aún no tiene filas en contrato_firmantes. Regresa keys en el orden de PUESTOS_FIRMANTES.
export function getPuestosDefault(tipo, spv) {
  const tieneSup = spv?.tiene_supervision_socio === true
  const tieneInt = spv?.tiene_interventora === true
  const porTipo = {
    estimacion:    ['contratista', 'project_manager', tieneSup && 'supervision', tieneInt && 'interventora'],
    conciliacion:  ['contratista', 'project_manager', tieneSup && 'supervision', 'subdirector_construccion', 'gte_control_proyectos'],
    caratula:      ['gte_control_proyectos', 'director_operaciones', 'subdirector_construccion'],
    estado_cuenta: ['contratista', 'project_manager', 'gte_control_proyectos', tieneInt && 'interventora'],
  }
  const activos = new Set((porTipo[tipo] || []).filter(Boolean))
  return PUESTOS_FIRMANTES.filter(p => activos.has(p.key)).map(p => p.key)
}

// Puestos a imprimir para un tipo de documento, en el orden de PUESTOS_FIRMANTES.
// rows: filas de contrato_firmantes de ese tipo ({ puesto, activo }).
// Sin filas (contrato que nunca abrió el modal de Firmantes) se usa getPuestosDefault.
export function getPuestosActivos(rows, tipo, spv) {
  if (!rows || rows.length === 0) return getPuestosDefault(tipo, spv)
  const activos = new Set(rows.filter(r => r.activo).map(r => r.puesto))
  return PUESTOS_FIRMANTES.filter(p => activos.has(p.key)).map(p => p.key)
}
