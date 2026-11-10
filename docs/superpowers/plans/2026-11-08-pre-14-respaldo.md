> **Plan vigente listo para construir:** [PRE-14 completo](2026-11-09-tp01-pre-14-plan.md) y [cierre de tanda 8](2026-11-10-tanda8-pre14-cierre.md). El documento siguiente conserva antecedentes históricos y decisiones, no es el plan vigente.

> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PRE-14 · Respaldo y restauración — plan preliminar

> Solo planificación. Construcción requiere revisión de seguridad y autorización separada para configuración o datos reales.

**Objetivo:** disponer de exportación semanal cifrada y recuperación comprobable. **Arquitectura:** mecanismo programado por decidir, destino privado y claves separadas; restauración ensayada con datos sintéticos. **Stack:** D1, reloj existente y almacenamiento por elegir. **Spec:** `docs/superpowers/specs/2026-11-08-tanda-ampliada-design.md`.

1. [ ] Confirmar alcance: D1 y, por separado, qué se necesita para medios y otros datos, incluida coherencia D1/R2 al restaurar; RPO/RTO, responsables, ubicación/región, destino, acceso y coste. Definir formato, cifrado autenticado, clave de recuperación, rotación, separación de poderes, pérdida de llave, retención y borrado. Ninguna política se presume aprobada.
2. [ ] Evaluar exportación documentada por Cloudflare y límites reales del plan, tamaño y duración antes de seleccionar arquitectura. [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) documenta 7 días Free / 30 Paid para backend compatible; verificar el plan y backend de Hampton por canal autorizado, sin revelar identificadores sensibles.
3. [ ] Diseñar captura consistente, registro de éxito/error sin contenido, compresión/cifrado fuera de Git, verificaciones de integridad y alertas, una ejecución por semana, recuperación de fallos y pruebas de claves/espacio/archivo corrupto. Especificar límites reales del mecanismo elegido antes de crear código.
4. [ ] Redactar procedimiento de prueba con base sintética aislada: restaurar ahí, comprobar esquema, relaciones y muestras, registrar fecha y duración; probar archivo corrupto y clave errónea. No restaurar producción para verificar y no demostrar recuperación solo con exportación exitosa.
5. [ ] Separar aprobación de diseño, despliegue, acceso, exportación real y cualquier restauración. Verificar con pruebas locales y revisión independiente. **No listo:** faltan concretar arquitectura, coherencia D1/archivos, custodia técnica de llaves, permisos y restauración verificable. Destino privado de Cloudflare y conservación de 12 semanas ya decididos.

Candidatos de inspección: `server/jobs.js`, `jobs/wrangler.toml`, `tests/server/jobs.test.mjs`; el mecanismo de exportación no se da por existente. No leer secretos ni tocar servicios al planificar.

## Decisión posterior de Luis

Destino elegido: almacenamiento privado en Cloudflare. Precisar producto, controles y mecanismo de custodia y recuperación de claves antes de dar el plan por listo; el periodo de conservación ya fue acordado. No configurar recursos ni acceder a datos reales durante planificación.

Luis aprueba conservar una copia semanal durante 12 semanas y mantener bajo su control la clave de recuperación. Diseñar custodia, acceso y verificación concretos sin solicitar o guardar claves en el plan.

Decisión de Luis: el respaldo incluirá tanto los datos de la aplicación como las fotos y demás archivos de propiedades, para recuperación completa. Diseñar relación entre datos y objetos, integridad y recuperación conjunta; no afirmar que D1 por sí solo contiene los archivos.

Luis confirma: ejecutar cada domingo a las 02:00 en hora de Jersey y crear una tarea en el inbox de Staff cuando falle una copia. Definir comportamiento de horario de verano, duplicados y recuperación después de caída del reloj.

## Restricción verificada en documentación de Cloudflare

La [API de exportación de D1](https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/export/) indica que durante una exportación la base podría no atender consultas; la duración depende del tamaño. El plan debe contemplar el impacto sobre la web, el panel y las operaciones en curso, medirlo en entorno de prueba y definir reintentos y recuperación. R2 es consistente por operación, pero no proporciona por sí solo una captura transaccional conjunta de D1 y archivos: diseñar un mecanismo verificable de coherencia o señalar expresamente su límite. Luis ya aceptó una posible interrupción breve sujeta a pruebas; falta concretar y comprobar el procedimiento.

Luis acepta la posible interrupción breve de web/panel durante la exportación dominical, siempre que primero se mida su duración en pruebas. Esta decisión orienta el diseño, no autoriza activar el respaldo ni operar sobre datos reales.

Luis aprueba que la restauración vuelva al estado de la copia elegida, con posible pérdida de cambios posteriores y autorización previa del equipo para cada restauración. Guardará una copia de recuperación de la clave en su gestor y otra de emergencia en un lugar seguro elegido por él; nunca enviar la clave por chat ni guardarla en el repo.

Luis acepta pausar temporalmente cambios en Staff para asegurar correspondencia entre datos y archivos, siempre tras medir en pruebas; acepta almacenamiento privado Cloudflare separado y revisar coste antes de activarlo. Acepta reintentos automáticos del respaldo y aviso en inbox si persiste el fallo, preservando copias anteriores. No se ha decidido número ni calendario exacto de reintentos: proponer en diseño sin afirmar aprobación.

## Reglas concretas para completar el diseño

- Separar el bucket de respaldo privado del bucket productivo `hampton-media`; no asignarle dominio público. Cifrar antes de guardar con clave de datos por copia y cifrado autenticado; proteger la clave con la clave de recuperación bajo control de Luis, sin registrar secretos. El algoritmo, herramienta de recuperación y mecanismo de provisión todavía deben especificarse y probarse con archivos sintéticos antes de declarar el plan listo.
- El intervalo congelado debe abarcar modificaciones de D1 y de archivos R2, no solamente botones de Staff: incluir solicitudes públicas y relojes que alteren esos datos. Debe esperar a operaciones ya iniciadas, impedir nuevas escrituras durante la captura y liberar la pausa ante error y expiración. Si no puede demostrarse exclusión mutua entre D1 y R2, no marcar la copia completa ni eliminar respaldos anteriores. La aceptación de una pausa breve exige medirla y no implica suprimir silenciosamente peticiones de clientes.
- Escribir un manifiesto cifrado con identidad de versión, instante, listado y huella de los objetos y esquema de la exportación. Marcar la copia como válida solo tras verificar datos y objetos. Restaurar únicamente en recursos de prueba con datos sintéticos para validar integridad y consistencia; restauración real requiere autorización específica por su pérdida de cambios posteriores.
- Guardar hasta 12 respaldos completos y verificables; no borrar uno anterior hasta verificar el nuevo. Programar domingo 02:00 Jersey con idempotencia por semana, horario de verano, vuelta del reloj y reintentos limitados; crear una tarea en inbox si se agotan. No inventar un valor de coste, plan de Cloudflare o permisos observados.
