# Documentación del portal de contratistas

El portal es la cara externa de la app interna `estimaciones-gi-mty` (carpeta hermana). **La app es la fuente de verdad** del dominio,
la base de datos y las reglas financieras: aquí solo se documenta lo propio del portal y cómo se mantiene en paridad.
Instrucciones para Claude Code: `../CLAUDE.md`.

| Documento | Contenido |
|---|---|
| [01-arquitectura-y-rutas.md](01-arquitectura-y-rutas.md) | Stack, carpetas, autenticación, rutas, despliegue, variables de entorno, valores fijos |
| [02-tablas-y-rls.md](02-tablas-y-rls.md) | Qué tablas lee y escribe el portal (archivo:línea) y la política RLS que cubre cada operación |
| [03-paridad-con-la-app.md](03-paridad-con-la-app.md) | Cada cifra que ve el contratista frente a la función de la app, con su veredicto |
| [04-sincronizacion-de-lib.md](04-sincronizacion-de-lib.md) | Qué archivos de `src/lib` y `scripts/` son copia de la app y cómo mantenerlos idénticos |
| [05-deuda-tecnica.md](05-deuda-tecnica.md) | Deuda abierta del portal |

Dominio en la app: `../../estimaciones-gi-mty/docs/` (03 flujo de estimaciones, 04 anticipos/fondos/cifras, 06 lib, 07 base de datos, 08 permisos, 09 valores fijos, adr/0005 numeración).
