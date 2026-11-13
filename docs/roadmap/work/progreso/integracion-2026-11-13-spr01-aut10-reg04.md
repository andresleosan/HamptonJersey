# Integración local · SPR-01, AUT-10 y REG-04

13-nov-2026. Integración sobre `dd63b56e59aa2098c4d2c33813526b7cac0fc89b` de la propuesta de historial de fecha SPR-01, la comparación desconectada de políticas AUT-10 y la normalización desconectada de presupuestos REG-04. Las tres tareas siguen parciales; no se ejecutaron migraciones ni se activaron operaciones o servicios nuevos.

## Verificación de la integración

- `node --test --test-concurrency=4 tests/*.test.js tests/server/*.test.mjs`: **1.786/1.786**, sin fallos ni cancelaciones.
- `python3 -m unittest tests/test_import.py tests/test_directory_manifest.py`: **25/25**.
- `npm run build`, `npm run check:release`, `npm run team:check`, `npm run check:packages` y `git diff --check` pasaron. Vite conservó su aviso por un archivo de más de 500 kB.
- `E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/spr01-history.e2e.cjs npm run test:e2e:isolated`: Chromium y WebKit terminaron con código 0 en contenedores aislados y datos ficticios. Ambos completaron los casos de 1280 px en Jersey y 390 px en Los Ángeles y Kiritimati. No son pruebas de producción.
- El primer intento de navegador se detuvo al llenar los 900 MB del directorio temporal del contenedor con las dependencias y WebKit. El lanzador se ajustó a 1500 MB, conservando red desactivada en modo local, límites de CPU/memoria, ausencia de capacidades y el resto de controles. La repetición terminó correctamente en ambos navegadores; no se ejecutó Chromium en el host.

La propuesta SQL de SPR-01 continúa fuera de `migrations/`; no reconstituye valores ausentes de eventos anteriores y necesita contraste con el esquema vigente y revisión de retención. AUT-10 no lee ni escribe una política efectiva y su ensayo documenta la restauración ABA. REG-04 no ejecuta matching ni acredita autoridad o vigencia. No se ha comprobado D1 remoto ni el uso funcional de producción.
