# Pruebas de navegador

Para pruebas de interfaz ejecuta `E2E_PRODUCTION_READONLY=0 npm run test:e2e:isolated`, seleccionando una prueba concreta con `E2E_SCRIPT=tests/<archivo>.cjs` cuando corresponda. El modo local usa Chromium sin su sandbox únicamente dentro del contenedor temporal sin red, sin capacidades, sin privilegios y con datos ficticios. No ejecutes ese navegador sin sandbox directamente en el host ni lo uses con producción. Para WebKit usa `HAMPTON_E2E_BROWSER=webkit`.

Si el lanzador o sus requisitos no están disponibles, consulta `docs/PRUEBAS-WEBKIT.md`, conserva los controles generales y registra el bloqueo. No presentes una prueba simulada como verificación de producción.

# Avanzar el checklist

`/avanzar` o `$avanzar` sigue `.agents/skills/avanzar/SKILL.md`, la única fuente de reglas. Las autorizaciones permanentes de Luis (commits, push, migraciones aditivas, interruptores) están en `docs/roadmap/CONTINUIDAD-AVANZAR.md`: no vuelvas a pedirlas. La tarea siguiente sale de `node scripts/avanzar-ruta.mjs`.
