# PRE-10 · Registrar oposición al marketing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement task-by-task. No implementar este documento sin encargo, revisión del alcance y reserva build propios.

**Goal:** Permitir al empleado registrar una oposición recibida sin perder cambios pendientes ni reactivar consentimientos por accidente.

**Architecture:** Añadir acción «Record marketing objection» en la ficha de contacto compartida, disponible cuando existe opt-in. Mostrar estado actual y explicación: afecta a todas las búsquedas del contacto. Confirmación inline explícita, cancelable; exige resolver primero cambios de contacto sin guardar. No cerrar búsqueda, borrar persona ni tocar consentimientos de otro contacto. Cuando ya no hay opt-in mostrar «Marketing consent not recorded», sin botón que invente una oposición histórica.

**Tech Stack:** JavaScript ESM, React/CSS actual, Pages Functions/D1 y node:test/Playwright locales; sin paquetes nuevos.

**Spec:** [Diseño](../specs/2026-11-08-l1-marketing-objection-design.md).

## Global Constraints

Lista1 · PRE-10 (tramo manual). Estado de producto sin cambios. Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

Catálogo PRE-10: AUT-17 activated y PRE-02 activated solo para canales reales (scope partial). El tramo manual no espera dichos canales; construirlo con alcance/evidencia de unidad explícitos, sin afirmar completado PRE-10 entero. Abogado/equipo deben validar las reglas/copy de marketing por canal antes de activar campañas. Esta entrega no crea campañas ni opina sobre su base legal.

Panel existente: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d para foco, bronze-dk#86542d para texto pequeño/hover, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. CSS actual prevalece sobre propuestas antiguas DESIGN.md Colors/Shapes. Tenor Sans/Georgia/serif H1 26px/H2 19px400; Montserrat/system-ui14px/1.5, auxiliar12px, tabla12px600 y celdas10px12px. page1240px, padding24px16px120px, radio14 tarjeta/10 campo/999 botón, gaps8/12/16/24px. Tabla a tarjetas760px; link/control32px escritorio44px móvil, foco2px/offset2px, contraste4.5:1 texto/3:1 foco. Probar1280/390, teclado/zoom200%/reduced motion. No paquetes, fuentes, imágenes o animaciones nuevas. ENERGY1/RHYTHM1/MOTION1 por comparación operativa y continuidad Hampton.

UI `recordMarketingObjection():Promise<void>` en ApplicantDetail; consume contact.updated_at y marketing_opt_in_at guardados, llama api(`/admin/contacts/${contact.id}`,{method:'PUT',body:{updated_at,marketing:false}}). Servidor conserva saveVersioned y no-op actual. Error409 no reintenta silenciosamente; recargar contacto y pedir confirmación renovada si corresponde. Respuesta tardía tras ID/logout no se aplica.

No leer credenciales ni usar datos reales para fixtures. No cambiar red, servicios o controles. Migraciones, si se indican, se numeran contra main vigente al construir, sin ocupar0032 por inercia ni sobrescribir migraciones ajenas. Publicación/activación requieren su autorización separada.

## Review Focus

- Repetición de acción/tick y dos empleados: una mutación efectiva por versión, sin tarea/evento duplicados.
- Cambio de búsqueda/identidad durante respuesta: no aplicar resultado viejo ni afectar otra búsqueda.
- Cero/no-op/fallo/ausencia de upstream: no afirmar éxito ni construir una dependencia ficticia.
- Privacidad/actor equivocado: conservar los límites del canal y no exponer datos de terceros.
- Fechas de Jersey/reflow/foco: resultados y controles utilizables en sus límites exactos.

## Archivos y responsabilidad

Modificar admin/src/ApplicantDetail.jsx y, si falta estilo inline, admin/src/styles.css. Extender tests/server/applicants.test.mjs. Crear tests/marketing-objection.e2e.cjs; no modificar email transport ni crear esquema.

## Task 1: API de retirada existente

**Interfaces:** Consume contrato PUT contacts existente; no endpoint nuevo.

- [ ] 1. Añadir prueba de comportamiento: marketing:false elimina opt-in; repetir mismo estado no emite otro evento; versión obsoleta409; contacto ajeno/inexistente no es éxito; búsqueda permanece activa. Ejecutar `node --test tests/server/applicants.test.mjs` como baseline: el contrato de retirada ya existe y puede estar GREEN; no forzar un fallo ni reconstruirlo. Solo una regresión real justificaría cambiar servidor.
- [ ] 2. Implementar el mínimo descrito: Ajustar únicamente si las pruebas muestran hueco en el contrato existente; mantener actor/version/evento y no-op. No reconstruir un comportamiento que ya pasa. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `node --test tests/server/applicants.test.mjs` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Task 2: Acción manual en ficha

**Interfaces:** Produce UI recordMarketingObjection sobre snapshot confirmado.

- [ ] 1. Añadir prueba de comportamiento: Confirmar/Cancelar, error red,409, dos pestañas, formulario dirty y dos búsquedas del contacto; sin envío ni divulgación. Ejecutar `E2E_SCRIPT=tests/marketing-objection.e2e.cjs npm run test:e2e` y comprobar RED específico por funcionalidad ausente, distinguiéndolo de fixture roto o dependencia no integrada.
- [ ] 2. Implementar el mínimo descrito: Añadir estado de acción inline, botón y feedback; bloquear mezcla con cambios pendientes de contacto, preservar otros borradores e invalidar respuesta por ID/sesión. Respetar el contrato y errores del diseño; no reemplazar APIs del productor con datos de muestra.
- [ ] 3. Ejecutar `E2E_SCRIPT=tests/marketing-objection.e2e.cjs npm run test:e2e` -> PASS. Revisar el diff de esta unidad y hacer commit acotado en inglés con autor autorizado, sin publicar.

## Validación final y entrega

- [ ] Ejecutar npm test, npm run build y npm run check:release; suites focales de cada Task y e2e general cuando cambie producto. E2E_SCRIPT selecciona el focal nuevo del mapa de archivos, mediante npm run test:e2e con fixtures locales aislados. No simultanear suites que usen el mismo puerto del host.
- [ ] Recorrido Playwright MCP1280/390 y zoom200% de los controles/estados cambiados, foco/teclado/contraste/consola/red, sin pruebas destructivas reales. Si no está disponible, registrar el pendiente exacto. Cambios solo de pruebas no requieren UI nueva, pero sí ejecutar el recorrido AUT-20.
- [ ] Revisión independiente, resolver defectos importantes y repetir checks afectados. Actualizar ledger/ESTADO y tasks/generados oficiales solo con resultados reales; no cerrar el código completo si el alcance es un tramo. Autor autorizado y SHA exacto antes de revisión de publicación; relevo privado fuera de Git.

## Cobertura

PRE10-M1: opt-in existente pasa a null tras confirmación, exactamente un evento efectivo y actor de sesión.
PRE10-M2: dos búsquedas comparten el cambio, sin cerrar ninguna; criterios sin guardar preservados.
PRE10-M3: Cancel/409/401/no-op no revoca por otra cuenta ni confirma éxito falso.
PRE10-M4: comunicaciones promocionales futuras consumen consentimiento actual; activación y reglas legales del resto de PRE-10 siguen pendientes.

avanzar conserva tarea/dependencias/estados; brainstorming y grill-me documentan decisiones y límites; writing-plans fija archivos/interfaces/pruebas; impeccable conserva foco y copy operativo; security-best-practices/frontend-security-coder exigen auth/SQL parametrizado/texto seguro y datos mínimos; antislop evita estados/estadísticas ficticios y aplica diales; web-performance-optimization limita rondas/bytes y polling; ponytail reutiliza módulos existentes. taste-skill/redesign-skill no aplica a páginas nuevas: no se crea una página ni se rediseña la identidad. Gates runtime se ejecutan al construir, no se acreditan por Markdown.

Todas las casillas anteriores son futuras. Hoy solo se revisan documentos; no se ejecutaron test/build/e2e/migraciones ni se modificó producto.
