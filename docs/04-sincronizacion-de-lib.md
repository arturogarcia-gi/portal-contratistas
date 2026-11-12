# 04 · Sincronización de `src/lib` con la app

## Copiados tal cual (no editar aquí)

Lista explícita en `scripts/verificar-sync-lib.mjs`:

- `src/lib`: `amortizacionAnticipo`, `estadosEstimacion`, `estatusContrato`, `exportarRelacionExcel`, `firmantes`, `format`, `iva`, `nombresArchivo`, `numeracionEstimacion`, `plantillaCarga`, `relacionEstimacion`, `saldoContrato`.
- `scripts`: `prueba-amortizacion`, `prueba-exportar-relacion`, `prueba-numeracion-estimacion`, `prueba-plantilla-carga`, `prueba-saldo-contrato`.

`estatusContrato.js` se copia porque `prueba-saldo-contrato` lo importa; el portal no muestra estatus de contrato.

## Propios del portal (no se comparan)

| Archivo | Por qué es propio |
|---|---|
| `fechas.js` | `diasDesde` (días enteros desde un timestamp); usa `fechaLocalISO` y `diasEntreISO` de `estatusContrato.js` |
| `totalesEstimacion.js` | Totales, folio y filas al crear; en la app esa lógica vive dentro de `NuevaEstimacion.jsx` |
| `eventosDocumento.js` | `registrarEventoDocumento` (bitácora no bloqueante) |
| `supabase.js` | Cliente con las variables del portal |

### `format.js`

Es copia exacta del de la app (ya no choca). Las funciones que solo existían en el portal se resolvieron así:
- `fechaLocalISO()` y `diasEntreISO()`: se usan las de `estatusContrato.js` (copia de la app). `diasEntreISO` de la app no admite valores nulos, así que `EstadoCuenta` valida que existan ambas fechas antes de llamarla.
- `diasDesde(timestamp)`: no existe en la app; vive en `src/lib/fechas.js` y se apoya en las dos anteriores.

## Cómo sincronizar

1. Copiar el archivo desde `../estimaciones-gi-mty/src/lib` (o `scripts/`) sin cambios. La app solo se lee.
2. Si es un archivo nuevo, agregarlo a `COPIADOS` en `scripts/verificar-sync-lib.mjs`.
3. `npm run verificar-sync` debe terminar en OK (ignora CRLF/LF; `APP_GI_PATH` cambia la ruta de la app).
4. Correr todas las pruebas, `npm run lint` y `npm run build`.

`calcResumenAnticipoFondo` (solo del portal) se eliminó: `EstadoCuenta` ya usa `calcAmortizado`, `calcSaldoPorAmortizar` y `calcFondoRetenido` de la app.
