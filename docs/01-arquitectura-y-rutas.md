# 01 · Arquitectura y rutas

## Stack
React 19, Vite 8, Tailwind 3 (la app usa Tailwind 4), `react-router-dom` 7, `@supabase/supabase-js`, `exceljs` (escribir Excel), `xlsx` (leer la plantilla de carga), `qrcode.react`.
JavaScript sin TypeScript. Sin tests automáticos ni CI: scripts de prueba en `scripts/`.

## Carpetas
- `src/pages`: 7 pantallas (abajo). `src/lib`: lógica (copiada de la app salvo 4 archivos, ver [04](04-sincronizacion-de-lib.md)). `src/hooks/useTituloDocumento.js`: nombre de pestaña al imprimir.
- `scripts/`: pruebas de lógica y `verificar-sync-lib.mjs`. No hay `components`, contexto de moneda ni capa de permisos.

## Supabase y autenticación
- Un único cliente en `src/lib/supabase.js` con la anon key (clave pública `sb_publishable_…`).
- Sesión en `App.jsx` (`getSession` + `onAuthStateChange`); sin sesión se muestra `Login` (`signInWithPassword`). No hay rutas protegidas por rol:
  todo el acceso a datos lo limita RLS. `MisContratos` consulta `usuarios_contratistas` para saber a qué contratista pertenece el usuario.
- Verificado: no hay `service_role` ni secretos en `src`, `scripts`, configuración ni en `dist/` (solo aparece el prefijo `sb_publishable_`). `.env` está ignorado por git.

## Variables de entorno (solo nombres)
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (ver `.env.example`). Se leen solo en `src/lib/supabase.js`.

## Rutas (`src/App.jsx`)
| Ruta | Pantalla |
|---|---|
| (sin sesión) | `Login`: correo y contraseña |
| `/` | `MisContratos`: contratos del contratista, monto vigente y contador de borradores sin enviar |
| `/contrato/:id/estimaciones` | `EstimacionesContrato`: lista, descarga/carga de la plantilla Excel, creación y reemplazo (corrección) |
| `/contrato/:id/estado-cuenta` | `EstadoCuenta`: cifras del contrato, tabla filtrable de estimaciones/anticipos/fondos, impresión |
| `/contrato/:id/estimacion/:estimacionId` | `EstimacionDetalle`: totales, líneas, enviar a revisión, cancelar, reemplazar |
| `…/caratula` | `CaratulaEstimacion`: carátula imprimible con QR (no disponible en borrador) |
| `…/relacion` | `RelacionEstimacion`: relación con acumulados por concepto y exportación a Excel |

## Despliegue
Netlify. `netlify.toml` solo define cabeceras de seguridad (X-Frame-Options DENY, nosniff, HSTS, Referrer-Policy, Permissions-Policy).
`public/_redirects`: `/* /index.html 200`. Sin bloque `[build]` (valores por defecto de Netlify).

## Valores fijos de GI MTY en el código
- Marca: logo "GI" y "Portal GI" (`App.jsx`, `Login.jsx`), título en `index.html`, color `emerald` (~49 clases Tailwind).
- Textos: "contacta a GI MTY" (`EstimacionesContrato.jsx`), "GI MTY · {SPV}" (`EstadoCuenta.jsx`).
- Nombres de respaldo cuando la SPV no trae razón social: "Generación Industrial MTY" (`CaratulaEstimacion.jsx`) y "Generación Industrial Monterrey" (`EstadoCuenta.jsx`); no coinciden entre sí.
- Puestos firmantes (`firmantes.js`, copia de la app).
- No hay SPVs, correos ni nombres de personas codificados: vienen de la base.
