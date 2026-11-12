# Portal de contratistas ("Portal GI")

Portal externo donde los contratistas cargan, corrigen y consultan sus estimaciones. Es la cara pública de la app interna
`estimaciones-gi-mty` (carpeta hermana `../estimaciones-gi-mty`), que es la **fuente de verdad** del dominio y de la base de datos.
Documentación propia del portal: `docs/README.md`.

## Fuente de verdad
- Reglas de negocio, estados, esquema, RLS y valores fijos: `../estimaciones-gi-mty/CLAUDE.md` y su `docs/` (03 flujo, 04 anticipos/fondos/cifras,
  06 lib, 07 base de datos, 08 permisos, 09 valores fijos, adr/). No duplicarlos aquí.
- Si el portal y la app difieren en una cifra, **la app manda**: se corrige el portal.
- De la app solo se LEE y se COPIA. Nunca se modifica desde este repo.

## Stack y comandos
React 19 + Vite 8 + Tailwind 3 + Supabase (el navegador accede directo con la anon key). JavaScript, sin TypeScript.
- `npm run dev` · `npm run build` · `npm run lint` · `npm run verificar-sync`
- Pruebas: `node scripts/prueba-<nombre>.mjs` (no hay runner ni CI)
- Variables (solo nombres): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`. Nunca `service_role`. `.env` no se commitea.
- Despliegue: Netlify. Las migraciones y políticas viven en el repo de la app.

## Lib copiada de la app
- Archivos copiados tal cual (lista en `scripts/verificar-sync-lib.mjs`): **no editarlos aquí**. Si hay que cambiarlos, se cambia en la app y se vuelve a copiar.
- **Después de copiar algo de la app, correr `npm run verificar-sync`** y todas las pruebas. Debe terminar en OK.
- Lo propio del portal (no se compara): `fechas.js`, `totalesEstimacion.js`, `eventosDocumento.js`, `supabase.js`. Ver `docs/04-sincronizacion-de-lib.md`.
- Cifras financieras: solo `saldoContrato.js`. "Pagado" = únicamente `pagada` / `pagado` (nunca `fecha_pago`); los borradores no cuentan como estimado.
- IVA con `tasaIva` / `calcIva` / `etiquetaIva` (0 es tasa válida). Dinero con `round2`. Fechas de negocio con `fechaLocalISO()`.
- Numeración con `siguienteNumeroEstimacion` (máximo + 1; los borradores consumen número). Nunca contar filas.

## Reglas propias del portal
- La seguridad real es RLS (ver `docs/02-tablas-y-rls.md`). El contratista solo ve sus contratos. `convenios` y `aprobacion_eventos`
  **no** tienen política para contratistas (decisión): siempre devuelven vacío; no basar nada en ellas. El monto de convenios sale de `contratos.monto_convenios_autorizados`
  y el número de la OC vigente de la RPC `oc_vigente_contratista` (`SECURITY DEFINER`); el contratista nunca ve la orden de cambio completa.
- Toda escritura destructura `error`, detiene el flujo y lo muestra. Un UPDATE/DELETE sin efecto por RLS no da error: verificar el conteo (`.select('id')`).
  Única excepción: `eventos_documento` (bitácora), que solo hace `console.error` y no bloquea.
- Cada cambio de estado del contratista (crear, enviar a revisión, reenviar tras corrección, cancelar) inserta en `eventos_documento` con `registrarEventoDocumento`.
- Las cargas críticas (`cargarDatosAmortizacion`, `cargarAcumuladoConceptos`) lanzan el error; un fallo nunca se vuelve 0 ni `{}`.
- Un documento imprimible (relación, carátula, estado de cuenta) nunca se muestra incompleto: si falla una consulta, estado de error.
- Pedir columnas explícitas en los `select` nuevos; no usar `*` ni `contratistas(*)` / `spvs(*)`.
- Las validaciones del cliente son comodidad, no seguridad: GI recalcula y valida.
- No hardcodear SPVs, correos ni razones sociales; la marca vive solo en `App.jsx`, `Login.jsx` e `index.html`.

## Convenciones
- UI, dominio y commits en español, estilo `fix:` / `feat:`. Sin líneas de coautoría (`Co-Authored-By`) en los commits.
- No hacer commit ni push sin que se pida expresamente.
- Antes de tocar un cálculo, correr el script de prueba que le corresponde en `scripts/`.
