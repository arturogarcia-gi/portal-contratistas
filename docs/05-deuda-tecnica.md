# 05 · Deuda técnica del portal

Lo ya corregido (paridad con la app, numeración, bitácora de cancelación, errores de `RelacionEstimacion`, `validarFechas` y deshacer) está en [03](03-paridad-con-la-app.md) y [04](04-sincronizacion-de-lib.md).

## Seguridad

- **`select('*')` y joins con `*`** traen columnas de más al contratista: `contratos(*, contratistas(*), spvs(*))` en `EstadoCuenta.jsx:40` y `RelacionEstimacion.jsx:40`;
  `estimaciones` con `*` en detalle, carátula y relación; `conceptos` con `*` en `EstimacionesContrato.jsx:192`; `anticipos` con `*` en `amortizacionAnticipo.js` (copia de la app).
  Pedir columnas explícitas (para `amortizacionAnticipo.js`, hacerlo primero en la app).
- **Validaciones solo en el cliente**: tope "el monto supera el saldo disponible", traslape de fechas de ejecución, una estimación por periodo, compensaciones, límites de volumen y precio unitario.
  Los totales, la amortización, el IVA y el folio se calculan en el navegador y se guardan; RLS limita filas, no valores. La numeración tiene condición de carrera hasta que exista el índice único en la app.

## Errores sin revisar o absorbidos

- `EstimacionDetalle.jsx` y `CaratulaEstimacion.jsx`: si falla la carga de amortización solo hay `console.error` y `modoAmort = null` (cambia únicamente la etiqueta).
- `contrato_firmantes` (carátula, estado de cuenta, relación): ante error se imprime con los firmantes por defecto, sin avisar.
- La bitácora (`eventos_documento`) es no bloqueante por diseño.

## Duplicación

- Regex que quita la razón social (`S.A.`, `A.C.`…) repetido en carátula, estado de cuenta y relación; mapas `ESTADO_COLORS` y `ESTADO_LABELS` extendidos localmente en `EstimacionesContrato` y `EstadoCuenta`; `formatMXN` y `formatFecha` locales en varias pantallas pese a `format.js`.
- Acumulado anterior de la relación calculado a mano (justificado en [03](03-paridad-con-la-app.md)).
- Casi todo `src/lib` es copia de la app: depende de `npm run verificar-sync`.

## Archivos y dependencias sin uso

- `src/assets/hero.png`, `react.svg`, `vite.svg` y `public/icons.svg` no se referencian.
- Exportaciones sin uso externo en `firmantes.js` (`getTiposDocumentoFirma`, `MIN_FIRMANTES`, `MAX_FIRMANTES`, `TIPOS_DOCUMENTO_FIRMA`); al ser copia, no se podan aquí.
- `xlsx` 0.18.5 (lectura de la plantilla) tiene advisories conocidos y convive con `exceljs`; evaluar leer la plantilla con `exceljs`.
- `README.md` de la raíz es la plantilla de Vite sin editar.
- `.claude/settings.local.json` tiene `Bash(git *)`, un permiso muy amplio.

## Marca

- Nombres de respaldo distintos entre pantallas ("Generación Industrial MTY" y "Generación Industrial Monterrey") y marca y color codificados (ver [01](01-arquitectura-y-rutas.md)).

## Datos

- Pueden existir estimaciones con número duplicado generadas por la regla anterior; revisarlas antes del índice único de la app.
