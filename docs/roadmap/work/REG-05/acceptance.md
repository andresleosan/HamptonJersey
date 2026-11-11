# REG-05 · habitaciones y baños — verificación local

Fecha: 11-nov-2026. Base: `origin/main` observado en `b544c2ea93253ed337f946b325baef93a62a7d10`, en el worktree aislado `/tmp/hampton-reg05`. Este registro se limita al alcance residencial y no reconstruye REG-08.

## Resultado

- El formulario conserva mínimo de dormitorios, máximo, preferencia ideal y mínimo de baños. El valor `0` representa Studio; un máximo inferior al mínimo se rechaza.
- El matching aplica los límites de dormitorios y baños. Una casa fuera del rango de dormitorios no es una coincidencia que cumple.
- Con prioridad `Must-have`, una casa que incumple el rango de dormitorios o el mínimo de baños se conserva como **Alternative** para revisión humana y queda debajo de una casa que sí cumple. No se acepta automáticamente ni se borra una decisión humana.
- La producción está activa: la lista remota de Pages muestra el despliegue de `main` desde `b544c2e`, y `npx wrangler d1 migrations list hampton --remote` respondió que no hay migraciones por aplicar. Como `0031_requirement_priorities.sql` está en el árbol de migraciones, la comprobación confirma su aplicación. No se leyó ni modificó ningún registro de aplicante.
- No se cambió el motor, esquema ni se aplicaron migraciones en esta sesión.

## Evidencia y comprobaciones

- Prueba nueva en `tests/server/match-store.test.mjs`: un rango de uno a dos dormitorios y un baño mínimo clasifican una casa que cumple por encima de alternativas de tres dormitorios o ningún baño.
- Cobertura existente: `tests/apply.test.js` (Studio y límites del formulario), `tests/server/applicants-validate.test.mjs` (validación), `tests/server/requirements.test.mjs` (prioridades y datos históricos) y `tests/server/match-store.test.mjs` (máximo de dormitorios y matching).
- Suite focal: `node --test tests/server/match-store.test.mjs tests/server/requirements.test.mjs tests/apply.test.js tests/server/applicants-validate.test.mjs` — 68/68 aprobadas.
- Suite completa: `npm test` — 1.164 pruebas JavaScript y 14 Python aprobadas. `npm run build`, `npm run check:release`, `npm run team:check` y `npm run check:packages` aprobaron.
- Migración aplicada en esta sesión: no. Producción/activación de REG-08/0031: comprobada por consulta remota de migraciones y despliegue de Pages. No hubo cambios de interfaz; Playwright no aplica a esta unidad de prueba del contrato de matching.

## Pendiente

REG-05 queda completada. REG-08 no se reconstruyó ni migró en esta sesión.
