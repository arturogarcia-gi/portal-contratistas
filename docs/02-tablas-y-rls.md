# 02 · Tablas y RLS

Verificado en producción (las políticas de contratistas **no** están todas en las migraciones del repo de la app; existen en la base).
El contratista solo ve sus propios contratos. Línea = archivo:línea al momento de escribir este documento.

## Escrituras
| Tabla | Operación | Dónde | Política |
|---|---|---|---|
| `estimaciones` | INSERT (borrador) | `EstimacionesContrato.jsx:573` | `contratistas_crean_sus_estimaciones` |
| `estimaciones` | UPDATE a `en_revision` | `EstimacionDetalle.jsx:105` | `contratistas_envian_a_revision` |
| `estimaciones` | UPDATE a `cancelada` (borrador o en revisión) | `EstimacionDetalle.jsx:129` | `contratistas_cancelan_su_borrador` / `contratistas_cancelan_en_revision` |
| `estimaciones` | UPDATE `en_correccion` → `en_revision` (con montos y folio) | `EstimacionesContrato.jsx:617` | `contratistas_corrigen_en_correccion` |
| `estimacion_lineas` | INSERT | `EstimacionesContrato.jsx:601`, `:611` | `contratistas_crean_sus_estimacion_lineas` |
| `estimacion_lineas` | DELETE (líneas viejas o deshacer) | `EstimacionesContrato.jsx:630`, `:650` | `contratistas_borran_sus_lineas` |
| `eventos_documento` | INSERT | `src/lib/eventosDocumento.js:15` | `contratistas_insertan_eventos_documento` |

Un UPDATE/DELETE sin efecto por RLS **no da error** (devuelve vacío): el código verifica el conteo con `.select('id')` en la corrección y en el borrado de líneas.
La cancelación (`EstimacionDetalle.jsx`) también lo verifica (`.eq('estado', …).select('id')`): si no afectó ninguna fila muestra "No se pudo cancelar: la estimación cambió de estado. Recarga la página." y no registra el evento.

## Lecturas
| Tabla | Dónde | Política SELECT |
|---|---|---|
| `usuarios_contratistas` | `MisContratos.jsx:26` | `contratistas_ven_su_acceso` (solo su fila) |
| `contratos` (+ joins `spvs`, `contratistas`) | `MisContratos`, `EstadoCuenta`, `EstimacionesContrato`, y como join en detalle/carátula/relación | Sí (solo los suyos) |
| `estimaciones`, `periodos`, `conceptos`, `contrato_firmantes`, `spvs`, `contratistas` | varias pantallas | Sí |
| `estimacion_lineas`, `anticipos`, `fondos_garantia` | detalle, relación, estado de cuenta, lib | `contratistas_sus_*` |
| `eventos_documento` | `EstimacionDetalle.jsx` (motivo de cancelación, informativo) | `contratistas_eventos_documento` (estimación, anticipo y fondo de sus contratos) |
| `convenios` | No se consulta | **Sin política para contratistas, por decisión.** La relación no lee la tabla: usa la RPC de abajo |
| RPC `public.oc_vigente_contratista(p_contrato_id uuid) → text` | `RelacionEstimacion.jsx:91` | `SECURITY DEFINER`, solo `authenticated`. Devuelve el número de la OC vigente (estado `autorizado`, tipo nulo o distinto de `anticipo`, `created_at` descendente, una fila) o `null` si no hay o si el contrato no es del contratista. Va a la pantalla y a la celda M5 del Excel; con `null` se muestra "Sin convenios" |

## Tablas que el portal NO toca
`usuarios_app`, `puestos`, `usuario_spvs`, `prefactura_logs`, `aprobacion_eventos` (sin política para contratistas; ya no se consulta).

## Datos de convenios
El contratista ve solo el monto y el número de la OC vigente, nunca la orden de cambio completa. El monto de convenios se muestra desde `contratos.monto_convenios_autorizados` (verificado: coincide con la suma real en todos los contratos).

## Seguridad pendiente
Los `select('*')` y los joins `contratistas(*)` / `spvs(*)` traen columnas que el contratista no necesita (ver [05](05-deuda-tecnica.md)).
RLS limita **qué filas**, no **qué valores** se guardan: totales y amortización se calculan en el navegador.
