// Numeración de estimaciones (numero_estimacion por contrato). Ver docs/adr/0005-numeracion-estimaciones.md.
// Función pura y sin dependencias: el portal de contratistas la copia tal cual.

// Estados que NO consumen número. Todo lo demás (borrador incluido) sí lo consume.
export const ESTADOS_NO_CONSUMEN_NUMERO = ['cancelada', 'rechazada', 'rechazada_auditoria']

// Siguiente número = el MAYOR numero_estimacion entre las que consumen número, + 1 (1 si no hay ninguna).
// No se cuentan filas: contar duplica números cuando se rechaza una estimación de en medio.
// estimaciones: [{ numero_estimacion, estado }] de un solo contrato. Los numero_estimacion nulos se ignoran.
export function siguienteNumeroEstimacion(estimaciones) {
  let maximo = 0
  for (const e of estimaciones || []) {
    if (ESTADOS_NO_CONSUMEN_NUMERO.includes(e?.estado)) continue
    const n = Number(e?.numero_estimacion)
    if (e?.numero_estimacion == null || !Number.isFinite(n)) continue
    if (n > maximo) maximo = n
  }
  return maximo + 1
}
