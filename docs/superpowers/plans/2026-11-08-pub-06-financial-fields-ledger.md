> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-06 · Ledger de planificación

Fecha: 8-nov-2026. Lista 4. Luis autorizó resolver el cierre de SPR-01 y planificar PUB-06; ningún campo de producto se implementa en este encargo.

## Base, reserva y conservación

- Copia propia `[copia local de planificación]`, main/base `6d2f77922f797a1ffd6a23e2030308440ca81adf`.
- Verificador canónico 2026-11-08T12:04:28Z: salida 0, main/HEAD/GitHub iguales, copia limpia al iniciar. La copia SPR-01 conserva sus tres documentos locales; no se copiaron sesiones ni secretos.
- PUB-06 reservada en Lista 4, mode plan, generación1, revisión 120. Scope de tres Markdown aceptado revisión 121 y watch en primer plano.
- [Spec](../specs/2026-11-08-pub-06-financial-fields-design.md) y [plan](2026-11-08-pub-06-financial-fields.md). Los pasos de código son trabajo futuro, no pruebas realizadas.

## Bloqueo anterior resuelto sin desplegar

El servidor rechaza submit con archivos en plan, pero ya admite completar una planificación con revisión documental auténtica. Tras verificar código/cliente, revisión independiente y 25/25 tests del estado más prueba aislada en memoria, se registró design de SPR-01 y complete confirmado: revisión 119, completed/mode plan, recursos vacíos y sin reserva local. No hay evidencia integrada ni se declaró construido SPR-01. Se evitó cambiar el servidor porque el cierre existente permite seguir planificando con todas las protecciones vigentes.

SPR-01 no está implementada: su available_from sigue siendo prerrequisito de construcción para este plan, no bloqueo de planificación. Sus documentos están en la copia anterior, sin publicación ni commit nuevo; las decisiones de fecha necesarias se repiten como contrato aquí sin incluir archivos privados.

## Decisiones y cobertura

| Criterio | Decisiones / lectura | Pruebas futuras |
| --- | --- | --- |
| A1/A2 campos válidos | D1–D3; validateListing/checkPrice/editor actuales. Nuevos costes 0/null y periodos explícitos. | Task 1,V1/V2/API1/API2. |
| A3 negocio compuesto | D7–D9; priceText, priceLabel, amount, SEO actuales. | Task 3,F1/F2/SEO1 y Task 4. |
| A4 ratio | D4–D6; no hay área estructurada actual; columna mínima compartida con PUB-05. | Task 1,R1 y Task 4,UI3. |
| A5 historial | D11; triggers EST-18 enumeran campos y separan texto libre. | Task 2,EV1–EV4. |
| A6 fecha/confirmación | D10/D11; SPR-01 planificada, no integrada; ruta confirma solo cambios en availability/precios actuales. | Task 1 prerrequisito y Task 4. |
| A7 interfaz | DESIGN con nota EST-09, CSS y field/ctl/toForm/toBody actuales. | Task 4,UI1–UI4/MCP. |
| A8 privacidad/importación | D8/D9/D12; toPublic e importadores whitelist actuales. | Tasks 1/3/4 y regresiones previas. |

## Skills y límites

Brainstorming/grill-me usados para cerrar unidades, cero/desconocido, campo compartido, dinero con periodos y exposición pública. Writing-plans, impeccable, seguridad, antislop durante trabajo, rendimiento y ponytail concretados en el plan. No hay página nueva ni restyle; taste/redesign no aplican.

El plan define datos informativos y matemáticas, sin afirmar reglas legales sobre depósitos o tasas, sin asesoría financiera y sin consulta de datos de clientes. Original privado de Luis ausente; fuentes públicas bastan para este alcance. Sin assets, librerías, servicios, secretos ni cambios de infraestructura.

## Comprobaciones y cierre

- [x] Base y reserva plan verificadas; documentos generales reservados por BUS-21 permanecen intactos.
- [x] Requisitos contrastados con PUB-05/PUB-06, arquitectura, schema, validación, editor, formatos, SEO e importación existentes.
- [x] Revisión independiente `pub06_builder_check`: corregidos título SPA de business con solo renta y ruta exacta del test de formato admin. Sin otras contradicciones bloqueantes detectadas en dinero, periodos, cero/null, campos compartidos, triggers o confirmación.
- [x] Validación documental: tres Markdown propios, enlaces válidos, D1–D12/A1–A8 completos, sin placeholders ni patrones de credencial; ejemplos de ratio y periodos comprobados. Test de SEO existente confirmado.
- [x] `node scripts/render-roadmap.mjs --check`: salida 0, 250 tareas/250 unidades, sin generar assets. `git diff --cached --check`: salida 0; producto intacto.
- Cierre documental por evidencia design auténtica y complete en mode plan; el resultado de status y el cierre de watch se registran en el relevo privado. No se envían rutas falsas ni se declara construido PUB-06.
- Playwright: no aplica a documentos. Tests de PUB-06/build/e2e/migraciones: no ejecutados; especificados en Tasks 1–4.
- Commit/publicación: no hay autorización de push; documentos locales se conservan. No presentar SHA base como entrega que los contiene.

Próxima construcción recomendada: SPR-01 antes de PUB-06 por el campo de fecha compartido. Codex `gpt-6.1-terra`, esfuerzo`high`: migración con triggers y guardado concurrente; después PUB-06 mantiene esa recomendación por costes, ratios, API, React y SEO. Valores disponibles en catálogo local; no se cambia el modelo de la sesión actual.

## Integración combinada · 14-nov-2026

La migración nueva `0052_listing_economics_history.sql` combina los cinco términos estructurados con los snapshots de fecha SPR-01. El generador del contrato compara las cuatro definiciones completas con esta migración canónica, no con una propuesta desconectada. A3/A4 premium/renta siguen la decisión D7–D9 de Luis registrada el 13-nov; esta integración no vuelve a decidir ni suma sus importes. La revisión de retención se resuelve mediante el mapa del ciclo existente de ficha/eventos, sin inventar TTL de propiedades ni ampliar EST-19/PRE-12. La tarea no se marca hecha desde esta copia; aplicación, activación y evidencia final corresponden al padre.
