# Lista 4 · Tanda 9 · Planes y gestiones preparados

10-nov-2026. Solo planificación. Base de GitHub `577965525f5c443320444d642759185eb568e9da`, comprobada al iniciar; los seis commits locales de tandas anteriores se conservan. El estado de un plan no acredita que su código, configuración, gestión o activación se hayan ejecutado. No hay preguntas de producto propias pendientes para estos alcances; los requisitos externos abajo son comprobaciones y ejecución posteriores, no hechos probados.

## Orden y referencias para quien ejecute

| Tarea | Alcance y documento vigente | Estado de planificación y condición posterior |
|---|---|---|
| PUB-14 | [SEO y Search Console](2026-11-08-pub-14-existing-seo-search-console-activation.md): comprobar el SEO ya existente y que el titular verifique el dominio y envíe el sitemap. | Plan de gestión definido. El envío, los accesos y la indexación necesitan evidencias independientes; enviar no garantiza indexación. |
| ANA-09 | [Regla limitada de protección](2026-11-08-ana-09-scoped-public-rate-limit.md), con su diseño enlazado: POST al host canónico: ruta exacta `/api/stats`, ruta exacta `/api/chat` y descendientes de `/api/chat/` con frontera. | Plan de configuración definido. La expresión y objetivo 20 solicitudes/10 s por IP son candidatos sujetos al plan y controles existentes en la cuenta. Pruebas locales no acreditan regla activa; preservarla y aplicarla solo mediante operador autorizado. |
| PRE-06 | [Acceso del equipo](2026-11-09-tp01-pre-06-plan.md) y [diseño de Access](../specs/2026-11-10-tp05-access-design.md): Google 2FA más Cloudflare Access, identidad de Staff, medios privados y reautenticación sin repetir cambios. | Plan de construcción definido. Comprobar políticas, cobertura y 2FA reales antes de la activación; no alterar ni eludir controles para ganar acceso. |
| PRE-13 | [Acuerdos y responsabilidad](2026-11-09-tp01-pre-13-plan.md). Hermes gestiona los acuerdos conforme a las instrucciones que ya tiene; referencias mínimas de cobertura por propósito. | Plan de gestión definido, sin función nueva. No buscar ni solicitar contratos o enviar instrucciones. La decisión de Luis no demuestra firma ni cobertura legal. |
| PRE-16 | [Transición desde Wix](2026-11-09-tp01-pre-16-plan.md), [fotos](2026-11-09-pre-16-fotos-equipo.md) y [diseño](../specs/2026-11-09-tp01-wix-cutover-design.md). El traslado usa las fotos del equipo actualmente publicadas y autorizadas, preserva presentación y comprueba las tres vistas. | El tramo de fotos está listo para construir; el resto es verificación de transición. Comprobar redirecciones, login, formularios, reserva, sitemap, WAF y dependencias por separado. La baja de Wix requiere decisión y autorización posteriores. Preparar los archivos para servirlos no añade edición de fotos a la aplicación. |
| PRE-19 | [Reconciliación documental](2026-11-10-tanda9-pre19-decisiones.md): conservar decisiones de búsqueda adoptadas y registrar la exclusión actual de tours y equipo 360. | Plan documental definido; no requiere función nueva ni reabrir el diseño de tours. |
| PRE-28 | [Titularidad y transición de cuentas](2026-11-09-tp01-pre-28-plan.md): Hampton titular y Optimyze operador autorizado, con inventario privado y aceptación por servicio. | Plan de gestión definido. Un acceso de operador no prueba titularidad; comprobar recuperación y funcionamiento antes de retirar acceso antiguo. No presumir que una cuenta personal se puede transferir. |
| PRE-33 | [Gestión de acuerdos existentes](2026-11-08-pre-33-hermes-existing-agreements-handoff.md): responsabilidad delegada a Hermes, con evidencia por finalidad cuando exista. | Plan de gestión definido, no nueva aplicación ni investigación legal de esta sesión. No afirmar revisión profesional o cobertura sin evidencia. |

## Secuencia y límites entre tareas

1. PRE-06 se puede desarrollar con datos sintéticos y PRE-16 puede construir el traslado de fotos autorizado. Revalidar las rutas y fuentes en el `main` de la construcción; no reproducir migraciones aplicadas ni modificar servicios durante esta planificación.
2. PUB-14 y ANA-09 requieren verificación por sus responsables en los servicios reales; PRE-16 consume sus resultados sin asumir que ya están activos. El código de fotos no depende de que se cierre Wix.
3. PRE-13 y PRE-33 registran la gestión ya delegada. PRE-28 usa su resultado cuando afecte al servicio y procede por servicio: inventario privado, acceso del titular, recuperación y prueba, aceptación y solo después eventual retirada autorizada. No copiar secretos, contratos o información personal al repositorio o al chat.
4. PRE-19 conserva el histórico y prioriza la decisión posterior de Luis: tours 3D y elección de equipo 360 quedan fuera por ahora. La corrección de documentación no implica borrar funciones ni datos existentes.

El plan de medición antiguo contiene propuestas históricas para origen de contactos, carteles y folletos. Para ANA-10 prevalece la decisión posterior y el plan de tanda 6: QR por propiedad en el póster de la ventana que abre esa ficha y conteo agregado de aperturas, sin atribución individual; no folletos para entregar por ahora. Las fotos de propiedades llegan ya editadas; no construir edición de imágenes en la aplicación.

## Entrega y comprobación

Planes revisados sobre el repositorio y decisiones disponibles; el responsable de cada tramo comprueba nuevamente dependencias y ejecuta las pruebas indicadas al construir. Los cambios documentales de esta tanda son locales y no significan publicación en GitHub, despliegue, migración, cambio de WAF/Access/DNS, envío, transferencia o baja de servicios. Las verificaciones de cuentas, costes, cobertura, permiso y recuperación se hacen antes de activar la parte correspondiente.

## Revisión independiente

El revisor de construcción comprobó alcance, fuentes y decisiones: no identificó preguntas adicionales de producto. Se corrigió el límite exacto de rutas de ANA-09, la precedencia de decisiones posteriores en PRE-33 y el perfil JWT de servicio de PRE-06; este último se contrastó con la documentación oficial y se revisó nuevamente. El resultado no acredita acceso, configuración o activación reales.
