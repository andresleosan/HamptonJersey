# Búsqueda y seguimiento: reorganización del 7 de noviembre de 2026

Estado: **plan maestro en curso**. M03a (EST-09 y continuidad PRE-12) publicado y activado el 7-nov-2026 en `aea7eb5`, con migración 0024; los demás módulos conservan su estado por tarea. Base revisada: `origin/main` en `246300e`, incluidas las entregas de chat y correo. La especificación funcional v1 del 6-nov-2026 proporcionada por Luis es la autoridad para este recorrido. Su original privado no se incorpora al repositorio. Este documento sintetiza requisitos, evidencia y decisiones de implementación; no acredita que las nuevas funciones estén construidas o publicadas.

## 1. Cómo continuar con /avanzar

Leer este documento, `ESTADO.md`, el JSON `datos` del checklist y la [skill versionada](../../.agents/skills/avanzar/SKILL.md). Los códigos existentes se conservan. Las fases F0–F8 indican áreas del producto; **el orden de ejecución de este recorrido es el de abajo**, no el número de fase ni el orden antiguo del 6-nov.

Cada código seleccionado tendrá su propia spec, plan y ledger en `docs/superpowers/`. Antes de código, brainstorming y grill-me resuelven las decisiones que afectan a esa entrega, leyendo primero el repositorio; writing-plans concreta archivos, interfaces, migraciones, pruebas y reglas de DESIGN. Este es el plan maestro por módulos y dependencias: no sustituye el plan de implementación de cada entrega ni autoriza construir todo en un solo cambio.

La documentación, el checklist y la skill pueden publicarse como una entrega documental. Las investigaciones, los envíos, la activación de automatizaciones, las migraciones y el borrado de producción se ejecutarán en sus tareas correspondientes.

## 2. Lo existente que se reutiliza

| Área | Evidencia del código revisado | Alcance real y brecha |
|---|---|---|
| Contactos y solicitudes | `server/applicants.js`, `server/routes/applicants.js`, `migrations/0008_applicants.sql`, `site/apply.js`, `admin/src/ApplicantFields.jsx` | Alta web/panel y deduplicación existen. Existen campos de adultos/niños; faltan obligatoriedad/total y semántica del hogar, criterios por certeza/prioridad, rangos completos, franjas y modalidades comerciales precisas. |
| Matching y revisión | `server/matching.js`, `server/match-store.js`, `server/routes/matches.js`, `admin/src/Review.jsx`, `admin/src/MatchCard.jsx` | Evaluación, recálculo y decisiones existen sobre listings. Parking incumplido y mascotas desconocidas pueden conservar `pass:true`; score no equivale a cumplimiento. No hay inventario común con varias publicaciones. |
| Ampliación de criterios | `server/widen.js`, `admin/src/ApplicantDetail.jsx` | Widen criteria es una base reutilizable; no satisface por sí sola el top 20 interno a los 21 días. |
| Inventario, fotos y editor | `server/routes/listings.js`, `server/media.js`, `server/routes/media.js`, `admin/src/ListingEditor.jsx`, `admin/src/MediaManager.jsx` | Catálogo Hampton y medios existen. No equivalen al registro común de mercado, captura tras confirmar ni descargas privadas por selección/ZIP. |
| Visitas | `server/viewings.js`, `server/viewing-store.js`, `server/routes/inbox.js`, `admin/src/Viewings.jsx`, `admin/src/Availability.jsx` | Agenda de empleados y protección frente a choques existen. Falta coordinación con anunciante y cliente y confirmaciones independientes. |
| Inbox y reloj | `server/routes/notifications.js`, `server/routes/inbox.js`, `server/jobs.js`, `admin/src/Inbox.jsx` | Avisos, eventos y cron existen. Ampliar tipos/estados y tareas con responsable, vencimiento y deduplicación. |
| Correo AUT-17 | `server/email.js`, `server/email-inbound.js`, `server/routes/email.js`, `migrations/0023_email.sql` | Transporte, estados e interfaz construidos en main; conservar el cierre operativo pendiente en ESTADO. Falta el dominio de consultas compartidas y clasificar respuestas útiles. No reconstruir correo. |
| Chat MSG-02 | `server/chat.js`, `server/routes/chats.js`, `migrations/0022_chats.sql` | Chat humano construido. No resuelve por sí solo búsqueda comercial, captación completa ni mensajes a Facebook. |
| Hermes | `server/routes/hermes.js`, `hermes/`, migraciones 0018/0020 | Puerta limitada, jobs y lector de importación son bases. No asumir que el agente tiene lectura general de internet o acceso a clientes. |
| Conservación y cierre | `server/retention.js`, `server/routes/sales.js` | EST-09 publicado y activado en aea7eb5: search_state separado de Stage; completar venta no resuelve la búsqueda. Cualquier búsqueda active/needs_review protege el contacto; revisión desde 11 meses y plazo existente tras cierre humano. Migración 0024 aplicada el 7-nov; G2 incluye la protección de búsquedas abiertas. |

Las afirmaciones de despliegue se conservan en ESTADO con su evidencia histórica. En esta revisión no se ha consultado ni alterado la base de producción.

## 3. Reglas que sustituyen el plan antiguo

1. Evaluación de criterios, decisión del empleado, disponibilidad, publicación, visita, archivos y búsqueda son dimensiones independientes. `approved` no significa `available`, `confirmed viewing` ni `resolved search`.
2. Todo imprescindible y toda exclusión se evalúan antes del ranking. Desconocido queda pendiente; cero, no, no aplica y desconocido son valores distintos. El rango de dormitorios incluye mínimo y máximo. Mascotas y ocupantes son hechos.
3. La aprobación humana del match es obligatoria. Se elimina el paso automático por porcentaje de aciertos de BUS-16. Aprobar permite la consulta inicial delimitada, no flexibilizar criterios ni divulgar la ficha del cliente.
4. Las tres investigaciones de fuentes son separadas y **secuenciales**, cada una con hallazgos nuevos, contraste y pendientes. Después se carga el inventario y se revisa al menos diariamente, aunque no haya clientes nuevos.
5. Places.je puede ser una fuente si se habilita; su clave deja de bloquear todo el inventario. Los accesos restringidos generan tareas manuales. Un fallo o un anuncio ausente no acredita indisponibilidad.
6. Consulta compartida por propiedad/operación/alcance compatible. Si se mencionan residentes, son los de un caso seleccionado; nunca se suman familias. La compatibilidad de cada familia sigue separada.
7. Primer contacto: inmueble, interés, disponibilidad y posibilidades de visita; solo número de ocupantes en vivienda. La comisión se trata personalmente y no bloquea automáticamente una visita. Se retiran de este recorrido los recordatorios de agencia en cadena: envío real → dos días sin respuesta útil → llamada.
8. Confirmar disponibilidad activa captura completa y ficha interna. Fotografías para presentación: propias o versiones sin marca autorizadas. Una eliminación automática de marcas no cumple el requisito. No republicar inventario ajeno en la web de Hampton.
9. La búsqueda continúa durante llamadas, visitas, ofertas y negociaciones. La falta de respuesta, una etiqueta comercial, el día 21 y la antigüedad no la cierran. Pausa/retirada voluntaria quedan pendientes de definición.
10. El día 21 produce hasta 20 alternativas internas explicables. No se envían automáticamente ni se pide al cliente flexibilizar por iniciativa del bot. Los cambios dictados necesitan una propuesta y confirmación humana.
11. La indisponibilidad se aplica al alcance acreditado: publicación, anunciante, operación o inmueble. La observación web no sobrescribe una confirmación humana posterior. Reactivar requiere revisión.
12. Los seis meses afectan a los archivos definidos de la papelera; no autorizan borrar historial de clientes. El cierre exitoso requiere empleado, fecha y motivo y preserva las consultas útiles a otras búsquedas.

## 4. Orden de entrega y dependencias

| Orden | Módulo y códigos que se ejecutan juntos o en entregas pequeñas | Depende de | Resultado que permite continuar |
|---|---|---|---|
| 1 | **M03** ciclo de búsqueda y registro: EST-09, REG-11, REG-17; PRE-12 | Decisiones de campos aplicables | Búsqueda activa independiente de etapa, criterios y franjas versionados; cierre humano y conservación reconciliados. |
| 2 | **M01** directorio: AGE-04, BUS-19, BUS-21 → BUS-22 → BUS-23 | Acceso por fuente; cada investigación depende de la anterior | Directorio y anunciantes con teléfonos; tres pasadas contrastadas. Se puede desarrollar junto a M03, pero no paralelizar las tres investigaciones. |
| 3 | **M02** inventario: BUS-06, BUS-09, BUS-10, BUS-07, EST-16, SPR-07 | M01 para captura real | Propiedad/publicación/anunciante, procedencia y normalización; carga inicial completa por tandas. |
| 4 | **M04** matching y revisión: BUS-12, BUS-13, BUS-14, BUS-15, BUS-16, SAP-01–03 | M03 y contrato M02 | Completo/pendiente/alternativa/excluido separados; decisión humana y razones. |
| 5 | **M13a** tareas compartidas: NOT-01, NOT-08, NOT-09, NOT-11, EST-18 | M03; se amplía con cada módulo | Tareas con responsable, enlace, versión y cierre consistente. No aplazar el inbox al final. |
| 5b | **M12a** indisponibilidad: EST-15, EST-07 | M02/M04/M13a, confirmación manual | Exclusión por alcance, propagación, prioridad humana y anti-reactivación antes de activar barrido/contactos. |
| 6 | **M05** recorrido diario: BUS-08, BUS-04, BUS-05, BUS-01 | M02, M04, M12a, M13a | Reanudación por fuente y recálculo por cambios materiales; opera sin altas nuevas. |
| 7 | **M06** consultas y llamadas: AGE-03, AGE-05, AGE-06, AGE-08, EST-13, AUT-11 | M02–04, M12a, M13a; AUT-17 operativo para envío automático | Una consulta compartida, respuesta útil o llamada a los dos días; canal manual si falta integración. |
| 8 | **M07** captura privada: SPR-03, SPR-05, SPR-08, AGE-10 | Confirmación M06; M02/M13a | Ficha común, originales y descargas privadas, permiso de imágenes y fallo parcial visible. |
| 9 | **M08** presentación: AGE-11, AGE-12, AGE-13, SAP-09 | M04/M06/M07, decisión del disparador | Presentación privada y respuesta sencilla; no autopausa. |
| 10 | **M09** visitas externas: VIS-17, VIS-08, VIS-10, EST-14 | M03/M06/M08 | Propuestas compatibles y confirmaciones de partes; búsqueda sigue activa. Calendar y recordatorios son extensiones, no requisito de coordinación manual. |
| 11 | **M10** revisión día 21: BUS-17, SAP-10, EST-10, EST-11 | M03–05/M13a y reglas del reloj | Top 20 interno y tarea humana, sin cambiar criterios. Puede adelantarse respecto a M06–09. |
| 12 | **M11** dictado: AUT-19, REG-13 | M03/M04/M13a; carril de datos apto para transcripción | Propuesta de cambios con confirmación y control de versión. Edición manual funciona antes. |
| 13 | **M12b** purga de papelera: EST-19 | M02/M06/M07 y política de archivos | Purga segura a seis meses sobre exclusión ya implantada en M12a; activar al final de sus pruebas. |
| 14 | **M13b** recorrido integrado y cierre: AUT-20 | Todos los módulos anteriores | Los 16 ejemplos funcionales y los casos de concurrencia pasan juntos. |

**M03a preparada:** EST-09 y continuidad PRE-12 construidos y verificados localmente, pendientes de publicación/0024. **Próxima construcción recomendada:** `/avanzar REG-11` (M03b), con preguntas comerciales D08 por concretar; REG-17 seguirá después. M01 puede avanzar por su propia dependencia y sus tres investigaciones siguen siendo secuenciales.

AUT-17 conserva su cierre operativo pendiente y puede avanzar con su propia autorización. MSG-02, MSG-04/05, AUT-16, administración de alquileres, ofertas, publicación propia, analítica y tours siguen en el checklist; no se borran ni se convierten en dependencias artificiales del nuevo recorrido. PRE-22 solo condiciona la gestión comercial humana que lo necesite. PRE-32 y las reglas de datos siguen condicionando el uso del modelo correspondiente.

## 5. Contratos funcionales de cada módulo

Los nombres nuevos son propuestas de contrato, no tablas ya migradas. El plan de cada entrega fija las firmas y el número libre de migración contra `main` actualizado; no reservar 0022/0023, que ya existen.

### M01 · Fuentes y anunciantes

- **Consume/produce:** resultados previos y enlaces → directorio único con fuentes, canales, anunciante, todos los teléfonos etiquetados, acceso, evidencia, `last_attempt_at` y `last_success_at`; `research_runs` y diferencias por pasada.
- **Inicio/fin:** encargo de cada investigación → cobertura de agencias, portales/clasificados y Facebook/Marketplace/grupos registrada, pendientes visibles y diferencias respecto al conjunto anterior. Solo tras cerrar BUS-21 comienza BUS-22; después BUS-23.
- **Bot/persona:** investiga páginas accesibles y propone agrupaciones; el empleado confirma identidades y gestiona acceso manual. Fuente pendiente no equivale a cero anuncios. Excluir Nueva Jersey por evidencia geográfica.
- **Cambios:** ampliar directorio y contratos de importación; nueva ruta/pantalla de fuentes y anunciantes siguiendo patrones de `server/routes/` y `admin/src/Research.jsx`; no dar a Hermes acceso general a D1.
- **Aceptación:** una fuente repetida conserva sus canales; una fuente inaccesible muestra pendiente y última comprobación correcta; tres informes distintos, no tres lecturas del primero.

### M02 · Propiedad común e inventario inicial

- **Consume/produce:** directorio y anuncios → `properties`, publicaciones y observaciones con precio original/moneda/periodicidad, equivalente mensual separado, gastos aparte, anuncio/operación/anunciante y certeza por campo. Compra, renta y traspaso nunca se comparan como el mismo importe.
- **Inicio/fin:** tanda del inventario → cursor y resultados persistidos, errores visibles; termina el recorrido cuando cada fuente tiene resultado o pendiente explícito. No descargar toda la galería en esta etapa.
- **Bot/persona:** extracción con evidencia; duplicados dudosos a revisión. Una dirección compartida no fusiona dos unidades. Una propiedad puede tener operaciones distintas.
- **Cambios:** añadir almacenamiento de mercado junto a `listings`; enlazar catálogo propio sin republicar terceros; migrar vínculos de matches con compatibilidad y prueba de recuentos. Reutilizar editor y filtros; no hacer del JSON importado una segunda fuente de verdad.
- **Aceptación:** tres anuncios de una casa → una propiedad, tres publicaciones/contactos; dos pisos de la misma dirección → dos propiedades; £24.000/año → £2.000/mes conservando origen; reintento no duplica.

### M03 · Búsqueda, formulario y cierre humano

- **Consume/produce:** contacto identificado y respuestas → búsqueda por operación con criterios versionados, prioridad, exclusiones, certeza, hechos del hogar, responsable y franjas `Europe/Jersey`. Compra y alquiler simultáneos conservan presupuestos separados.
- **Campos propuestos para concretar:** vivienda: adultos, niños, total, mascotas tipo/cantidad, dormitorios mínimo/máximo, parking y extras. Comercial: inmueble/negocio/ambos, operación, superficie mínima/máxima y unidad, uso deseado, zona/exclusiones, renta/compra/traspaso/gastos separados, acceso y fecha. Preguntar solo lo aplicable; cada imprescindible admite dato explícito o desconocido, sin fabricar un no.
- **Inicio/fin:** registro → confirmación veraz y cruce inicial; la búsqueda continúa hasta `resolved` anotado por un empleado. La confirmación de registro no promete casa ni visita. El cierre cancela solo tareas sin utilidad restante, conserva historial y deja el barrido diario funcionando.
- **Cambios:** `server/applicants.js`, `server/routes/applicants.js`, `site/apply.js`, `ApplicantFields.jsx`, `ApplicantDetail.jsx`; revisar `server/match-store.js`, `server/routes/sales.js` y `server/retention.js` para que etapa, conservación y búsqueda no se contradigan. Migración aditiva y revisión humana de registros antiguos ambiguos; no reabrir ni resolver masivamente por deducción.
- **Aceptación:** ninguna visita/oferta/inactividad cierra una búsqueda; resolver una de dos búsquedas no cierra la otra ni una consulta compartida útil. G2 no puede borrar silenciosamente una búsqueda activa: su adaptación y política de conservación se validan antes de activar el nuevo ciclo; no se promete retención personal ilimitada.

### M04 · Criterios y revisión

- **Consume/produce:** versión de búsqueda + versión de propiedad → evaluación `complete / needs_confirmation / near / excluded`, razones por criterio, fechas/evidencia y decisión `pending / approved / rejected` independiente.
- **Inicio/fin:** alta o cambio material → recálculo; revisión humana termina en aprobar, rechazar o dejar pendiente. Aprobar no convierte un incumplimiento en válido. Cambios posteriores invalidan la autorización antigua y revisan acciones en cola.
- **Bot/persona:** reglas deterministas primero; ranking solo sobre preferencias de candidatos válidos. Alternativas internas se ordenan por incumplimientos explicados; consultas desde datos pendientes requieren la decisión D06, no se activan por defecto.
- **Cambios:** `server/matching.js`, `server/match-store.js`, `server/routes/matches.js`, `Review.jsx`, `MatchCard.jsx`; identidad búsqueda×propiedad×operación, sin duplicar avisos al recalcular lo mismo. Restricciones de vivienda se conservan; verificar su fuente al implementar, sin alterar reglas legales por inferencia.
- **Aceptación:** parking obligatorio ausente = near; mascotas desconocidas = needs_confirmation; precio sobre máximo = near aunque score sea alto; exceso sobre máximo de dormitorios falla; rechazo no marca la propiedad no disponible. Dos empleados no generan dos autorizaciones/envíos.

### M05 · Actualización diaria

- **Consume/produce:** fuentes, cursores y observaciones → nuevas/cambiadas/no localizadas/fallidas y búsquedas activas afectadas. Distinguir intento de lectura y lectura correcta. La fecha de observación web y la confirmación comercial se guardan separadas; `listings.confirmed_at` actual también cambia por publicar/precio y no acredita confirmación del anunciante.
- **Inicio/fin:** reloj diario → todas las tandas completadas o pendientes accionables. Reintentos retoman cursor sin duplicar ni repetir avisos idénticos. Horario concreto a fijar en el plan; la obligación es diaria.
- **Cambios:** ampliar `server/jobs.js` y puerta limitada de trabajos de extracción; `Automations.jsx` muestra estado, retraso y errores. No usar sesiones de Codex abiertas como scheduler ni ampliar la jaula de Hermes sin tarea y revisión separadas.
- **Aceptación:** bajada de precio genera nuevas coincidencias; web caída mantiene disponibilidad sin confirmar y crea tarea; anuncio ausente no cancela una visita; confirmación humana posterior prevalece sobre anuncio viejo; cero clientes no detiene el barrido.

### M06 · Consulta, respuesta y llamada

- **Consume/produce:** match aprobado vigente → gestión por propiedad/operación/anunciante/alcance con vínculos a búsquedas, caso de ocupantes seleccionado, mensajes y resultado útil. Estados de transporte y respuesta comercial separados. No convertir `listings.confirmed_at` ni una lectura web en confirmación comercial: registrar fecha, persona/canal, evidencia y alcance propios.
- **Inicio/fin:** aprobación → envío o tarea manual con destinatario y texto; `sent_at` solo tras envío acreditado. Dos días sin respuesta útil → tarea de llamada con **todos** los teléfonos y contexto. Termina con respuesta útil o resolución humana; una llamada inconclusa sigue pendiente.
- **Cambios:** reutilizar outbox/inbound de AUT-17; añadir dominio de outreach y enlace a Inbox. Correlación por hilo/referencia, deduplicación, bloqueo/versión antes de envío y control de pausa. Canal sin integración operativa queda manual y no cuenta como enviado.
- **Bot/persona:** respuesta automática, ambigua o de otro inmueble no confirma. Interpretación IA es propuesta cuando hay ambigüedad y nunca recibe más datos de los permitidos. La llamada del empleado confirma con evidencia y alcance. No tratar todos los mensajes como datos públicos.
- **Aceptación:** cinco aprobados comparten una consulta general, sin mezclar ocupantes; la aceptación de una familia no acredita las demás; respuesta antes de llamar actualiza tarea; reintento concurrente no duplica correo. Si el proveedor pudo aceptar pero se perdió el acuse, reconciliar antes de reintentar.

### M07 · Captura y descargas

- **Consume/produce:** disponibilidad confirmada → ficha versionada, detalles, originales, procedencia, estado de captura y permiso de presentación por archivo.
- **Inicio/fin:** confirmación → captura pendiente/parcial/completa y tarea «Open property»; la misma ficha sirve a varias búsquedas. Si falla una foto, mostrar parcial y reintentar esa pieza.
- **Cambios:** ampliar `server/media.js` y rutas protegidas; fotos internas nunca por URL pública que eluda permisos. Descarga individual, selección y ZIP con límites; propuesta de datos: JSON para conservar estructura y CSV legible para campos tabulares, decisión D10. No reemplazar originales al corregir datos.
- **Aceptación:** captura única compartida, enlace directo, descarga autenticada de cada modalidad y errores parciales visibles; presentación bloqueada para fotos con marca sin versión autorizada; no scraping diario de galerías completas.

### M08 · Presentación y respuesta

- **Consume/produce:** match aprobado válido + disponibilidad vigente + imágenes aptas → presentación privada breve, estado de entrega y respuesta `interested / wants_viewing / not_suitable / call_me` con motivo opcional.
- **Inicio/fin:** condiciones y disparador D05 → entrega; respuesta actualiza la relación, sin cambiar criterios. Cierre de búsqueda invalida enlaces/acciones que ya no procedan sin afectar al historial.
- **Cambios:** AGE-12 portal limitado por token revocable y alcance de búsqueda; reutilizar transporte AUT-17. Criterios personales no se guardan en localStorage; el portal no enumera otros clientes. Copy visible en inglés: «Would you like to view it?».
- **Aceptación:** no repetir formulario, no enviar alternativas internas, no enviar con fotos inadecuadas o autorización caducada; silencio no pausa automáticamente. Recordatorios adicionales de cliente requieren política propia, no heredan los antiguos 24/72 h como acuerdo nuevo.

### M09 · Coordinación de visitas

- **Consume/produce:** interés y franjas actualizadas del cliente + anunciante + empleado → opciones concretas, confirmación individual de cada parte y visita versionada. Guardar vínculos persistentes de visita con búsqueda, contacto, propiedad y gestión; la asociación actual por email/teléfono no basta para dos búsquedas del mismo cliente.
- **Inicio/fin:** quiere visitar → propuesta → confirmaciones necesarias → confirmada. Cancelación/reprogramación modifica la misma gestión y tareas; no cierra búsqueda.
- **Cambios:** extender `server/viewings.js`, `server/viewing-store.js`, `Viewings.jsx`, `SlotPicker.jsx` con inventario externo y confirmaciones; conservar la reserva propia existente y sus pruebas de colisión. Usar zona Jersey con cambios de hora; fecha y duración explícitas.
- **Aceptación:** propuesta de agencia sola no confirma; dos reservas no ganan el mismo hueco; una reprogramación retira confirmaciones incompatibles y requiere nuevas; ausencia de integración Calendar permite coordinación manual trazable. Con dos búsquedas del mismo cliente, resolver una no cancela la visita de la otra.

### M10 · Revisión interna a 21 días

- **Consume/produce:** búsqueda activa, historial de evaluaciones, cobertura de fuentes y reloj acordado → una revisión interna con hasta 20 alternativas útiles, diferencias y ajustes concretos.
- **Inicio/fin:** vence el reloj sin coincidencia completa según D03 → tarea del responsable; termina cuando el empleado registra la conversación o decide mantener criterios, sin cerrar búsqueda. No crear tarea nueva cada día sin D04.
- **Cambios:** reutilizar Widen criteria y ampliar `server/matching.js`, `server/jobs.js`, `ApplicantDetail.jsx` e Inbox. Guardar versión del ranking y no reinterpretar como match una alternativa aprobada para conversación.
- **Aceptación:** 0, 4 y 30 alternativas producen 0, 4 y 20 resultados; mostrar £150 sobre presupuesto o una plaza menos, información pendiente y fuentes fallidas por separado; ningún correo ni cambio de criterio automático.

### M11 · Actualización por dictado

- **Consume/produce:** instrucciones del empleado y versión actual → propuesta campo anterior/nuevo, certeza y autor; solo tras confirmación → nueva versión y recálculo.
- **Inicio/fin:** dictado → borrador revisable → confirmar/corregir/descartar. Si otro empleado cambia los criterios, detener aplicación y pedir reconciliación; no sobreescribir.
- **Cambios:** ampliar jobs con tipo y permisos específicos cuando exista carril apto; alternativa inmediata de edición manual. No enviar voz con datos personales al Hermes limitado a datos públicos ni por Telegram; revisar políticas de transcripción/conservación en el plan de AUT-19.
- **Aceptación:** subida de presupuesto y nueva zona no eliminan parking ni mascotas; borrador sin confirmar no afecta matches; doble clic no aplica dos veces; datos ajenos al encargo no se guardan.

### M12 · Indisponibilidad y seis meses

Dos entregas: **M12a** exclusión, propagación y prioridad humana antes de activar M05/M06; **M12b** purga a seis meses tras captura M07. La confirmación manual permite probar M12a sin depender del correo.

- **Consume/produce:** confirmación con alcance → retiro de propuestas de esa operación, tareas/visitas afectadas y papelera con fecha de entrada. La purga elimina solo archivos definidos y mantiene referencias mínimas.
- **Inicio/fin:** confirmación → archivo; seis meses calendario desde entrada → purga idempotente, verificable y registrada. Un fallo parcial conserva estado pendiente. Reactivación revisada antes de vencer cancela la purga; no reactivar por scraping.
- **Cambios:** registro de identidades purgadas (IDs de fuente/URL normalizada/operación y referencia interna mínima) para no recrear desde anuncios viejos; `server/retention.js`, almacenamiento privado y `server/jobs.js`. Prueba previa sin borrado y revisión del conjunto exacto antes de activar.
- **Aceptación:** no borrar fichas de clientes, mensajes, visitas, eventos ni archivos compartidos todavía utilizados por una operación activa; retirar una publicación no retira automáticamente las demás; mismo anuncio viejo tras purga queda para revisión, no nuevo disponible.

### M13 · Inbox y consistencia transversal

- **Consume/produce:** eventos de cada módulo → tareas únicas por tipo/entidad/versión, responsable, motivo, vencimiento, enlaces y acción. Feed informativo y trabajo pendiente mantienen significados separados.
- **Inicio/fin:** evento material → tarea; resultado útil o estado nuevo → actualizar/resolver la existente, conservando trazabilidad. Registrar actor, fecha, versión y evidencia sin secretos en logs.
- **Cambios:** ampliar CHECK de eventos/notificaciones con migraciones y pruebas; `Inbox.jsx`, `server/routes/inbox.js`, `server/routes/notifications.js`; operaciones atómicas/condicionales para dos empleados. La app aplica permisos; el modelo no decide autorización.
- **Aceptación:** llamadas con todos los teléfonos, fuente fallida, captura parcial, cambio dictado y top20 accesibles en un clic; dos empleados o dos ticks del reloj no duplican tareas/envíos; respuesta y cierre concurrentes conservan lo que aún sirve a otros clientes.

## 6. Decisiones abiertas: propuestas, no acuerdos

Resolver cada una con brainstorming/grill-me al comenzar la entrega que la consume. No bloquear investigación o trabajo independiente por una decisión de otra entrega.

| ID | Falta decidir | Recomendación para revisar | Tareas que la necesitan |
|---|---|---|---|
| D01 | Dos días naturales/laborables y fines de semana | Vencer a 48 horas del envío real; mantener vencimiento visible y asignar la llamada al siguiente turno disponible, sin correo extra. | AGE-08 |
| D02 | Vigencia de disponibilidad | Ventana configurable por operación, con propuesta inicial de 48 h alquiler y 7 días compra; cualquier contradicción material exige reconfirmar antes. Validar con el equipo, no heredar 7/30 días de anuncios. | AGE-03, AGE-11, VIS-17 |
| D03 | Reloj 21 días y candidatos que desaparecieron | Conservar fecha de búsqueda; cambios de criterios no reinician silenciosamente. Guardar fecha de última coincidencia completa y revisar al día 21 si ninguna sigue útil, mostrando las retiradas. | BUS-17 |
| D04 | Repetir top20 | Una tarea por episodio; nueva revisión a petición del empleado o cambio material, sin frecuencia diaria implícita. | BUS-17 |
| D05 | Envío de presentación | Revisión final del empleado en la primera versión; distinta de aprobar contacto con anunciante. | AGE-11 |
| D06 | Consultar desde cola de imprescindibles desconocidos | Acción humana separada «Ask to confirm details», con alcance limitado y estado pendiente; desactivada hasta acordarla. | BUS-15, AGE-03 |
| D07 | Más de una pasada diaria | Empezar con una diaria observable y medir cobertura/errores antes de aumentar por fuente. | BUS-08 |
| D08 | Campos comerciales/negocios | Separar inmueble, negocio y ambos; uso, superficie/unidad, modalidad y precio/periodo/traspaso/gastos, zonas y disponibilidad. Validar preguntas con Hampton. | REG-11 |
| D09 | Ranking de alternativas | Primero número de imprescindibles incumplidos, después distancia explicada en cada criterio y preferencias; no sumar libras, metros y parking sin una regla acordada. | BUS-17 |
| D10 | Archivos purgados y exportaciones | Purgar originales descargados, derivados y paquetes de presentación sin uso activo; conservar IDs mínimos/eventos/referencias y evidencia necesaria según política acordada. JSON + CSV para datos; ZIP para selección de fotos. | SPR-03, EST-19 |
| D11 | Fuentes y canales utilizables | Registro por fuente/canal con prueba de acceso; lo restringido y los envíos sin integración se resuelven con tarea manual, nunca como éxito ficticio. | BUS-19/21, AGE-03 |
| D12 | Pausa/retirada voluntaria | Dejar fuera de la primera entrega salvo decisión explícita; distinguir después de «resolved» sin cierre por silencio. | SAP-10, EST-09 |

**C01 resuelto para EST-09:** Luis eligió opción 1 el 7-nov: active/needs_review protege el contacto compartido; revisión humana desde 11 meses; con todas resueltas, 12 meses desde última actividad incluido cierre y excepciones existentes. Visitas, correo y chat conservan reglas independientes; no hay conservación personal ilimitada. Implementación y pruebas locales en el ledger EST-09; publicación y migración 0024 pendientes. EST-19 sigue limitado a archivos de propiedades.

## 7. DESIGN.md y skills: contrato para cada plan

Fuente: DESIGN.md de main revisado. Las propuestas de unificación siguen siendo propuestas; las entregas posteriores deben volver a leer la versión vigente. Esta reorganización no rediseña la aplicación ni publica la rama de diseño abierta en otro checkout.

- **Paleta existente web:** ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#77736c`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, campos `#fbfaf8`. **Panel:** ink `#141414`, paper `#ffffff`, mist `#f2efe9`, line `#e2ddd4`, stone `#6b665e`, bronze `#8a6a3b`, ok `#1f6b3a`, err `#a32020`, warn `#fff6e5`.
- **Tipografía:** Tenor Sans display y Montserrat cuerpo, pesos 400/500/600, ninguna familia nueva. Web cuerpo 15px/1.65; panel 14px/1.5, H1 26px, H2 19px, labels 12px. La cabecera de main define display `clamp(34px,6vw,72px)`, 1.05, tracking `.06em`; no sustituirlo silenciosamente por valores de otra rama. Copy visible y mensajes API en inglés; documentación de trabajo en español.
- **Geometría:** contenedor 1240px; gutter web `clamp(16px,4vw,40px)`; sección `clamp(56px,8vw,104px)`; panel lateral 16px y 120px inferior. Botones 999px; web tarjetas 16px/grandes24px/campos12px; panel tarjetas14px/campos10px. Botón web padding13px28px; panel10px20px; tarjeta panel24px; celdas10px12px. Inbox 340px+detalle, editor lateral280px; apilar para móvil.
- **Componentes:** reutilizar `.btn`, `.opts`, `.field`, `.card`, `.seg`, `table.list`, `.badge`, `.empty`, `.actionbar`. Estados de carga, vacío, error, parcial, deshabilitado y confirmación. Texto además de color; errores junto a acción, sin inventar toasts ni grandes tarjetas de estadísticas.
- **Propuestas que se deciden por pantalla:** escala de espacios nueva 4/8/12/16/24/32/48/64; breakpoints480/760/980; stone unificado `#6b665e`, bronze pequeño/fondo de texto blanco `#86542d`, borde de campo `#8f8a82`. No describirlas como tokens ya aplicados; corregir contraste de la pantalla tocada con valores comprobados.
- **Accesibilidad:** texto normal ≥4.5:1; grande y foco/bordes ≥3:1; foco2px offset2px; labels nativos, errores `aria-invalid`/`aria-describedby`, mensajes status/alert, teclado, 200% zoom, controles sin arrastre obligatorio, no foco tapado, reduced-motion. Comprobar escritorio1280 y móvil390.
- **Rendimiento:** imágenes dimensionadas/aspect-ratio, miniaturas en listas, lazy fuera de primera pantalla, CLS<0.1; ninguna fuente/librería nueva sin razón; animación solo transform/opacity150–350ms y apagable; JS/CSS nativos, terceros async cuando se usan, captura y ZIP acotados por tamaño/paginación.
- **Seguridad:** `esc()`/`textContent`, sin HTML sin escapar ni `dangerouslySetInnerHTML`; validar enlaces con helpers existentes, `noopener noreferrer`; no datos personales en localStorage; validar servidor, permisos y Turnstile donde corresponda; no handlers inline nuevos ni `javascript:`. Fotos internas y tokens del portal requieren autorización real en cada lectura/descarga; el proveedor de modelos no recibe datos fuera de su clase permitida.

| Skill | Aplicación en el plan y en la revisión |
|---|---|
| brainstorming + grill-me | Aclarar intención, estados, errores y decisiones abiertas del módulo con pocas preguntas concretas; resolver por lectura lo que ya consta. |
| writing-plans | Pasos verificables, archivos exactos, firmas/datos de entrada y salida, migración y pruebas; no dejar la decisión esencial en «implementar correctamente». |
| impeccable | Jerarquía de acciones, claridad de estados, teclado y flujo completo de la pantalla. |
| taste-skill / design-taste-frontend | Pantallas nuevas con los tokens de Hampton y una tarea principal clara. |
| redesign-skill / redesign-existing-projects | Pantallas existentes: conservar patrones útiles, corregir fricción y mostrar evidencia de antes/después. |
| security-best-practices + frontend-security-coder | Fronteras API, archivos privados, entradas de webs/correos, XSS, permisos, tokens, datos personales y concurrencia. |
| antislop | Durante planificación y construcción: componentes y copy necesarios para trabajar, sin decoración ni abstracciones genéricas. El original está disponible como skill de Claude; no instalar herramientas para simularlo. |
| web-performance-optimization | Presupuesto de lectura/captura, listas y medios; medir flujos afectados y evitar recargas completas. |
| ponytail | Reutilizar reglas, componentes, cron y transporte existentes; cambios mínimos completos, sin segundo motor de workflows. |
| superpowers | Ejecutar el plan y registrar resultados; después del ciclo completo, validación final independiente del «build pasó». |

## 8. Matriz de cobertura y aceptación integrada

| Apartados del MD | Módulos responsables |
|---|---|
| 1–3 objetivos, reglas y relaciones | M02/M03/M04/M13 y contrato transversal §3 |
| 4 directorio | M01; BUS-21 → BUS-22 → BUS-23 |
| 5 inventario y diaria | M02/M05/M12 |
| 6–7 registro y activación | M03/M04; REG-17 |
| 8–9 matching y revisión | M04 |
| 10 consultas y llamada | M06 |
| 11 archivos | M07/M12 |
| 12 presentación y visita | M08/M09 |
| 13 revisión día21 | M10 |
| 14 dictado | M11 |
| 15 papelera | M12 |
| 16 cierre | M03/M06/M13; conflicto C01 |
| 17–19 inbox, estados y errores | M13 y aceptación de cada módulo |
| 20 decisiones abiertas | D01–D12, sin presentarlas como confirmadas |
| 21 comprobaciones | Criterios A01–A16 siguientes |
| 22 plan por módulos | Este documento y planes de entrega enlazados desde ESTADO |

| Prueba | Criterio verificable | Responsable |
|---|---|---|
| A01 | Parking obligatorio ausente nunca es completo aunque score sea100. | M04/BUS-12 |
| A02 | Mascotas desconocidas mantienen pendiente. | M03/M04 |
| A03 | Tres webs de una casa conservan tres publicaciones en un registro común. | M02/BUS-10 |
| A04 | Fuente fallida no retira propiedades. | M05/BUS-08 |
| A05 | Sin decisión humana no hay contacto automático. | M04/M06 |
| A06 | Consulta común sin mezclar datos ni sumar ocupantes. | M06/AGE-03 |
| A07 | A dos días aparece llamada con todos los teléfonos; respuesta actualiza tarea. | M06/AGE-08 |
| A08 | Llamada confirmada actualiza todos los matches del alcance acreditado. | M06/M13 |
| A09 | Disponibilidad activa captura, ficha y descargas; parcial no se declara completa. | M07/SPR-03 |
| A10 | Propuesta de agencia espera confirmaciones necesarias. | M09/VIS-17 |
| A11 | Visita confirmada/realizada mantiene búsqueda activa. | M03/M09 |
| A12 | Día21 genera hasta20 internas, sin envío ni cambios automáticos. | M10/BUS-17 |
| A13 | Dictado sin confirmación no cambia criterios. | M11/AUT-19 |
| A14 | No disponible confirmado sale de propuestas; scraping viejo no reactiva. | M05/M12 |
| A15 | A seis meses solo se purgan los archivos definidos, no historial. | M12/EST-19 |
| A16 | Cierre humano de una búsqueda preserva otras y barrido diario. | M03/M06/M13 |

Añadir en los planes cinco clases de fallo transversales: (1) dos empleados y dos ticks simultáneos; (2) cambio material después de aprobar y antes de enviar; (3) envío aceptado con acuse perdido; (4) lectura/captura/purga parcial y reintento; (5) límites de fechas Jersey, cambios de hora y meses de distinta longitud. Cada caso tiene que figurar en las pruebas del módulo que lo resuelve.

## 9. Cierre de cada entrega

Construir el alcance entero; ejecutar las pruebas relevantes y, para código de Hampton, `npm test`, `npm run build` y `npm run check:release`. E2E según cabecera vigente y **MCP Playwright** después de construir, a1280/390: camino correcto, validaciones, vacío/error/parcial, teclado, foco, zoom, consola/red; datos locales de prueba. Corregir y repetir solo comprobaciones afectadas. Para documentación/skills: comprobar JSON, dependencias, enlaces, carga real de instrucciones; «Playwright: no aplica a la aplicación». Si cambia el checklist HTML, comprobar que sus datos se renderizan y navegan.

Después de pruebas y revisión, analizar próxima tarea, modelo y esfuerzo con la rúbrica de `/avanzar`; guardar recomendación en ESTADO antes del commit. El modelo actual no obliga al de la siguiente tarea. Publicar según autorización de sesión; en Hermes siguen siendo obligatorios el SHA exacto aprobado, candado y envoltorios existentes. Verificar remoto y distinguir subida de despliegue/activación. Actualizar el relevo privado y el checklist en la misma entrega, sin publicar el original privado ni datos de clientes.
