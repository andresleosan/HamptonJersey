> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-16 · Estados de ficha y canales — plan preliminar

> Solo planificación. Construcción futura con superpowers:executing-plans y reserva.

**Objetivo:** propagar los estados acordados con evidencia y respetar las reglas web actuales. **Arquitectura:** EST-17 es dueño de nuevos estados; este plan coordina su difusión con PUB-03/PUB-15. **Stack:** Worker/D1, web y panel. **Spec:** `docs/superpowers/specs/2026-11-08-tanda-ampliada-design.md`.

1. [ ] Verificar implementación integrada de EST-17 y eventos de `server/routes/sales.js` y `server/listing-events.js`; conservar Under offer/Sold existentes y el comportamiento de web ya desplegado.
2. [ ] Confirmar con Hampton qué transiciones generan comunicación en cada canal, especialmente Let agreed, y si se aprueban manualmente; acordar retirada y corrección posterior. No asumir que toda actualización implica publicación externa.
3. [ ] Definir tabla de traducción para cada proveedor real y estado no soportado; ninguna traducción a estado incorrecto se permite. Distinguir estado de web, intención enviada y confirmación del tercero; conciliación manual si resultado incierto.
4. [ ] Probar transiciones de venta y alquiler, carrera de cambios, cambios reversibles, un canal caído, reenvío y etiquetas web; no romper fichas existentes ni interpretar Under Offer en respuestas de agencias como cambio automático de publicación.
5. [ ] Validar pruebas de sales/listings, `npm test`, build, check:release y e2e panel/web a 390/1280. **No listo:** EST-17 y política de publicación en redes pendientes; PRE-02 para Meta.

Archivos a inspeccionar: `server/routes/sales.js`, `server/listing.js`, `server/listing-events.js`, `site/index.html`, `admin/src/ListingEditor.jsx` y pruebas asociadas.

## Decisión posterior de Luis

La publicación de cambios en redes requiere aprobación de alguien del equipo; Luis indica que ese alcance queda fuera del Plan Maestro Vigente. Facebook queda expresamente para más adelante; las publicaciones en redes quedan fuera del Plan Maestro Vigente. Mantener la gestión de estados web existente sin activar integración social.

La regla anterior sobre retirada fue sustituida por la decisión vigente de un día y etiqueta indicada abajo. Facebook e Instagram son manuales y sin integración automática.

## Decisión vigente de Luis sobre alquiler

Al marcar el alquiler como completado en Staff, la ficha sigue publicada durante un día y muestra «Let agreed». El equipo puede corregir un cierre erróneo durante ese plazo; al vencer, si no fue corregido, la ficha se retira automáticamente de las propiedades publicadas y de la web. Se conserva ficha e historial. Esta decisión sustituye la anterior de retirar inmediatamente y no mostrar etiqueta. Las publicaciones en redes son manuales y ajenas a este flujo.

Luis confirma 24 horas exactas desde la marca de cierre. Propuesta técnica: al corregir dentro de las 24 horas restaurar el estado y publicación anteriores al cierre, sin sobrescribir cambios posteriores del equipo; si se detectan cambios concurrentes, rechazar con aviso y pedir revisión. El código de Rentals revisado no muestra acción inequívoca de alquiler completado vinculada a listing: diseñar esa acción y el vínculo con EST-17, sin confundir finalizar una tenencia, archivar una propiedad o completar una reparación. El reloj AUT-07 debe procesar vencimientos de forma idempotente, conservar el plazo original y respetar correcciones concurrentes; caída del reloj se recupera al volver y no retira fichas con cierre corregido. Pruebas de antes y después del vencimiento, corrección justo en el límite, ticks simultáneos, error de base y reinicio, así como etiqueta, resultados públicos y conservación del historial. El diseño exacto depende de decidir la política de nuevas solicitudes durante Let agreed y de concretar contratos y caché; no declarar listo aún.

## Contrato de la fase web

- El equipo confirma el cierre sobre la ficha de alquiler identificada inequívocamente; guardar instante UTC del servidor, fecha límite = instante + 24 horas y estado anterior. Mostrar «Let agreed» y permitir corrección hasta la fecha límite. La acción debe ser idempotente: repetirla no reinicia el plazo.
- En el límite la ficha deja de ser pública incluso si el cron de 10 minutos no ha corrido: todas las lecturas públicas y de medios, mapas/sitemap, vistas directas y solicitudes de visita deben aplicar el mismo criterio de fecha y evitar caché obsoleta. La retirada persistente por AUT-07 se realiza después de manera idempotente con evento de historial; errores o reloj detenido nunca autorizan una lectura pública tras el límite. Inspeccionar y ajustar consumidores y tiempos de caché reales al construir.
- Una corrección válida antes del límite cancela el vencimiento y restituye solo el estado anterior si no existen cambios posteriores; ante conflicto devuelve 409 y no pisa datos. La actualización y el chequeo de vencimiento son atómicos; reloj y corrección no pueden ganar ambos. El equipo conserva ficha, medios e historial. Pasado el límite, no revertir automáticamente: restauración/publicación explícita con controles habituales.
- Modificar según contratos efectivamente existentes `server/routes/listings.js`, `server/routes/public.js`, `server/visibility.js`, `server/seo.js`, `server/jobs.js`, `site/index.html`, panel de listing y migración aditiva para la marca y estado anterior; coordinar EST-17 y su ciclo de alquiler antes de construir. Establecer una acción de Staff sobre la ficha, con permiso y confirmación; no tratar el fin de una tenencia como cierre de comercialización.
- Pruebas con reloj inyectado y D1 local: 23h59m59s visible con etiqueta, 24h exactas oculto en todos los endpoints incluso sin cron, corrección anterior al plazo, corrección en límite y concurrente, doble confirmación sin reinicio, cierre de ficha no alquilable, cron duplicado/caído, caché, solicitud pública, historia y archivo intactos. `npm test`, build, check:release y e2e/Playwright local. Los cambios de EST-17 y migración se revisan y autorizan por separado antes de despliegue.

## Revisión independiente posterior

El bloque inicial con Meta/portales describe alcance anterior aplazado y no se ejecuta. El esquema actual no admite Let agreed y Rentals no enlaza de forma inequívoca la ficha: falta definir esquema, identidad, endpoints, corrección y migración compatibles con EST-17. El listado público tiene caché y la pestaña mantiene datos en memoria: una comprobación de base no garantiza retirada exacta en pantallas abiertas. El plan debe incluir vencimiento de caché, actualización al vencer en pestañas abiertas, SEO, medios y reservas; demostrar cada superficie con pruebas en el límite. Luis decide que se desactivan las solicitudes de visita durante Let agreed. Luis decidió cancelar automáticamente las demás visitas y avisar por correo cuando se alquile o venda; falta definir el momento frente al plazo de corrección.

## Visitas en Let agreed — decisión de Luis

Al registrar el cierre y poner Let agreed, impedir nuevas solicitudes de visita mientras permanezca ese estado. Deshabilitar la acción en la ficha y la selección en el formulario; el servidor rechaza peticiones manipuladas y debe comprobarlo de nuevo atómicamente al insertar la reserva para evitar carreras. Si se corrige el cierre antes del vencimiento, restaurar la disponibilidad para visitas previa, sin activar una que ya estuviera desactivada ni pisar cambios posteriores. Aplicar la decisión posterior de cancelar las demás visitas y avisar por correo, definiendo el momento frente al plazo de corrección. Añadir tests: petición al activarse Let agreed, reserva concurrente con cierre, guard anterior de visitas desactivadas, corrección y doble cierre. No eliminar historial de visitas; cancelar conforme a la decisión posterior de Luis.

## Cancelación de visitas y aviso — decisión de Luis

Cuando una persona adquiere la propiedad por alquiler o compra, cancelar automáticamente las demás visitas vinculadas y mandar a las personas afectadas un correo indicando que ya se alquiló o vendió. No revelar datos de quien la adquirió. La cancelación, audiencia, identificación del hecho confirmado, momento exacto respecto al plazo de corrección de 24 horas, plantilla y reanudación ante fallos deben diseñarse explícitamente. AUT-17 debe estar activado para enviar correos; si no lo está, no afirmar envío efectuado y presentar estado pendiente al equipo. Impedir correos duplicados y no reintentar automáticamente resultados inciertos; distinguir cancelación de envío. Evitar que mensajes externos irreversibles salgan por un cierre erróneo: esclarecer con Luis el momento de envío respecto a las 24 horas.

Luis confirma que, al corregir un cierre durante el plazo, la ficha vuelve al estado y disponibilidad de visitas anteriores, preservando cambios posteriores mediante control de conflicto. Reafirma retirada automática; se mantiene el plazo acordado de 24 horas, salvo indicación posterior. Luis aprueba una tarea urgente en el inbox de Staff cuando la retirada automática falle.

## Confirmación de Luis sobre visitas y fallos

Esperar hasta cumplir las 24 horas sin corrección antes de cancelar las otras visitas y enviar los correos; de este modo el equipo puede corregir un cierre erróneo. Si falla la retirada automática generar una tarea urgente en el inbox de Staff. No cancelar ni enviar si se corrigió dentro del plazo. Proteger el proceso con idempotencia, revisión humana de resultados de correo inciertos y estado pendiente cuando AUT-17 no esté activado. No se envían correos en planificación. Luis confirma que para ventas también se espera 24 horas para permitir corregir errores antes de cancelar las demás visitas y enviar correos. La señal de venta completada se vincula con el flujo existente de Sales; no cambiar la visibilidad de venta durante ese periodo sin decisión adicional.

## Reconciliación técnica de ventas y visitas

`server/routes/sales.js` implementa `complete`, que marca venta completada y ficha Sold, cierra ofertas y cambia etapa del comprador en un batch; no permite deshacer venta completada desde el panel. La demora de 24 horas aprobada por Luis aplica a cancelar las otras visitas y notificar, no autoriza cambiar ni deshacer por inferencia los demás efectos de Sales. Agregar una cancelación del aviso pendiente por cierre erróneo, con actor, motivo e historial; preservar la venta y solicitar revisión de su corrección, sin resucitar ofertas ni etapas de terceros automáticamente. Para alquiler la corrección restaura estado anterior sujeto a concurrencia.

El guard de inserción de visita existente es `propertyViewingGuard` en `server/viewing-store.js`; extender la comprobación de Let agreed dentro del `INSERT`/`UPDATE`, no solo en lectura previa. Diferenciar visitas todavía activas con fechas futuras de las ya finalizadas; registrar la transición y crear un único aviso por destinatario/visita desde evidencia persistente. La cancelación de visitas y la creación de intenciones de correo deben ser atómicas y repetibles; resultados de proveedor inciertos quedan para revisión, no reenvío automático. Las visitas canceladas conservan historial. Si el correo AUT-17 sigue inactivo, dejar intención pendiente y una tarea al equipo; no declarar aviso entregado.

Las nuevas decisiones tienen precedencia sobre toda referencia anterior a Meta/portales. El alcance vigente es la web y seguimiento de visitas; Facebook/Instagram permanecen manuales. Se requiere resolver en el plan el esquema y guardas de concurrencia, la propagación a caché y pantallas abiertas, la ruta de cierre/corrección y su interacción con EST-17 antes de declararlo listo.
