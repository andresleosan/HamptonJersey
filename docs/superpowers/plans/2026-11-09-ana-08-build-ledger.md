# ANA-08 · Registro de construcción

2026-11-09. Usuario: «apruebo construir y publicar». Alcance: tramo Inbox del plan, no email ni otros códigos bloqueados.
Base comprobada GitHub:2084cb9ea895b729f8a28e3f2c42ce2057641389. Copia exclusiva:/tmp/hampton-ana08-build-20261109 en main. Se conserva la decisión vigente sin coordinador y el trabajo ajeno de otras carpetas. La aprobación actual cubre construir y publicar; no se solicitará de nuevo por rutina, sin saltar controles técnicos del entorno.

## Interfaces y decisiones

- Task1 → Task2: weeklyInsightsPass y tabla de fotos con el mismo contrato.
- Task2 → Task3: DTO con weekly_insights (fecha validada) para distinguir exactamente este subtipo informativo, sin afectar otros avisos.
- Task1: al implementar, el test de historia detectó que omitir source_version inicial producía una revisión adicional por el trigger existente. Se fija al ID del evento al insertar, manteniendo una sola revisión inicial.
- Plan aprobado: cuatro totales y cinco referencias; no historia de demanda/embudo. Sin fechas inventadas para fuentes eliminadas ni nombres de clientes.

## Progreso

Task1: calendario, tabla aditiva e INSERT SELECT implementados. RED observado por módulo inexistente. GREEN inicial4/4 directos; las pruebas de Task2 están ahora en RED por API/DTO/reloj ausentes.

Task2: API, destino de colección tipado, recibos de lectura, prohibición de mutaciones y reloj implementados. RED real404/401 y enlace ausente; GREEN5/5 archivos focales (semanal, jobs, insights, tareas y categorías). La prueba del fallo de job comprueba el heartbeat real de email; el correo desactivado no necesariamente usa DB.batch.

UI: el primer lanzamiento local se detuvo por EPERM al abrir127.0.0.1; se usa ejecución autorizada con mayor acceso solo para fixture local/navegador, sin modificar red ni permisos de servicios.

Task3: detalle inmutable y navegación implementados con componentes/paleta/tipografía existentes (Tenor Sans, Montserrat; ink151515, mistf4f3f0, stone6b665e; foco2px bronze). RED navegador por enlace ausente; GREEN1280/390, teclado, error503 conservando datos, reintento, vacío,404, respuesta tardía descartada, sesión401 con modal e inert y zoom200 sin desbordamiento. Capturas privadas revisadas visualmente en /tmp/hampton-ana08-shots; no se publican datos/fixtures.

## Revisión independiente

Revisor de contexto nuevo, lectura sola: sin bloqueos de entrega, permisos, límites históricos, atomicidad o UI. Señaló un contrato de retorno incorrecto: D1 meta.changes cuenta también las escrituras de triggers; ===1 devolvía created:false en el primer insert. Se corrigió a>0. La prueba D1 real reprodujo RED (0 creaciones notificadas frente a1), luego GREEN8/8 del archivo semanal, incluida concurrencia, reintento,rollback/FK. Ningún hallazgo pendiente. No se atribuye al revisor haber ejecutado nuestras pruebas.

Suite previa al arreglo de retorno:1019 Node +14 Python aprobadas. Se repite la suite completa después del arreglo y de actualizar documentación generada. La ejecución inicial en sandbox falló en6 archivos existentes por restricciones de localhost/procesos; la ejecución autorizada completa pasó. Sin modificar controles del sistema.

## Validación final

- `npm test`:1020 Node +14 Python, todos aprobados después del arreglo de D1.
- `npm run build`, `npm run check:release`, `git diff --check` y catálogo `render-roadmap --check`: aprobados. Build conserva el aviso de bundle grande existente; no se introducen dependencias.
- Worker jobs: empaquetado dry-run aprobado, mismo binding y cron, EMAIL_SERVICE_READY=false.
- Navegador semanal1280/390: aprobado, teclado/foco,zoom200,503/reintento conservando informe,404/vacío,respuesta tardía y401/inert; sin errores JS.
- Regresión notification-categories1280/390/zoom200: aprobada.
- Revisión de contexto nuevo completada; hallazgo del retorno D1 resuelto con RED→GREEN de runtime real, sin otros hallazgos pendientes.
- El helper Git del host referencia gh ausente. El conector GitHub permite lecturas pero su create_blob devolvió403por falta de escritura; no se repitió esa operación ni se cambian sus permisos. Se comprobó push --dry-run con el Git normal y el ejecutable gh temporal ya usado para entregas anteriores, conservando la autenticación existente y sin modificar configuración persistente ni mostrar credenciales. La subida será fast-forward de los commits locales revisados, sin force.
- PRE-14, PUB-16 y ANA-06 siguen fuera de construcción; no se envía correo ni se activan servicios externos en esta entrega.

E2E general final aprobado: `e2e OK (public, urls, admin, reg17)`. No fallos diferidos ni recorridos declarados aprobados por inferencia. El e2e continuó avanzando en su fixture; se esperó su final sin matar procesos ajenos. Segunda señal Centinela de cabecera de test revisada en informe privado: marcador de ejemplo, no credencial real; sin remediación. No se añade auditoría privada al repositorio público.

## Preparación de publicación

Main remoto comprobado2084cb9 e integrado en los commits de esta copia. Publicación autorizada por el mensaje de Luis de esta sesión. Migración pendiente remota: solo0036, aditiva, sin DROP/ALTER de tablas existentes. Marcador Time Travel y recuentos de54tablas de aplicación guardados en /tmp/hampton-ana08-*; se comprobarán integridad/recuentos al aplicar. Los resultados remotos pertenecen al relevo privado posterior al commit, para mantener el SHA congelado al publicar. No se afirman aún aquí como verificados.
