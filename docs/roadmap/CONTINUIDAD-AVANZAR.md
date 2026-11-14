# Continuidad de `$avanzar`

Luis pidió el 13-nov-2026 que Codex continúe el checklist de Hampton de forma autónoma entre invocaciones de `$avanzar`, usando los planes y especificaciones para resolver decisiones ya documentadas. Su objetivo es terminar las tareas aplicables o, como mínimo, **111 de las 221 tareas originales**. Una sesión nueva debe retomar desde el último estado comprobable; no se supone que trabaje en segundo plano cuando está cerrada.

## Forma de trabajar

- Leer este documento, [ESTADO.md](ESTADO.md), el catálogo, la ficha de cada tarea y sus planes/especificaciones vigentes. Comprobar `main`, sus cambios y el estado local antes de editar. El árbol de trabajo de Luis puede contener modificaciones ajenas: conservarlas y usar una copia aislada cuando haga falta.
- Continuar con varias tareas viables en la misma sesión, priorizando las que puedan **terminarse realmente** y las dependencias que desbloqueen otras. Repartir trabajo independiente entre agentes cuando las reglas y herramientas de la sesión lo permitan, con un responsable por archivo compartido. Un bloqueo localizado no detiene las demás tareas.
- Luis autoriza los **commits y pushes necesarios a `main`** para este avance, sin pedir una nueva aprobación por cada lote. Preparar cambios revisables, ejecutar las comprobaciones pertinentes, añadir solo los archivos propios, verificar que el remoto sigue en la base esperada y publicar sin forzar ni reescribir historial. Si hay cambios remotos concurrentes o un resultado incierto, reconciliar antes de seguir.
- Agrupar pruebas completas y publicaciones de unidades compatibles para avanzar más rápido, manteniendo las comprobaciones específicas, la revisión necesaria y las pruebas de interfaz aisladas exigidas por el proyecto. No reducir cobertura ni desactivar controles para ahorrar tiempo.
- Actualizar el checklist y la evidencia con lo terminado, lo parcial y sus dependencias. El porcentaje solo aumenta cuando la tarea cumple sus criterios reales; informar cantidad, total aplicable y porcentaje verificados. Mantener también visible la meta de 111 sobre las 221 originales para no confundirla con cambios del denominador.
- La autorización de commit y push **no equivale** a permiso para aplicar migraciones remotas, activar servicios, cambiar credenciales o controles, enviar mensajes, restaurar datos o ejecutar acciones externas adicionales. Conservar las restricciones y resolver por la vía apropiada los bloqueos reales; no pedir ni publicar secretos.

La continuidad depende de que la sesión esté activa y disponga de sus herramientas. Si llega a un límite técnico o de sesión, registrar el último commit, la verificación, las tareas en curso y los siguientes pasos concretos para que la próxima invocación de `$avanzar` pueda continuar sin reconstruir el trabajo.

## Mandato reiterado · 14-nov-2026

Luis indicó: «que no vuelva a suceder», «debes seguir hasta resolver todas o la mayoría de las tareas» y que el porcentaje debe subir. No cerrar el encargo por terminar un lote parcial ni repetir confirmaciones rutinarias de trabajo ya autorizado. Antes de iniciar otra tarea, buscar una ruta concreta a cierre e integrar y comprobar su recorrido; después de publicar, verificar tablero y continuar inmediatamente.

Un fallo de acceso histórico no acredita falta de acceso actual: comprobar por una consulta mínima legítima antes de tratarlo como dependencia. En esta sesión funcionaron las lecturas D1 y Pages. La revisión automática rechazó después aplicar 0048 remota por falta de autorización explícita para ese recurso; no se ejecutó. Esa restricción concreta no bloquea código, pruebas, revisión o los demás alcances independientes, y no se elude por otra herramienta. Preparar el lote completo y revisable antes de solicitar la autorización externa que ese control exige.

### Parada solicitada tras el siguiente cierre

En el mismo 14-nov, Luis precisó: «cuando termines una tarea y avancemos en porcentaje que hagas commit y push, guardas todo y te detienes para avanzar en otra sesión». Esta instrucción posterior sustituye la continuación inmediata después del próximo cierre real: terminar una tarea, verificar el aumento público, commit/push y continuidad, y detenerse. No cuenta como ese hito un lote parcial ni una propuesta. PUB-08 es el cierre seleccionado; PUB-06/SPR-01 quedan preparados para la sesión posterior.

Luis respondió después «si autorizo» a la solicitud concreta de aplicar **solo `0048_listing_content.sql` en D1 `hampton` y activar `PUB08_CONTENT_READY=1`**. Esta autorización no se extiende a `0052_listing_economics_history.sql` ni a `PUB06_STRUCTURED_ECONOMICS_READY`; ambos quedan para la sesión posterior. 0048 se aplicó con salida 0 y se verificaron por lectura la tabla vacía, sus dos validadores y el registro de migración.

## Cierre y parada cumplidos · 14-nov-2026

PUB-08 cerrada en `9f4f884a63111860cadfa9b051abc518dee1bc75`, tras publicar la activación `faf43a34c75e04164be8515a95556d2cd792be80`. 0048 aplicada y verificada; Pages nativo acredita despliegue exitoso de faf43a3, configuración efectiva PUB08=1 y GET 200 en dominio y deployment exacto. El check GitHub de Pages aún mostraba Building en la última consulta; se distingue del resultado nativo real. Jobs success. Suite de 2.308 JavaScript y 29 Python, build/release/catálogo/paquetes/contrato y Chromium/WebKit aislados aprobados. No hubo escrituras ficticias en producción.

Tablero público leído después del push, `updatedAt=2026-11-14T01:28:04.943Z`: **69/215 (32,09 %)** y PUB-08 hecha, desde **68/215 (31,63 %)**, con el mismo denominador. Se registra el resultado y se detiene esta sesión según Luis. El SHA del registro final queda en el historial de main y en el relevo local indicado por AGENTS.md.

Siguiente sesión recomendada: **PUB-06/SPR-01**, por compartir el esquema canónico 0052 ya integrado y revisado en `09214cf`. La migración 0052 NO se aplicó y `PUB06_STRUCTURED_ECONOMICS_READY` sigue ausente; la autorización concreta de esta sesión solo cubrió 0048/PUB08. Retomar el mapa de retención y las decisiones reconciliadas de premium/renta y fecha sin volver a plantearlas. Comprobar estado remoto real, pruebas concretas de interfaz y autorización aplicable antes de esa operación nueva; no aplicar toda la cola pendiente.
