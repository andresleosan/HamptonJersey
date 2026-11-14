# PUB-08 · Etiquetas y vídeo web

Fecha: 2026-11-13. Construcción local sobre `85e97b312c3111a5b1cf5a79724ebb12ff521f0a`. Pendiente de revisión independiente e integración en el main vigente. Esta evidencia no acredita despliegue ni activación.

## Construido

- Catálogo cerrado y versionado de tres etiquetas del alcance explícito (`renovated`, `sea_view`, `town_centre`), seleccionadas por personal para datos confirmados. Las etiquetas no las infiere una IA. No se añaden textos ni campos sociales.
- Vídeo web separado de la URL de tour existente: solo URL HTTPS válidas de los reproductores admitidos Vimeo y YouTube con privacidad mejorada; se rechazan credenciales, hosts falsos, puertos, rutas y parámetros no admitidos. El reproductor se monta solo tras elección expresa de la persona visitante y se puede descargar. Vimeo fuerza `dnt=1`.
- El editor conserva borradores ante conflicto, permite descartar y presenta el error de proveedor antes de guardar. El historial registra nombres de campos, no el contenido del vídeo ni de las etiquetas. El guardado usa la versión de la ficha y comprueba la pertenencia vigente del actor dentro de la transacción.
- La revisión de dirección exacta cubre el contenido nuevo. Un cambio posterior invalida la autorización anterior; fichas sin contenido conservan la proyección y huella anteriores.
- Migración provisional `0048_listing_content.sql`, sin backfill ni alteración de fichas antiguas. Toda consulta y edición de la tabla nueva está condicionada a `PUB08_CONTENT_READY=1`, ausente por defecto. Confirmar ordinal libre al integrar; no habilitar la variable antes de verificar la migración en el entorno correspondiente.

## Verificación local sintética

- Focal: 18 pruebas de validación, DOM, API, permiso revocado, aislamiento entre IDs, no-op, CAS, historial y dirección exacta. D1 local/Miniflare aplicó la migración sobre una ficha preexistente, resolvió dos escrituras concurrentes con una sola ganadora y comprobó rollback y claves foráneas.
- Regresión focal: 79 pruebas de autorización, fichas, historial, eventos y direcciones. La batería general previa pasó 1.398 pruebas JavaScript y 25 Python; después se añadieron dos casos focales, ejecutados en la batería focal anterior. `npm run build` y `npm run check:release` pasaron.
- Navegador mediante `E2E_PRODUCTION_READONLY=0`, `E2E_SCRIPT` concreto y `npm run test:e2e:isolated`: vista pública Chromium y WebKit 1280/390 con proveedores interceptados, sin iframe ni solicitud a los proveedores del vídeo/tour antes del clic; editor Chromium 1280/390, teclado, host bloqueado, conflicto y descarte. En el editor las respuestas de contenido están simuladas; API y D1 se prueban aparte con datos ficticios. Zoom CSS 200% del editor y zoom nativo 200% de la vista pública en WebKit comprobados; el control de carga conserva el foco y queda sin obstrucciones.

## Pendiente

- Revisión independiente e integración, preservar el trabajo concurrente de accesibilidad PUB-04 y ejecutar sus verificaciones sobre el resultado integrado. Resolver el ordinal de la migración frente al main actualizado.
- Aplicación y comprobación de migración, configuración y verificación de activación solo por el flujo autorizado del entorno correspondiente. No se ha ejecutado nada remoto, no se han verificado cuentas o permisos de proveedores y no se han creado valores de fichas reales.
- Cualquier ampliación del catálogo requiere revisión y una versión explícita; los tres ejemplos iniciales no representan una taxonomía completa. La activación no debe atribuir verificación a contenido histórico inexistente.

## Integración y revisión

La revisión independiente no encontró defectos bloqueantes en la entrega desactivada; comprobó CAS, permisos, huella de dirección, separación de vídeo/tour y ausencia de carga previa a la elección. La integración conserva el foco accesible de PUB-04. Sobre el main `0328a89`, la suite integrada pasó 1.408 pruebas Node y 25 Python, build, release y catálogo; navegador aislado aprobó contenido público, editor y regresión PUB-04.

La primera ejecución WebKit integrada registró el aviso conocido `ResizeObserver loop completed with undelivered notifications` de la galería, documentado previamente en PRE-11. La prueba solo lo distingue por coincidencia exacta en WebKit; cualquier otro error de página sigue fallando. La repetición pasó sin avisos. Esto no acredita comportamiento de producción ni del proveedor. La consulta remota de migraciones fue denegada; esta sesión no ejecutó 0048 y desconoce su estado remoto.

## Cierre comprobado · 14-nov-2026

La evidencia histórica anterior no describe ya el estado vigente. Luis autorizó específicamente 0048 y PUB08; la migración está aplicada y verificada, el gate efectivo de producción vale 1 y Pages publicó `faf43a3` con comprobaciones HTTP 200 del deployment exacto y del dominio público. El recorrido nuevo usa rutas reales con D1/R2 sintéticos, dos sesiones y conflictos reales; pasó Chromium/WebKit aislados. La batería conjunta pasó 2.308 JavaScript y 29 Python, build/release/catálogo/paquetes/contrato canónico. El catálogo cerrado versión 1 es el alcance vigente; ampliarlo es trabajo futuro, no una decisión pendiente de esta entrega. [Evidencia final y límites](2026-11-14-integracion-activacion.md).
