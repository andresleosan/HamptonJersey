# EST-18 · Registro interno de cambios de propiedades

Fecha: 7-nov-2026. Estado: aprobado por Luis: «si, construyelo»; implementación local verificada y revisada; sin migración de producción aplicada.

## Encargo y decisión de Luis

Continuar después de la base de NOT-11 con una entrega útil que no espere al directorio AGE-04 ni a la investigación de fuentes. Luis eligió **«Solo registro interno por ahora»** frente a añadir un historial visible en cada propiedad. Esta entrega registra cambios en el servidor; la consulta visual queda pendiente. La invocación de EST-18 no autoriza publicar ni migrar producción.

La entrega es de varias partes: esquema, escritores existentes y pruebas de integridad. No implica un nuevo módulo de inventario ni una nueva interfaz.

## Enfoques considerados

1. Registro interno y consulta en cada ficha: permitiría al equipo verlo inmediatamente, pero añade interfaz, navegación y paginación. Era la recomendación inicial.
2. **Registro interno en los flujos existentes**, elegido por Luis: prepara la trazabilidad sin añadir pantallas ni depender de módulos futuros. El equipo continúa usando los mismos controles; por ahora la evidencia se verifica mediante pruebas y consultas internas.

Decisión técnica aprobada: ampliar la tabla común `events` para admitir `listing` y reutilizar sus convenciones. Un registro paralelo completo separaría innecesariamente los historiales; guardar solo logs de servidor no ofrece conservación ni atomicidad con D1. El constructor decidirá la distribución exacta entre funciones y SQL conforme a los contratos siguientes, sin introducir servicios ni dependencias.

## Base comprobada

- Copia aislada `/tmp/hampton-est18`, rama `main`, `HEAD = main = origin/main = 2588e7023cbb6b83ae12ec7dc295d5f7c7338418`; fetch realizado el 7-nov-2026 a las 20:43 UTC, comparación 0/0.
- `/root/HamptonJersey` conserva otra rama y archivos ajenos. NOT-11 se conserva en `/tmp/hampton-not11`, commit local `f98532afa8a9d414b19a36ab169719e15e89fb00`, sin publicar; no se integra ni modifica por este encargo.
- `events` admite applicant/contact/viewing/admin. `logEvent` permite escribir evento y aviso dentro de un batch, condicionado a una escritura efectiva.
- El editor de propiedades no escribe eventos. Sales escribe `listing.availability_changed` en el historial del comprador. Existen otras vías: Properties Queue, confirmación de disponibilidad, destacados, portada y recálculo de características.
- Los IDs de propiedades son estables y `deleted_listings` impide su reutilización. Los historiales de contactos y visitas conservan metadatos tras borrar sus datos; esta política se preserva.

## Resultado y alcance

Cada cambio material de una ficha ejecutado por las vías cubiertas deja un evento persistente con identidad de la ficha, fecha UTC, actor y origen, acción y versión. Se conserva el orden aun cuando dos operaciones ocurran en el mismo milisegundo. Guardar y registrar constituyen una sola operación de base de datos: si falla el evento, no queda un cambio sin explicar; un rechazo no registra un éxito.

El evento es informativo. No crea notificaciones, tareas, llamadas, correos ni mensajes, y no altera los contadores o el Feed. Se mantiene la separación entre historial y trabajo pendiente de NOT-11.

### Escritores incluidos

| Vía | Qué registra |
| --- | --- |
| Alta manual, carpeta local o borrador de Properties Queue | Creación efectiva de la ficha; actor y origen conocido. La cola puede aportar su ID interno, nunca la URL de Drive ni sus documentos. |
| Guardar campos | Un evento por guardado material, con los campos modificados; incluye precio, operación, disponibilidad, criterios estructurados, oferta a aplicantes y controles de visitas VIS-18. |
| Publish / Unpublish / Archive / Restore | Transición efectiva, con estados anterior y posterior; las comprobaciones de ofertas/ventas se mantienen. Repetir Publish sobre una ficha ya publicada conserva la reconfirmación de disponibilidad que ya hace la aplicación: registra una confirmación, no otra publicación. |
| Still available | Confirmación explícita y su responsable. No se presenta como observación automática. Conserva la regla de no invalidar un formulario abierto solo por confirmar. |
| Sales | Cambio real de disponibilidad de la propiedad por aceptar una oferta, completar una venta o su caída. Conserva el evento existente del comprador; ambos se relacionan por el ID interno de operación, sin copiar sus datos personales. |
| Featured y cambio de portada | Cambio real del atributo de la ficha. La renumeración de destacados no se presenta como múltiples decisiones humanas independientes. |
| Recalculate all | Cambio real de características derivadas/parroquia, con origen automático. Un recálculo sin diferencias no añade ruido ni modifica una decisión humana existente. |
| Borrado definitivo y descarte desde Queue | Evento mínimo de borrado vinculado al ID estable; no desaparecen los eventos anteriores. |

El almacenamiento o borrado del archivo binario en R2, las etiquetas/orden individuales de la galería y los detalles de investigación no son cambios del estado de la ficha en esta entrega. Si una operación de medios cambia la portada, sí registra ese cambio. Una eliminación de R2 pendiente no se registra como eliminación física completada.

### Datos que se conservan

- Tipo de evento, referencia de ficha, instante, actor autenticado o `system`, origen cerrado y revisión monotónica por ficha.
- Orígenes iniciales: editor del panel, Properties Queue, Sales, medios y recálculo automático. Son valores del servidor, no texto arbitrario aceptado del cliente.
- Antes/después de los campos estructurados: `published`, `archived_at`, `availability`, `published_at`, `confirmed_at`, `use`, `operation`, `sale_price`, `rent`, `rent_period`, `premium`, `currency`, `parish`, `tenure_type`, `housing_category`, `restriction`, `bedrooms`, `bathrooms`, `matchable`, `viewings_enabled`, `viewing_hours`, `featured_rank`, `cover_media_id`, `feat_pets`, `feat_parking`, `feat_furnished`, `feat_outdoor` y `feat_type`. Los valores desconocidos continúan siendo `null`, distintos de cero o falso.
- Para campos de texto libre (título, dirección, descripción, resumen, especificaciones, texto de precio, URLs y evidencia extraída), se guardan los **nombres de los campos que cambiaron**, sin copiar su contenido al historial. Este historial no sirve para restaurar versiones completas de descripciones.
- No se copian nombres, teléfonos, emails de clientes, notas de negociación, documentos, fotos, URLs privadas ni credenciales. El actor sigue el identificador administrativo que ya utiliza `events`.
- No se fabrica un historial retrospectivo. Las fichas existentes empiezan sin eventos nuevos; su primer cambio posterior inicia su secuencia. Los eventos antiguos conservan IDs y datos sin reinterpretarlos.
- Cuando un guardado humano también deriva características del texto, se identifican sus campos derivados por separado; no se presenta esa deducción como confirmación humana de cada característica.

## Atomicidad, reintentos y concurrencia

1. La mutación efectiva de la fila de propiedad y su evento se guardan en la misma transacción/batch. El `before` corresponde a la fila que la escritura reemplazó, no a una lectura obsoleta. Un fallo de validación, autorización, conflicto o escritura previo a ese commit no deja evento de éxito. Un fallo posterior o una respuesta perdida no borra el evento del cambio que sí se confirmó en D1.
2. La versión del historial avanza solo con un evento real. No sustituye automáticamente a `updated_at`: confirmación/destacados/recálculo mantienen sus reglas actuales sobre formularios abiertos. Donde se usa `updated_at` para bloquear guardados, debe avanzar aunque el reloj entregue el mismo milisegundo.
3. Repetir una actualización sin cambio material no repite el evento. Las transiciones condicionadas de Sales/estado producen un único efecto aun en concurrencia. Una confirmación explícita es un hecho nuevo aunque la disponibilidad nominal sea la misma.
4. La identidad funcional del evento es entidad + revisión. Se prepara **un contrato interno**, sin cabeceras, parámetros públicos ni cambios del cliente: los identificadores de operación que aporte un productor se validan y vinculan a actor, acción, entidad y una huella de la petición; la misma clave no puede aplicarse con otro contenido. Repetir devuelve la identidad del evento ya registrado y no ejecuta otra mutación. No almacena una respuesta completa ni devuelve copias de datos eliminados. Su prueba verifica el helper interno; no acredita reintentos identificados en el panel actual.
5. Esta fase no añade cambios al cliente ni promete deduplicar dos solicitudes independientes de crear una ficha o confirmar disponibilidad que no lleven una identidad común. En los flujos actuales, cada creación/confirmación aceptada es una operación distinta; su evento se escribe una sola vez. No se emplea deduplicación por contenido que pudiera suprimir dos acciones legítimas.
6. Si un recálculo posterior falla, el cambio y su evento permanecen unidos; conserva el comportamiento actual de `afterSave`. No se registra que el recálculo terminó cuando no terminó.
7. El evento nuevo de Sales no rompe las condiciones basadas en `changes()` o `last_insert_rowid()` de los eventos/notificaciones existentes. Los IDs relacionados se capturan dentro de la operación efectiva.
8. La atomicidad nueva no convierte todo el flujo Queue/medios en una transacción: si se crea la ficha y falla después el enlace de Queue, el evento acredita la creación, no que la importación terminó. El contexto de Queue se pasa desde la llamada conocida; no depende de que el enlace posterior exista. Si se guarda portada y fallan después cambios de la galería, el evento acredita solo la portada. Se conservan las compensaciones actuales. No se declara finalizada una importación o eliminación física por registrar un cambio de ficha.
9. La confirmación al repetir Publish ya existe y se conserva para no alterar ADM-04/To confirm. Es una confirmación explícita nueva, igual que Still available, aunque no cambie el estado nominal. Una repetición identificada de un productor interno sí reutiliza el evento original; peticiones actuales sin identidad común siguen siendo acciones distintas.

## Conservación y límites de privacidad

El borrado de una propiedad conserva su identidad en `deleted_listings` y el historial estructurado mínimo de esta entrega, incluido el evento de borrado. No hay FK con cascada desde `events` hacia `listings`. Una ficha nueva no puede heredar el historial de una eliminada.

No se cambian los plazos ni las reglas de conservación de contactos, visitas, compradores, correos o alquileres. Los nuevos eventos de propiedad no contienen sus datos ni impiden su eliminación. La futura purga de archivos EST-19 deberá conservar estos eventos, pero esta entrega no activa ninguna purga ni declara EST-19 terminado.

## Migración y compatibilidad

Se necesita una migración que amplíe el CHECK de `events` y prepare revisión/identidad cuando corresponda. Se mantendrán todos los eventos, índices y referencias `notifications.event_id`; nunca se reconstruyen notificaciones perdiendo su contenido. Se conservará la lectura por entidad y orden sin recorridos completos en cada escritura.

La ampliación de CHECK exige reconstruir la tabla de forma compatible con D1. Se comprobará en una base local poblada y con claves foráneas activas, no solo en una base vacía. La guía oficial documenta el aplazamiento de comprobaciones de claves durante migraciones; no equivale a desactivar controles del servicio: https://developers.cloudflare.com/d1/reference/migrations/ y https://developers.cloudflare.com/d1/sql-api/foreign-keys/.

NOT-11 tiene pendiente `0028_notification_tasks.sql`, con referencias y triggers que consultan `events`. EST-18 usará provisionalmente el número **0029**, verificándolo antes del commit contra el remoto actualizado y las entregas conocidas. Debe funcionar sobre la base publicada y sobre una composición local de prueba con NOT-11; no importa a su entrega código privado ni publica NOT-11 como efecto secundario. Si cambia el orden de integración, se repiten las pruebas de migración y triggers afectadas.

La construcción local no necesita AGE-04 ni fuentes externas. La futura trazabilidad de fuentes, publicaciones, consultas, llamadas y archivos se conectará al construirse esos módulos; EST-18 seguirá parcial para ese alcance futuro y para la vista de historial que Luis aplazó.

## Validación exigida

- Migrar datos existentes: IDs y filas de eventos/notificaciones conservados; integridad referencial correcta; compatibilidad con NOT-11 en una composición local aislada.
- Cubrir cada vía de la tabla, antes/después efectivos y atribución correcta de persona/sistema.
- No registrar guardados sin cambios, rechazos ni conflictos; confirmaciones explícitas sí quedan atribuidas.
- Dos guardados con la misma versión y reloj fijo: solo uno gana y no hay evento ficticio; Sales y edición manual conservan una secuencia coherente.
- Repetir Publish no mueve `published_at`, mantiene la confirmación prevista por ADM-04 y registra confirmación, sin duplicar el evento de publicación.
- Fallo forzado al escribir evento: se revierte también la mutación del dominio.
- Fallo posterior al commit de ficha (enlace Queue o escritura de galería): el evento describe solo el cambio realmente guardado; no afirma que todo el flujo terminó.
- Reintento del productor con identidad estable: un evento; clave repetida con otra acción/contenido: conflicto. Operaciones distintas legítimas se conservan.
- Borrado de propiedad/cliente/visita y limpieza: metadatos preservados, sin reincorporación de datos eliminados; `foreign_key_check` limpio.
- No cambian avisos ni sus IDs, tareas ni contadores por registrar eventos de ficha.
- `npm test`, `npm run build`, `npm run check:release`. No se añaden dependencias.
- Playwright MCP: no aplica a una vista nueva porque esta entrega es interna y no cambia interfaz. Se ejecutará la regresión e2e general para comprobar que los controles actuales siguen funcionando contra las rutas modificadas; si durante el plan resulta necesario modificar interfaz o su flujo, se revisa el alcance y se añade el recorrido MCP 1280/390 exigido por avanzar.

## Decisiones de grill-me

Resueltas por el usuario: registro interno, sin vista en panel. Resueltas por el proyecto: mismo acceso administrativo; historial común; el evento no implica un aviso; prioridad de la corrección humana; conservar historial y minimizar datos; autorización de publicación por SHA separado.

Decisiones propuestas por el constructor para esta aprobación: eventos nuevos solo desde activación; diferencias estructuradas y nombres de campos para textos libres; identidad/revisión por ficha; cobertura de escritores existentes; límite explícito de reintentos sin identidad común; preservación de metadatos al borrar. La revisión independiente pidió precisar tres límites: atomicidad de ficha/evento frente a escrituras posteriores de Queue/medios, identidad únicamente interna y reconfirmación al repetir Publish. Se resolvieron conservando el comportamiento existente y la elección de no modificar el cliente. No quedan decisiones de negocio que dependan de la investigación de Luis. La distribución exacta de helpers, SQL e índices se fija en el plan tras aprobar este diseño.

## Entrega y aprobación

Después de aprobar este documento: plan con archivos y criterios, implementación, pruebas, revisión independiente y commit junto con ESTADO/checklist/ledger. Antes de publicar se presentará el SHA final y la migración. La implementación y las pruebas locales están acreditadas en el ledger; la publicación sigue pendiente de aprobación.
