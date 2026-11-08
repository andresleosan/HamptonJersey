# PRE-11 · Tours externos solo tras elección Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. No implementar este documento sin encargo, revisión del alcance y reserva build propios.

**Goal:** Evitar que los reproductores externos de tours contacten al proveedor antes de una elección explícita del visitante.

**Architecture:** Eliminar la activación por IntersectionObserver. Cada tour/proveedor empieza en poster local con aviso «Loading this tour connects to [provider], which receives your IP address and may use its own storage.» y botón «Load [provider] tour». Cambiar de tour restablece elección; no permiso global persistido. Elegir pestaña Tour en la ficha muestra el mismo control, no iframe automático. Tras pulsar crear iframe validado; botón «Unload tour» elimina iframe y deja aviso/poster; no promete borrar almacenamiento ya creado por proveedor. Fuera del allowlist ofrecer solo enlace HTTPS validado con aviso. No banner global ni CMP nuevo por esta tarea. La validación jurídica del copy pertenece a Hampton, sin impedir implementar el control técnico que evita cargas no elegidas.

**Tech Stack:** JavaScript ESM, React/CSS actual, Pages Functions/D1 y node:test/Playwright locales; sin paquetes nuevos.

**Spec:** [Diseño](../specs/2026-11-08-l1-tour-privacy-design.md).

## Global Constraints

Lista1 · PRE-11. Estado de producto sin cambios. Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

PRE-11 no tiene dependencia de catálogo. No se activa una campaña ni un proveedor nuevo. El diseño del control de carga está cerrado técnicamente; no se presenta como conclusión legal sobre qué cookies son esenciales. Cualquier autorización global persistente o nueva herramienta de consentimiento se diseña por separado.

Superficie web existente, no nueva página: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone actual#77736c; para este control nuevo se adopta stone#6b665e por contraste, sin retokenizar toda la web, y bronze-dk#86542d para texto pequeño. Tenor Sans display400: H2 clamp(24px,3vw,34px)/.01em, cuerpo Montserrat/Helvetica Neue/Arial15px/1.65, copy max68ch. Contenedor1240px, gutter clamp(16px,4vw,40px), secciones clamp(56px,8vw,104px), poster mantiene aspect-ratio y radios16px ya existentes. Botón píldora999px padding13px28px, objetivo44px, foco2px/offset2px; no nueva imagen externa para poster. Mantener estilos de .tour3d-play y .stage; aviso inline12–14px legible, contraste4.5:1. Móvil390/escritorio1280/zoom200%, responsive existente sin nueva rejilla. ENERGY1/RHYTHM1/MOTION1 en este control, hover y reduced motion; no autoplay/scroll-trigger. DESIGN Colors/Typography/Components/Accessibility como fuente, propuestas de restyle global fuera.

Crear `site/tour-privacy.js`: `tourProvider(url):'Matterport'|'Vimeo'|'YouTube'|null`, `privateEmbedUrl(url):string|null` usa la validación equivalente a embedUrl y fija dnt=1 para player.vimeo.com preservando h y otros parámetros válidos, nunca evalúa URL arbitraria. `mountTourGate(container,{url,title,onLoaded}):()=>void` renderiza poster/aviso/botón y devuelve cleanup. Solo un gesto de ese botón llama load; contador stats tour se llama en onLoaded, no al mostrar poster. Cleanup retira iframe, timers y listeners. Foco al iframe con título tras cargar y retorno al botón tras unload; error20s ofrece reintento y enlace externo, sin reintento automático. site/index.html carga /tour-privacy.js como script clásico después de /lib.js y antes del script inline principal; exports CommonJS solo para tests, como lib.js, sin convertir el HTML a módulo ni redefinir globals.

No leer credenciales ni usar datos reales para fixtures. No cambiar red, servicios o controles. Migraciones, si se indican, se numeran contra main vigente al construir, sin ocupar0032 por inercia ni sobrescribir migraciones ajenas. Publicación/activación requieren su autorización separada.

## Review Focus

- Repetición de acción/tick y dos empleados: una mutación efectiva por versión, sin tarea/evento duplicados.
- Cambio de búsqueda/identidad durante respuesta: no aplicar resultado viejo ni afectar otra búsqueda.
- Cero/no-op/fallo/ausencia de upstream: no afirmar éxito ni construir una dependencia ficticia.
- Privacidad/actor equivocado: conservar los límites del canal y no exponer datos de terceros.
- Fechas de Jersey/reflow/foco: resultados y controles utilizables en sus límites exactos.

## Archivos y responsabilidad

Crear site/tour-privacy.js y tests/tour-privacy.test.js; modificar site/index.html para ambas superficies y orden de carga, site/lib.js solo si comparte validación sin duplicarla. Extender tests/lib.test.js. Crear tests/tour-privacy.e2e.cjs. Ajustar site/apply.js renderPrivacy solo con copy descriptivo de elección/proveedor revisable, no afirmaciones legales nuevas.

## Task 1: URLs y gate puro

**Interfaces:** Produce tourProvider/privateEmbedUrl/mountTourGate y cleanup.

- [ ] 1. Añadir prueba de comportamiento: Vimeo dnt0 pasa1 preservando h; youtube-nocookie permitido; javascript/http/hostparecido rechazados; sin iframe hasta click; cleanup elimina efectos. Ejecutar `node --test tests/tour-privacy.test.js tests/lib.test.js` y comprobar RED específico por funcionalidad ausente, distinguiéndolo de fixture roto o dependencia no integrada.
- [ ] 2. Implementar el mínimo descrito: Extraer helper puro usando URL/DOM nativo; tests en jsdom; el helper no accede a datos de usuario ni carga SDK. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `node --test tests/tour-privacy.test.js tests/lib.test.js` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Task 2: Integración portada y ficha

**Interfaces:** Consume gate y cleanup; produce mounts por identidad de tour.

- [ ] 1. Añadir prueba de comportamiento: Sin tráfico al entrar viewport ni con reduced motion cualquiera; cambiar radio/pestaña no hereda permiso; doble click un iframe; cerrar ruta cancela timeout. Ejecutar `E2E_SCRIPT=tests/tour-privacy.e2e.cjs npm run test:e2e` y comprobar RED específico por funcionalidad ausente, distinguiéndolo de fixture roto o dependencia no integrada.
- [ ] 2. Implementar el mínimo descrito: Retirar observerautoplay y sharedplaying, montar gate en ambas superficies, mantener layout/poster/fallbacks y contabilizar gesto efectivo una vez. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `E2E_SCRIPT=tests/tour-privacy.e2e.cjs npm run test:e2e` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Validación final y entrega

- [ ] Ejecutar npm test, npm run build y npm run check:release; suites focales de cada Task y e2e general cuando cambie producto. E2E_SCRIPT selecciona el focal nuevo del mapa de archivos, mediante npm run test:e2e con fixtures locales aislados. No simultanear suites que usen el mismo puerto del host.
- [ ] Recorrido Playwright MCP1280/390 y zoom200% de los controles/estados cambiados, foco/teclado/contraste/consola/red, sin pruebas destructivas reales. Si no está disponible, registrar el pendiente exacto. Cambios solo de pruebas no requieren UI nueva, pero sí ejecutar el recorrido AUT-20.
- [ ] Revisión independiente, resolver defectos importantes y repetir checks afectados. Actualizar ledger/ESTADO y tasks/generados oficiales solo con resultados reales; no cerrar el código completo si el alcance es un tramo. Autor autorizado y SHA exacto antes de revisión de publicación; relevo privado fuera de Git.

## Cobertura

PRE11-1: antes de gesto, llegar al viewport/cambiar radio/abrir pestaña no genera requests, iframes, preconnect ni posters al dominio del proveedor.
PRE11-2: un gesto carga solo el URL permitido elegido, Vimeo dnt=1 preserva h; URL peligrosa no crea iframe.
PRE11-3: cambiar tour/ruta/unload desmonta iframe y timers; sin preferencias persistidas o consentimiento automático.
PRE11-4: teclado, foco, error20s/offline y fallback HTTPS son utilizables. El test registra solo tráfico local/interceptado, no afirma auditar cookies reales de proveedores.

avanzar conserva tarea/dependencias/estados; brainstorming y grill-me documentan decisiones y límites; writing-plans fija archivos/interfaces/pruebas; impeccable conserva foco y copy operativo; security-best-practices/frontend-security-coder exigen auth/SQL parametrizado/texto seguro y datos mínimos; antislop evita estados/estadísticas ficticios y aplica diales; web-performance-optimization limita rondas/bytes y polling; ponytail reutiliza módulos existentes. taste-skill/redesign-skill no aplica a páginas nuevas: no se crea una página ni se rediseña la identidad. Gates runtime se ejecutan al construir, no se acreditan por Markdown.

Todas las casillas anteriores son futuras. Hoy solo se revisan documentos; no se ejecutaron test/build/e2e/migraciones ni se modificó producto.
