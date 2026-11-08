# REG-08 · Registro de trabajo

## Construcción y validación, 8 noviembre

Diseño aprobado por Luis con «Vale, está bien, ahora construyelo». Ejecutado nativamente con executing-plans y TDD; las secciones de diseño pendientes siguientes son historia previa, no nuevas solicitudes de aprobación.

- Contrato versionado de prioridades, edades0–17/null y fecha de declaración; no se inventan valores legacy. Pruebas iniciales observadas RED antes de implementar, después78/78 en validación/rutas.
- Matriz de certeza observada RED: parking exacto/mínimo/visitantes/contradicciones; mascotas condicionadas; exterior negado; hogares/fechas/texto pendiente; varias parroquias OR y techo con stretch. Después32/32 con suites existentes.
- Pruebas públicas de serialización RED→GREEN; respuestas conservadas al apagar, edades0 distintas de null, campos inaplicables omitidos. Web/panel compilan sin dependencias nuevas.
- Integración:28candidatos/25plazas, menor score válido antes de27alternativas; doble recálculo sin avisos duplicados; fila individual coherente; lectura actual sin writes ni JSON interno expuesto; conflicto409 conserva datos.
- Regresiones adicionales RED→GREEN: edición ajena con fecha pasada imprescindible, contratoDB incompleto, garaje adicional como mínimo, jardín contradictorio, aviso de lista pendiente de recálculo y ficha retirada/archivada excluida. Focal final20/20; rutas26/26.
- General e2e pasó en la base inicial; se repite en la integrada incluyendo los casos nuevos de AGE-04. Suites completas/build/release integradas en curso al preparar revisión; resultados finales se anotan abajo.
- E2E focal integrado pasó:1280/390, switches derecha, registro de2niños(Under1/7), parking2, mascota, validación de respuesta vacía, tecladoSpace/foco, Back, privacidad de sessionStorage, envío201, fallo de red y reintento, edición+Save+reload en panel, doble zoom sin overflow y sin pageerror. El test usa credenciales sintéticas locales. Se corrigieron dos errores de la propia fixture (rutaAPI y uso de cookie vía navegador), sin tocar auth del producto.
- Capturas inspeccionadas: /tmp/reg08-captures/public-parking-{1280,390}.png, public-children-{1280,390}.png, panel-{1280,390}.png. El grid de los campos ahora puede encoger con zoom; conserva estilos de AGE-04.
- Playwright MCP: intento real falló antes de navegar porque Chrome del servidorMCP no arranca como root con sandbox. No se cambió configuración/seguridad del entorno. Recorrido MCP pendiente; el e2e local y sus capturas son evidencia independiente, no se presentan como MCP aprobado.
- Migración0031 sobre SQLite local con todas las anteriores incluida AGE-040030 y fixture poblada:6aplicantes,6contactos,1shortlist,6eventos conservados; prioridades/edades legacy null, rankpending1, integrity_checkok. E2E aplica también la migración con D1 local.
- Centinela: alerta de constante ficticia en helper de pruebas versionado, clasificada sin exposición de credenciales reales ni remediación. Revisión privada excluida del commit.
- Integración: fetch8-nov detectó AGE-04 en origin/main9d4429cc5ea887f40bf1d0f4a8dd3e4ec3866951. Se conservó intacto /tmp/hampton-reg08 y su árbol7a40bd6; copia nueva /tmp/hampton-reg08-integrated, main9d4429c, aplicación3way sin conflictos. Renombrada migraciónREG-08 de0030provisional a0031, sin modificar0030advertisers. No se publica NOT-11.

### Decisiones del constructor

- Ruling: clientes API antiguos pueden omitir el contrato de prioridades durante el despliegue; el formulario nuevo siempre lo envía y exige parking/mascotas explícitos — conserva compatibilidad de formularios en caché — coste: las altas antiguas necesitan confirmación.
- Ruling: persistir requirements_rank para paginar Review; tarjetas evalúan datos actuales y señalan si la lista requiere recálculo — una lectura no escribe ni reconstruye el pool — coste: tras un recálculo fallido se debe recalcular para renovar candidatos y orden.
- Ruling: ejecución nativa y un commit final de avanzar, sin volver a pedir aprobación del plan — la orden de construir ya autoriza el trabajo — coste: la revisión independiente se hace al final, no tras cada tarea.

Antislop/impeccable: controles familiares pedidos por Luis, mismos tokens, etiqueta estable Must-have y estado On/Off, áreas44px, foco visible; sin assets decorativos, fuentes, paquetes ni pantallas nuevos. Seguridad: allowlist, JSON/textContent, CSRF/autenticación/Turnstile y versiones existentes conservadas; edades fuera de browserstorage. Rendimiento: extracción precomputada, consultas acotadas, sin analizar textos en cada cruce; advertencia de chunkVite grande existente, no se introduce dependencia.

### Revisión independiente y pasada final

Revisor fresco reg08_final_review, gpt-6-astra/high, sobre snapshot7ee90aef0024b555f82d18ea785e8da466802c22 y base9d4429c. Leyó plan/spec y45pruebas focales pasaron. Dictamen inicial con cinco importantes, ningún crítico, menor ni comportamiento excluido de juicio. Se aceptaron los cinco y se corrigieron en una pasada:

- Final: fixed both + budgetMust — prueba de serialización y validación pública de ambas búsquedas RED→GREEN; máximos separados nunca se serializan como respuesta desconocida.
- Final: fixed exterior negado — Garden:No, no private rear garden, garden not included y filas contradictorias RED→GREEN; lectura de specs/prosa separada sin afirmar una negación.
- Final: fixed mascotas restringidas — permiso afirmativo con rechazo en otra fuente, No dogs y consentimiento del propietario RED→GREEN; restricciones/contradicciones quedan pendientes.
- Final: fixed parking con coste extra — available to rent, additional cost y subject to availability RED→GREEN; ninguna confirma capacidad propia.
- Final: fixed suelo de presupuesto convertido en MUST — mínimo1500/máximo2000/precio1000 RED→GREEN; el mínimo solo penaliza la preferencia en el contrato nuevo, el techo sigue vinculante; legacy conserva su comportamiento.

Las cinco pruebas fallaron antes del cambio; después40/40 focales y suite completa742Node+14Python aprobaron. Build/check:release finales aprobaron. E2E focal final volvió a pasar1280/390, teclado, validación, guardado, reintento, persistencia y zoom; capturas actualizadas. Se amplió además el caso de compra/alquiler del e2e general para exigir ambos switches de presupuesto, mostrar ambos techos y comprobar valores/prioridad en ambas filas.

Minor deferred: ninguno. Rulings finales adicionales: ninguno; todos los hallazgos importantes corregidos. Sin segunda revisión ni afirmación de MCP aprobado.

## Arranque

- Luis eligió `$avanzar REG-08` tras recomendar prioridad de parking y distinción de desconocidos en registro, panel y matching, independiente de AGE-04.
- Original `/root/HamptonJersey`: rama de diseño `codex/hampton-design-pass`, HEAD 9527c33 y archivos ajenos/privados. Se conservó intacta. Entregas NOT-11 y EST-18 preservadas.
- Clon nuevo `/tmp/hampton-reg08` desde remoto canónico; fetch 7-nov-2026 21:50:22 UTC. HEAD/main/origin/main = cf0c86dc8a18dc4e1cd71aee822f5d657e0b176e, comparación 0/0, árbol limpio al arrancar.
- Leídas instrucciones de proyecto, skill canónica avanzar y AVANZAR desde este clon; ESTADO, checklist relevante, reconciliación/arquitectura y requisitos de parking del texto privado original. Original privado consultado in situ, sin copiarlo ni editarlo.
- Relevo EST-18 y evidencia de esta sesión confirman publicación/migración0029. Sus documentos públicos quedaron pendientes para mantener congelado el SHA aprobado; se actualizarán dentro del próximo commit autorizado de REG-08.
- Skills de diseño: brainstorming y grill-me. Se conserva el modelo de la sesión, sin cambio automático.

## Exploración

`parking_spaces` permite 0..3 y null. La web lo pregunta como opcional; no existe prioridad. El motor no lo usa como filtro vinculante. `feat_parking=1` mezcla cifra explícita y mínimo de Garage/Parking; Garage: No se interpreta como0 aunque no demuestra ausencia de otras plazas. Corrección acotada de certeza necesaria para no inventar incompatibilidades. Matches conserva Shortlisted aunque deje de pasar y actualiza sus checks, nunca revive Rejected.

Hoja de ruta vigente exige near ante incumplimiento y needs_confirmation ante falta de datos; no procede preguntar al usuario por decisiones ya fijadas. Alcance elegido: integrar REG-08 con componentes actuales, sin reconstruir todo BUS-12. Se redactó propuesta de diseño; pendiente de builder check y aprobación. No se escribió producto, instaló dependencias ni ejecutó migración/push.

## Diseño listo para aprobación

- Builder check independiente obligatorio realizado por `reg08_design_review`: «nothing important left». No surgieron decisiones de negocio adicionales para Luis.
- Cerradas por inspección técnica las decisiones dejadas al constructor: certeza versionada en `feat_evidence`, cuyo consumidor de frases es matching; normalización de parking al leer tarjetas con datos estructurados actuales, reutilizando el evaluador puro. Sin escrituras al leer ni recálculo remoto obligatorio para activar.
- Ajuste conservador: toda evidencia antigua sin versión queda pendiente, incluso si su número parece suficiente; evita heredar conteos de visitantes o inferir ausencia a partir de Garage: No.
- Propuesta presentada para aprobación de diseño, no de publicación. Sin producto ni dependencias instaladas. Las pruebas de comportamiento corresponden a la construcción posterior; no se declaran ejecutadas.
- Siguiente paso tras aprobación: invocar writing-plans, concretar contrato/migración/pruebas y construir REG-08 en esta misma copia. Spec y ledger se incluirán con el código y el estado en el commit final, conforme a avanzar.

## Corrección de Luis: imprescindibles por apartado y edades

- Luis amplía expresamente el encargo: botón en cada requisito pertinente, incluido parking, aceptación de mascotas y parroquia concreta, y edad de cada niño. La propuesta limitada a parking queda sustituida; no estaba aprobada ni implementada.
- Leídos campos del formulario/panel y validación actual, criterios BUS-12 y REG-04/05/06/07/08/09/11. Hay número de niños y total, pero no edades; existen hechos del hogar que no pueden borrarse para mejorar un resultado. Detectado pets considered/negotiable como yes y exterior sin negaciones: la nueva evaluación debe conservar incertidumbre.
- Diseño reescrito en el mismo spec, con control reutilizable Must-have, prioridad por requisito, zonas/tipos alternativos y exteriores independientes, datos familiares separados y evaluación con certeza. Continúa independiente de AGE-04, sin modificar su directorio ni depender de investigación externa. Matching comercial sigue fuera y no se cerrarán todos los códigos afectados por inferencia.
- Pregunta asíncrona enviada: edades obligatorias o permitir To confirm. Se recomienda permitir pendientes. No hay respuesta aún; el diseño lo distingue de una decisión aprobada.
- Revisión del alcance ampliado solicitada a reg08_expanded_design_review conforme a brainstorming; la revisión previa cubría solo parking y no se reutiliza como aprobación de este alcance.
- Sin producto, instalaciones, tests de producto, migración, commit ni push. Modelo/esfuerzo conservados.

### Revisión de la ampliación terminada

reg08_expanded_design_review señaló una pregunta: presupuesto ordinario frente a ampliación explícita cuando se marca Must-have. Resuelta apoyándose en la semántica existente (tope ampliado aceptado): £2.000 + extensión aceptada £2.200 hace de £2.200 el límite final; £2.100 cumple ese límite. El diseño exige mostrar el importe final al lado del control, sin borrar cantidades al pulsarlo. Se registra como propuesta del constructor para que Luis pueda corregirla, no como decisión nueva del usuario.

Sin otras preguntas del revisor. Se presenta el diseño ampliado para aprobación; edades pendientes se proponen expresamente al no haber respuesta asíncrona todavía. El silencio no autoriza implementar. No cambió ningún archivo de producto.

## Interruptores a la derecha: indicación posterior de Luis

Luis pide explícitamente interruptores a la derecha de cada apartado, citando parking, habitaciones, niños y mascotas. Se ajustó el diseño: título a izquierda, Must-have con switch a derecha y valores debajo, responsive/teclado/estado accesible. Se reemplaza aria-pressed por role=switch/aria-checked. Bedrooms aplica al rango del apartado; Children incorpora el interruptor solicitado para priorizar la comprobación de adecuación al hogar, manteniendo siempre cantidades/edades. Sin evidencia familiar estructurada, esa comprobación queda pendiente; no se añade exclusión por edad ni se infiere que los niños sean descartables. Es propuesta funcional del constructor, claramente separada de la posición visual elegida por Luis.

Solo se editaron spec, ledger y relevo. Sin cambio de producto ni pruebas de producto necesarias para este ajuste documental. Continúan pendientes la aprobación global del diseño y la respuesta sobre edades; no se vuelven a solicitar en este ajuste visual. No hay autorización de publicación ni se aplican migraciones.


### Resultado final para entrega

- `npm test`:742JavaScript y14Python, salida0 (/tmp/reg08-final-tests.log).
- `npm run build` y `npm run check:release`:salida0 (/tmp/reg08-final-build.log, /tmp/reg08-final-release.log). Bundleprincipal724.23kB/gzip203.53kB antes de la última corrección; aviso>500kB ya documentado enAGE04. Sin nuevas dependencias.
- E2E general integrado:salida0, `e2e OK (public, urls, admin, reg17)` (/tmp/reg08-integrated-e2e.log), incluye directorioAGE04. Después de la pasada de revisión se repitieron los flujos afectados: ambos presupuestosMust+guardar/editar, `reg17 e2e OK` (/tmp/reg08-final-both-e2e.log), y registro/panel1280/390 completo (/tmp/reg08-final-focal-e2e.log), ambos salida0.
- `git diff --check` limpio; `git ls-remote` tras revisión sigue9d4429cc5ea887f40bf1d0f4a8dd3e4ec3866951. Migración0031 no colisiona con0030AGE04. Snapshot de revisión y original conservados; main listo para un commit final.
- Limitación: PlaywrightMCP no arrancó por sandbox/root del servidor; no se debilitó ningún control. La comprobación nativa no se presenta como MCP.
- REG08 construido/verificado localmente; publicación y migración remota0031 pendientes de aprobación porSHA. La publicación contiene también el main integrado deAGE04, cuyo despliegue/migración0030 se comprobará antes de publicar; no se aplican pendientes de otra tarea implícitamente. NOT11/0028 no incluidos.
- Próxima tarea: BUS14 sobre inventario actual, revisar mínimo35/tope25/bonus de publicación; no toca directorio ni investigaciónAGE04. Modelo gpt-6.1-terra, esfuerzo high, disponibles en la sesión; selección/paginación y dos recálculos con regresiones de decisiones humanas justifican esa pareja. No declara completados M02/M04 ni rankingdía21.
