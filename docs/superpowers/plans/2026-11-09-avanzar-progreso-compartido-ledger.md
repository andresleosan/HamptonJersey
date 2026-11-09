# Registro de construcción · progreso compartido

9-nov-2026. Luis aprobó diseño con «si» y añadió que algunas sesiones solo planifican. Plan preparado distingue plan/planned y build sin marcar producto como hecho. Copia propia main4858fdb, fetch/check comprobados; borradores de REG-08 preservados. Candado local mantenido por sesión propia.

Sin push, despliegue, operación de reservas antiguas ni cambios de credenciales/Access/roles. Alerta de salida de referencias simbólicas clasificada; informe privado en/tmp/hampton-shared-progress-centinela-20261109.md.

Método: ejecución nativa con TDD por tarea y una revisión independiente final. No pedir aprobaciones rutinarias intermedias; aprobación de publicación sigue por SHA exacto. Esta infraestructura no pertenece a una de las250tareas funcionales de Hampton; conservar catálogo sin inventar códigos.

## Ejecución y pruebas previas a revisión

- Task1: modelo RED por módulo ausente y GREEN8/8; contrato/API con SQLite real1/1. Fixture inicial corregida para expectedRevision/catálogo válido; producto no cambió por esa corrección. Suite completa runtime28/28 pasa, conserva claims históricos y separa actividad nueva.
- Task2: cliente RED por módulo ausente y GREEN4/4; pérdida de respuesta, retry igual, bloqueo de otro comando, planes sin construcción y archivos históricos intactos. Configuración/identidad reales de escritores no consultadas ni copiadas.
- Task3: UI RED por falta de render/validación y GREEN3/3; regresiones públicas13/13. Firma pública mínima, foco estable y referencia local sin enlace publicado. Copy de checklist/skill actualizado sin cambiar los250estados de producto.
- npm test fuera del sandbox:1047Node+14Python PASS. En sandbox los procesos hijos de fixtures fallanEPERM; repetir fuera del sandbox acreditó la suite completa sin cambiar controles. Build/check:release PASS; chunk heredado768.06KB/gzip216.42KB. Catálogo250 y cobertura23paquetes siguen correctos.
- E2E tablero: primer recorrido llegó al final de1280, pero390 arrancó con el estado pausado anterior. Corregido reinicio de fixture por viewport; repetición en curso. No implica fix de producto.
- Playwright MCP volvió a fallar antes deabout:blank por sandbox/root. Sin modificar controles; runner local no equivale a MCP. Fixture visual usa fuentes fallback locales y CSSzoom200, sin afirmar fuentes externas o zoom nativo.

Ruling: infraestructura de desarrollo fuera de las250tareas de producto — actualizar descripción del checklist y ESTADO sin atribuirla aNOT-11 — coste si es erróneo: falta un código de catálogo específico; no se inventa ni se declara producto terminado.
Ruling: planes locales se muestran como referencia con publicación sin verificar, no como enlace disponible — evita prometer relevo de archivos no publicados — coste: compartir el documento requiere su entrega autorizada antes de continuar desde otro equipo.

## Revisión independiente y corrección final

Revisor fresco progress_final_review (gpt-6-astra/high), solo lectura de todo el árbol pendiente sobre4858fdb. Dictamen:0Critical/3Important, sin menores; no listo hasta corregir. No segunda revisión: una pasada con pruebas reproduciendo los hallazgos.

- Final: fixed retry incierto borrado tras403 — prueba cliente perdida de respuesta→rechazo→nuevo comando RED→GREEN; ahora retiene pendiente y activity list obtiene prueba positiva propia de la operación para recuperar el responsable. Un rechazo no acredita ausencia de la escritura anterior.
- Final: fixed entrega publicada desaparece al comenzar otro tramo — prueba de proyección/modelo RED→GREEN; conserva delivery y basedOn con SHA/referencia y pendiente anterior, sin ocultar construcción nueva ni el plan preparado.
- Final: fixed catálogo histórico requerido — runtime fresco sin /v1/catalog observado RED por UNKNOWN_TASK; activity valida catálogo empaquetado y getWorkBoard sirve metadatos del artefacto. getBoard y tablas históricas conservan su contrato. Repetición de runtime y suite completa en curso.
- Revisión propia final adicional: oferta antigua no debe transferir una entrega terminal ni enlace de publicación referirse a otroSHA. Ambos casos RED→GREEN en modelo. Son correcciones de autoridad/continuidad del mismo alcance.
- Capacidad: snapshot máximo1.500.000bytes mantiene respuestas debajo del límite de lectura existente2MiB; reduce operaciones recientes antes de rechazar una nueva entrada, sin borrar historial de entregas ni mutar parcialmente. Regresión RED→GREEN. El mantenimiento por capacidad se muestra como error explícito, sin inventar exclusividad. Límite de filaSQLite actual8MB contrastado en documentación oficial https://developers.cloudflare.com/durable-objects/platform/limits/; no se cambió configuración del servicio.

Final: Ruling: acceso/autenticación de escritores en vivo y despliegue quedan pendientes porque no hay permiso de escritura remota — pruebas locales no se presentan como activación — coste si es erróneo: la publicación no bastaría hasta verificar esos accesos.
Final: Ruling: published prueba integración del SHA en main; despliegue se verifica mediante el procedimiento existente y ledger — no afirmar equivalencia automática — coste: el consumidor debe consultar la evidencia del despliegue.
Final: Ruling: zoomCSS200/fuentesfallback/runner local y MCP fallido se declaran por separado — no inventar cobertura nativa o de fuentes remotas — coste: revisión física de esas variantes sigue fuera de esta evidencia.
Final: Ruling: se acepta la suite completa ejecutada por el constructor como evidencia; el revisor no la repitió — evita duplicar ejecución sin cambios — coste: revisión independiente de cobertura, no segunda ejecución independiente.

No menores aplazados. Alerta de referencias simbólicas durante revisión clasificada por el revisor con security-cost-auditor sin exposición operativa o remediación; no escribió archivos en el árbol.

## Validación final y alcance documental

Todos los pasos de construcción del plan completados; publicación/activación no ejecutadas. Después de fixes:1053Node+14Python PASS,28runtime PASS, modelo12/cliente5/UI4 y regresión pública13 aprobados dentro de la suite. Build/release PASS. E2E tablero1280/390, plan-only, tramo anterior publicado, construcción actual, etapas de paquete, pausa, teclado/foco, vacío/error/retry, zoomCSS200 y consola PASS. Capturas finales /tmp/hampton-progress-shots/work-390.png y work-1280.png inspeccionadas; sin overflow. MCP sigue bloqueado antes de navegación. Fuentes remotas/zoom nativo no acreditados.

Se corrige además el desfase documental ya comprobado de REG-08/BUS-14: el commitcfb3d3c/0031 ya está en main. Sus fichas conservan parcial, requisitos y pendientes operativos; no inventar activación remota ni pedir construir/publicar de nuevo lo existente. El ledger propio de verificación de REG-08 se incluye como evidencia. Los250códigos y estados no cambian. Se regenera catálogo/checklist sin operar servicio histórico.

Siguiente tarea analizada: BUS-14, PAQ-03, diseño aprobado para quitar35/tope25/bonus, paginación25, versiones y recálculo concurrente; REG-08 integrado comprobado, sin gate de coordinador. Plan propone0032 ya ocupada: revisar siguiente número libre al construir. gpt-6.1-terra/high disponible en herramientas, por concurrencia/paginación/decisiones humanas y varias superficies con pruebas. Solo después de activar/verificar este registro; prioridad actual cerrar publicación del SHA aprobado.

Ruling: metadatos públicos de tareas proceden del catálogo incluido en el artefacto, mientras getBoard/tablas antiguas mantienen su fotografía — elimina dependencia del import histórico — coste: publicar cambios del checklist exige desplegar el artefacto del registro para reflejarlos, sin push por cada hito de actividad.
Ruling: historial no se borra al alcanzar capacidad; snapshot acotado devuelve mantenimiento explícito — conserva entregas y evita respuestas ilegibles — coste: futura intervención autorizada si se alcanza el límite, nunca construir con exclusividad inventada.

Publicación requerida por separado: main del SHA revisado y Workers hampton-team-coordinator (primero, nueva RPC/tabla propia) y hampton-tareas (después, nueva proyección/UI). No migraciones D1 de Hampton; el Durable Object crea su tabla propia al desplegar, conservando tablas y reservas anteriores. Usar wrappers/autenticación existentes y turno acordado antes de publicar. La disponibilidad de cada identidad escritora real sigue pendiente; no pedir tokens por chat ni copiar configuraciones entre equipos.

Cierre de paquetes: los dos dry-run finales de Workers pasan después de regenerar assets locales (el primer dry-run privado solo carecía de coordination/public). Sin despliegue real. Catálogo250/paquetes23/diffcheck y regresión pública13/13 tras corregir REG-08/BUS-14 pasan. Fetch final17:28:34UTC: origen main4858fdb igual a base, cambios propios conservados. No hay otra integración que resolver en esa consulta; turno de publicación compartido no se da por concedido.

Pendientes de publicación: revisión de los fixes respaldada por RED→GREEN y suites; aprobación de Luis para el SHA final, turno único acordado y wrappers; desplegar primero registro privado y después tablero público. Confirmar cada identidad escritora y que los nuevos arranques de avanzar llegan a la skill actualizada. URL remota devolvió403 durante diagnóstico; no se atribuye una causa de Access/servicio que no se haya verificado. Una publicación incierta se comprueba antes de reintentar.
