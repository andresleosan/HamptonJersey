# PUB-06 · Registro de integración

Base local d565118, referencia main comprobada el 12-nov-2026. La migración 0042 es provisional hasta verificar el estado remoto antes de su aplicación. Campos económicos, renta con premium y trazabilidad implementados; el historial registra nombres de campos sin copiar los textos libres.

Comprobado: 1219 pruebas Node, 14 Python, compilación, `team:check` y Playwright integrado con D1 ficticia en escritorio y móvil, tanto con Chromium como con WebKit. Chromium se ejecuta sin su sandbox propio únicamente en el contenedor local sin red ni privilegios, a petición de Luis; el modo de producción lo rechaza y se comprobó esa restricción.

Pendiente comprobar de nuevo la referencia remota, migraciones y vía de recuperación; commit, push, migración y publicación requieren autorización explícita. El punto sigue parcial: tablero de main 59/221 (26,7 %) antes y después; el porcentaje público no se ha verificado.
