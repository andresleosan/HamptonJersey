> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PRE-16 · Traslado de fotos del equipo — plan listo para construir (tramo de fotos)

> Solo planificación. Construcción futura con superpowers:executing-plans y reserva.

**Objetivo:** servir las fotos del equipo desde recursos de Hampton para que la web deje de depender de Wix en ese aspecto. **Arquitectura:** recursos públicos estáticos autorizados, datos de equipo y validación de URLs coherentes; sin cambio de dominio. **Stack:** web estática y pruebas Node. **Spec:** `docs/superpowers/specs/2026-11-08-tanda-ampliada-design.md`.

1. [ ] Inventariar referencias de fotos en `site/data/team.json` y consumidores en `site/index.html`, `site/lib.js` y otras pantallas; utilizar la autorización confirmada por Luis, comprobar integridad de cada archivo y ubicación de origen.
2. [ ] Usar los recursos y rutas locales definidos en el contrato de implementación, conservar el texto alternativo existente y el fallback allí definido; ajustar `site/lib.js` y `site/data/team.json` únicamente de forma coherente con la validación de URL y seguridad de render. Confirmar rutas exactas mediante inspección antes de editar.
3. [ ] Pruebas: fotos de equipo y selección de agente, ruta local válida, URL externa o maliciosa rechazada, archivo inexistente con fallback y sin dependencia de Wix para esas fotos; comprobar carga, tamaño y accesibilidad en escritorio y móvil.
4. [ ] Ejecutar pruebas relevantes, `npm test`, build y check:release, e2e y Playwright 390/1280; comparar imagen y ausencia de errores de red. Solicitar publicación solo al terminar preparación y revisión. **Plan de traslado listo para construir:** la comprobación y descarga de los archivos autorizados son pasos de ejecución; no supone baja de Wix ni cierre total PRE-16.

Luis confirma en nombre de Hampton autorización para copiar y reutilizar en la nueva web las fotos del equipo actualmente publicadas en Wix. Comprobar que los archivos correspondan a las fotos actuales y conserven calidad y accesibilidad.

## Contrato de implementación del traslado

Los dos archivos de `site/data/team.json` son las fotos aprobadas. Guardar copias JPEG en `site/assets/team/gilberto-franco.jpg` y `site/assets/team/joshua-franco.jpg`; comprobar tipo y dimensiones decodificando cada archivo y rechazar respuestas HTML o corruptas. Sin descargar durante la planificación. Conservar nombres y atributos actuales del equipo.

- [ ] Añadir `safeTeamPhoto(u)` en `site/lib.js` que solo admita exactamente esas dos rutas locales; devolver `null` para rutas externas, relativas, traversal, query, fragmentos o tipos distintos de string. Exportarla para `tests/lib.test.js`. No relajar `safeMedia` ni la protección de otros recursos.
- [ ] Actualizar `site/data/team.json` con las rutas y en `site/index.html` reemplazar la sanitización del equipo por `safeTeamPhoto`. Reemplazar las llamadas `wix(t.photo, …)` / `wix(agent.photo, …)` por la ruta validada en las tres ubicaciones: tarjeta de equipo, elección de agente en reserva y detalle de propiedad. Eliminar el helper `wix` si no quedan usos. `esc` sigue envolviendo cada atributo.
- [ ] Añadir pruebas en `tests/lib.test.js` para ambas rutas, `https://` externo, `javascript:`, rutas con `..`, consulta y fragmento; verificar que cada referencia de `team.json` existe. En navegador verificar sin peticiones Wix y con ambas fotos. Si la foto está ausente o falla su carga, omitir u ocultar la imagen en las tres vistas conservando nombre, rol y funcionalidad; probar fallos de carga en las tres. Comprobar que los JPEG decodifican y conservan encuadre, calidad y tamaño razonable.
- [ ] Ejecutar `node --test tests/lib.test.js`, `npm test`, `npm run build`, `npm run check:release` y e2e de web; Playwright 1280/390, equipo, reserva y ficha, red/teclado, sin datos reales. Documentar que el objetivo cubre solo las fotos y no habilita la baja de Wix.

Revisión independiente realizada; el constructor verificará en la base vigente que los dos archivos siguen disponibles y son los aprobados. Si no se pueden obtener o no son los autorizados, detener esa parte y comunicarlo. La construcción y publicación no están autorizadas por esta planificación.
