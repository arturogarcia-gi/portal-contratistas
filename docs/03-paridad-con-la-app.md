# 03 · Paridad con la app

Cada cifra que ve el contratista, frente a la función de la app (`../../estimaciones-gi-mty/src/lib`). La app manda.
Estado tras el trabajo de paridad: todo lo financiero sale de `saldoContrato.js` copiado tal cual.

| Cifra | Pantalla del portal | Función (portal = app) | Estados | Veredicto |
|---|---|---|---|---|
| Total estimado bruto | `EstadoCuenta` | `calcTotalEstimadoBruto` | Excluye `borrador`, `cancelada`, `rechazada`, `rechazada_auditoria` | Igual (antes incluía borradores) |
| Saldo por estimar | `EstadoCuenta` | `monto_vigente − calcTotalEstimadoBruto` | ídem | Igual |
| Total pagado sin IVA | `EstadoCuenta` | `calcTotalPagadoSinIva` | Estimaciones `pagada` (neto) + anticipos y fondos `pagado`; **no** se usa `fecha_pago` | Igual (antes contaba cualquier estimación con `fecha_pago`) |
| Saldo por pagar | `EstadoCuenta` | `calcSaldoPorPagar` | ídem | Igual |
| Anticipo por amortizar | `EstadoCuenta` | `calcSaldoPorAmortizar` + `calcAmortizado` | Anticipos `autorizado`/`correo_enviado`/`con_factura`/`pagado`; amortización de estimaciones `autorizada` en adelante | Igual |
| Fondo retenido | `EstadoCuenta` | `calcFondoRetenido` | Estimaciones `autorizada` en adelante menos fondos `pagado` | Igual |
| Amortización de una estimación | Crear/reemplazar, detalle, carátula | `calcAmortizacion` (modos `pct` y `proporcional`) | `ESTADOS_AMORTIZACION_AUTORIZADA` | Igual (archivo copiado) |
| Acumulado por concepto (al crear) | `EstimacionesContrato` | `cargarAcumuladoConceptos` | `ESTADOS_CUENTAN_ACUMULADO` | Igual (archivo copiado) |
| Acumulado anterior (relación) | `RelacionEstimacion` | Cálculo propio, ver nota | `ESTADOS_CUENTAN_ACUMULADO` y `numero_estimacion` menor | Distinto a propósito |
| Totales de una estimación al crear | `EstimacionesContrato` | `totalesEstimacion.js` (solo portal) con `round2` e IVA con `calcIva` | — | Igual al cálculo de `NuevaEstimacion` de la app |
| IVA | Estado de cuenta, detalle, carátula, crear | `tasaIva` / `calcIva` / `etiquetaIva` (0 es válida; vacío → 16 %) | — | Igual |
| Folio | `EstimacionesContrato` | `EST-{contrato}-{NNN}-{hash}` | — | Igual formato |
| Numeración | `EstimacionesContrato` | `siguienteNumeroEstimacion` (máximo + 1; no consumen `cancelada`, `rechazada`, `rechazada_auditoria`; el borrador sí) | — | Igual |
| Total estimado / pagado / pendiente de la lista | `EstimacionesContrato` | Sin equivalente en la app: suma de `total_neto` (**con IVA**); "pagada" por `estado` | — | Solo en el portal |
| Órdenes de cambio / convenios | `EstadoCuenta` | La app suma `convenios.monto_ajuste` autorizados; el portal lee `contratos.monto_convenios_autorizados` (no tiene acceso a `convenios`) | — | Distinto en origen; coincide en todos los contratos (verificado) |
| Filas del estado de cuenta | `EstadoCuenta` | Excluye solo `cancelada`, como la app | — | Igual |

## Notas

- **Acumulado anterior en la relación.** `cargarAcumuladoConceptos` suma *todas* las estimaciones del contrato en esos estados (el acumulado para crear la siguiente).
  La relación necesita el acumulado *previo a esa estimación* (solo `numero_estimacion` menor) y no debe contar la propia estimación si ya está en revisión. Con la función de lib se
  contaría la propia estimación y las posteriores, así que se mantiene el cálculo propio (`RelacionEstimacion.jsx`, consultas `anteriores` + `linPrev`).
- **Relación y convenios.** `convenios` no tiene política para contratistas; el número de la OC vigente de la relación (pantalla y celda M5 del Excel) viene de la RPC `oc_vigente_contratista`, con la misma lógica que la consulta de la app. Si no hay OC (o la RPC devuelve `null`) se muestra "Sin convenios".
- **Redondeo.** `calcFondoRetenido` no redondea a 2 decimales como lo hacía la función propia del portal (`calcResumenAnticipoFondo`, eliminada); puede haber
  diferencias de centavos respecto a la versión anterior del portal, nunca respecto a la app.
- La numeración no es atómica hasta que la app cree el índice único parcial; el alta traduce `23505` a "Otra estimación tomó ese número al mismo tiempo. Intenta guardar de nuevo."
