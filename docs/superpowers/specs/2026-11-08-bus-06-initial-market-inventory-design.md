# BUS-06 · Inventario inicial común por tandas

**Alcance vigente8-nov:** [decisiones posteriores de Luis](../../roadmap/2026-11-09-list2-published-scope.md) y [preparación por tarea](../plans/2026-11-09-list2-build-ready-github.md) sustituyen propuestas incompatibles de este diseño: conexión centralPro/Hermes, no planes individuales, Meta fuera, WhatsApp/conectores/local posteriores y enlace privado hasta revocación. No asumir habilitación del proveedor ni ejecutar ramas históricas excluidas.

Fecha: 8-nov-2026. Estado: diseño y plan documental preparados; construcción y activación pendientes.

## Encargo y decisiones

Luis separa el trabajo: esta sesión planifica las tareas de Lista 2 y otra sesión construye. Pide continuar después de BUS-21/22/23 y cancelar grill-me. Se prepara BUS-06 sin más entrevista, con decisiones técnicas propuestas identificadas, sin atribuirlas como aprobaciones específicas del usuario.

Objetivo: recorrer el directorio revisado, recopilar los anuncios de las fuentes utilizables en un inventario común privado y conservar pendientes explícitos para las restringidas. No depende de un solicitante: la misma captura sirve a todas las búsquedas.

Base comprobada: main `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. La copia contiene planes anteriores sin commit que se conservan. El comando local `plan --list 2 --task BUS-06` confirmó `reserved:false`, `buildAuthorized:false`. No se toma ni modifica reserva para escribir este diseño.

## Reutilización y límites

| Activo | Reutilización |
|---|---|
| Property Directory, 138 fuentes y cuatro rondas locales | IDs, canales, grupos, acceso, políticas, evidencia y procedencia; no redescubrir entidades |
| `scripts/jersey_market.py`, `scripts/property_directory.py` y sus pruebas | Contrato de importación, validación de dinero/territorio, observaciones, IDs e idempotencia; conservar los scripts como herramientas locales |
| `Assets/jersey-market/schema.sql` | Modelo propiedad/publicación/observación; adaptar solo diferencias necesarias para D1 y el negocio |
| Historial `handoff-hermes1/main`, commit `ed56694308803a6a73b25afb87600705d2a1b722` | Intentos y evidencias de BUS-21, sin tratarlos como inventario ni como cobertura externa completa |
| `server/jobs.js` | Reloj existente cada diez minutos; no crear otro cron ni servicio |
| `server/api.js`, `server/http.js`, `server/routes/advertisers.js` | Frontera administrativa, comprobación de origen, JSON limitado, errores y contactos existentes |
| `admin/src/Automations.jsx`, `admin/src/format.js`, `admin/src/styles.css` | Controles y progreso del inventario, componentes y enlaces seguros |

La SQLite local es antecedente y herramienta de preparación; después de integrar, D1 es la fuente operativa de verdad. JSON/JSONL y CSV son formatos de intercambio, no bases paralelas. No aplicar el SQL local íntegro sobre D1: hay tablas/nombres de investigación históricos y diferencias de operación/precios.

El importador local hoy no navega, solo admite venta/alquiler y vincula identidad por URL canónica. No se afirma que ya implemente BUS-06, permisos de recolección, operaciones comerciales completas o deduplicación entre fuentes BUS-10.

No se modifican el catálogo público, las fichas propias, matches, decisiones humanas ni procesos de envío. No se descargan galerías, se contacta a anunciantes, se crean cuentas o se amplían permisos. BUS-09 ampliará normalización y verificación con modelos; BUS-10, la deduplicación transversal; BUS-08, el barrido diario. BUS-06 deja los contratos mínimos que estas tareas ampliarán, sin convertirlas en dependencias circulares.

## Dependencias de construcción y activación

- Construcción/integración operativa: BUS-23 aceptada como investigación y AGE-04 integrada, según el catálogo. La sesión constructora verifica sus evidencias reales; la planificación no las da por satisfechas.
- Acceso: BUS-19 se aplica a cada fuente utilizada. Una clave de Places no es requisito global. Properties.je conserva permiso escrito y Homely permanece excluida de extracción.
- Activación: migración aprobada, fuentes/canales con método permitido y evidencia revisada, prueba local completa y autorización de publicación/activación. Un despliegue no inicia capturas automáticamente.
- Antes de construir, incorporar de forma revisada el trabajo recuperado de Hermes y los activos locales permitidos al main vigente. No reiniciar la implementación sobre una copia que carezca de esos antecedentes.

## Propuestas técnicas adoptadas para redactar el plan

1. Un empleado inicia la carga desde Automations. Después avanza por tandas sin aprobación por tanda, con pausa y reanudación. Esto es una propuesta técnica delegada al plan; no una autorización de ejecución real.
2. Tandas de hasta diez fuentes/canales, conservando los grupos existentes y procesando también el remanente de menos de diez. La paginación de cada fuente es independiente.
3. Un solo recorrido inicial abierto. El reloj toma trabajo persistido y acotado; cerrar el navegador no lo interrumpe.
4. Los registros entran en inventario interno como declaración de fuente. La confirmación de disponibilidad y la aprobación de un match son estados diferentes y no se deducen de la importación.
5. Integración automática inicial con el catálogo propio mediante consulta interna, sin petición a su propia web, y carga manual normalizada para fuentes con captura autorizada. La arquitectura permite adaptadores específicos revisados; no se construye un lector universal ni se da a Hermes acceso general a D1.
6. Una fuente accesible sin adaptador es trabajo pendiente de procesamiento, no una restricción de acceso ni una fuente vacía. Para completar BUS-06 se procesa mediante adaptador revisado o carga manual suficiente; el piloto de Hampton por sí solo no acredita inventario del mercado externo.

## Contratos de datos

Se conserva `source_id` de Property Directory y se distingue `channel_id`/URL. El manifiesto aceptado queda identificado por huella y fecha. No confiar en un campo de entrada que simplemente diga que una fuente está autorizada: verificar el registro aprobado en servidor.

`MarketRecord` transporta: `source_id`, `channel_id`, `listing_url`, `external_id?`, `canonical_property_url?`, `observed_at`, `country_code`, `operation`, `segment`, `title`, ubicación/dirección/parroquia/código postal, dormitorios/superficies, ocupación, parking, mascotas, descripción, referencia, estado declarado, términos financieros originales, anunciantes/contactos y evidencia por campo disponible.

Reglas: `country_code='JE'` con evidencia territorial; URL HTTP(S) normalizada sin credenciales; `operation='sale'|'rent'|'business'`; enteros no negativos o desconocidos para habitaciones/parking; superficies positivas con unidad explícita; booleanos desconocidos se conservan como `null`, no como `false`. Omitir un campo no borra uno previamente conocido. Estado o precio contradictorio se guarda como duda, no como confirmación.

Finanzas: guardar importe original como unidades menores enteras, moneda, periodicidad y texto original. Separar compra, renta, premium/traspaso, precio del negocio y gastos. Nunca sumar negocio y propiedad ni comparar precio de venta con renta. Equivalente mensual separado para rentas explícitas: mes sin cambio, año/12, trimestre/3, semana×52/12, redondeo al entero menor monetario más próximo con método registrado. Semanas es una equivalencia anualizada, no un importe mensual declarado por el anunciante. Periodo o moneda desconocidos: equivalente `null`; sin conversión de divisas. Casos más ambiguos permanecen pendientes para BUS-09.

Campo de intercambio `financial_terms`: lista de `{kind, amount_minor, currency, period, raw_text, evidence_url}`. `kind`: `sale_price`, `rent`, `premium`, `business_price`, `service_charge`; `period`: `sale`, `week`, `month`, `quarter`, `year`, `unknown`. Importe/moneda/periodo desconocidos se conservan explícitamente; un importe numérico requiere moneda. El precio principal y la renta mensual derivados se guardan en columnas separadas para consulta, sin reemplazar esta lista original. La adaptación de JSONL histórico transforma `price`/`currency`/`price_period` a este contrato con evidencia y conserva los datos originales; no obliga a rehacer su captura.

Anunciantes: vincular IDs confirmados de AGE-04 y conservar todos sus teléfonos etiquetados. Los candidatos aún no identificados conservan sus datos mínimos y evidencia en el registro privado, pendientes de vinculación humana; no fusionar por nombre ni duplicar por cada reintento. No introducir `src-…` nuevos en `advertisers.details.source_ids`, que hoy referencia `research_sources` histórico; usar el enlace de mercado definido abajo.

`MarketPage = {run_id, task_id, page_key, cursor, next_cursor, observed_at, records: MarketRecord[], exhausted}`. Máximo diez registros y 131072 bytes por petición, descripción por registro hasta 4000 caracteres. `page_key` y huella de contenido permiten reintento idéntico sin duplicar; mismo identificador con contenido distinto devuelve conflicto y no sobrescribe silenciosamente.

## Persistencia aditiva propuesta

Ruta nominal `migrations/0032_market_inventory.sql`: al construir, confirmar el siguiente número libre con main vigente y otros trabajos; si 0032 está ocupado, usar el siguiente y actualizar todas las referencias. Nunca renumerar una migración ya publicada/aplicada.

| Tabla | Responsabilidad y claves |
|---|---|
| `market_sources` | Snapshot trazable del directorio aceptado: `source_id` único, canales, política/versión, método y evidencia de aprobación; no reemplaza investigación histórica |
| `properties` | Identidad física y hechos territoriales; reutiliza contrato local y admite vínculo explícito al catálogo propio |
| `market_listings` | Publicación por fuente/operación y URL normalizada, estado declarado, campos comparables y financieros originales separados |
| `listing_observations` | Observación fechada y huella; única por publicación/fecha; conservar anteriores sin hacerlas actuales |
| `market_advertiser_links` | Publicación y anunciante confirmado de AGE-04, procedencia y rol; sin alterar referencias históricas |
| `market_inventory_runs` | Manifiesto, solicitante, estado, versión y totales; una única ejecución inicial abierta |
| `market_inventory_tasks` | Fuente/canal, cursor, intentos, siguiente intento, lease/versión y último éxito; única por run/fuente/canal |
| `market_inventory_pages` | Página/huella aplicada y resultado; única por tarea/page_key |

Validar tipos y claves foráneas. Guardar publicación, observación, contactos mínimos pendientes y avance del cursor en una transacción D1; una página inválida no confirma cursor ni modifica registros parciales. No borrar datos para resolver conflictos. Si ya existe parte del esquema en la construcción paralela, ampliar sus tablas y contratos en vez de crearlos de nuevo.

Clave única de publicación: `(source_id, listing_url, operation)`. Una URL que anuncie venta y alquiler conserva dos publicaciones/operaciones sobre la misma propiedad cuando su identidad esté acreditada; adaptar la antigua unicidad solo por URL del esquema local. Calcular huellas sobre JSON canónico sin depender del orden de claves.

Identidad mínima: reintento de la misma URL/publicación es el mismo registro. La misma URL original canónica acreditada puede compartir propiedad; similitud de dirección/título/precio no fusiona. Dos pisos de un edificio permanecen separados. BUS-10 extiende revisión y resolución de identidades; BUS-06 no declara esa tarea terminada.

## Estados, ejecución y errores

Run: `queued`, `running`, `paused`, `waiting_manual`, `completed`, `completed_with_pending`, `failed`. Tarea: `queued`, `working`, `done`, `retry_wait`, `access_pending`, `manual_pending`, `excluded`, `failed`.

La pausa impide nuevas peticiones y nuevos commits después de confirmar la nueva versión. Una respuesta en vuelo con versión anterior no avanza cursor; se reintenta sin pérdida por la clave idempotente. Reanudar conserva los datos y cursores. Un lease expirado permite recuperar la misma página; la respuesta del propietario anterior se rechaza mediante comparación de versión.

Propuestas de límites: máximo cinco páginas por tick, una petición simultánea, presupuesto de ejecución de 20 segundos entre páginas, timeout de red de diez segundos y respuesta máxima de 1 MiB leída de forma acotada. Cada fuente respeta el mayor entre 60 segundos y su intervalo permitido. El reloj existente sigue a diez minutos; no se cambia en este encargo.

Errores de red/5xx: máximo tres intentos por página, próximos ticks respetando espera creciente y política. 429: respetar `Retry-After` y el límite de intentos; 401/403/login: `access_pending`, sin bucle de reintento ni elusión. URLs sin adaptador o carga aún no entregada: `manual_pending`. Ningún fallo retira propiedades ni actualiza el último éxito.

Un índice vacío con acceso y paginación comprobados puede registrar cero resultados. Un contenido no interpretable no. El recorrido nunca anuncia “100% del mercado”; informa fuentes procesadas, pendientes, fallidas y excluidas. `completed_with_pending` describe el recorrido técnico, no cierra BUS-06 si siguen fuentes utilizables sin procesar o evidencia de cobertura insuficiente.

## Rutas y pantalla

Rutas privadas nuevas bajo `/api/admin/market-inventory`: GET resumen; POST `/runs` para iniciar; POST `/runs/:id/pause` y `/resume` con versión; POST `/runs/:id/pages` para carga manual normalizada. Mantener `currentAdmin`, origen y respuestas `no-store` de `server/api.js`. No añadir puertas públicas o nuevas credenciales.

Entrada del directorio: POST `/sources` registra el manifiesto revisado con fuentes/canales en estado de permiso pendiente, sin habilitar acceso por un booleano cargado. POST `/sources/:id/approve` es una acción administrativa explícita con versión, método permitido y referencia de evidencia; el servidor fija actor/fecha, mantiene la exclusión de Homely y exige evidencia del permiso escrito cuando corresponda. La evidencia de investigación y la de permiso se guardan por separado. Reutilizar una integración equivalente de BUS-23 si ya existe, manteniendo estas garantías; no duplicar el registro. Controles `Load reviewed directory` y `Review source access` dentro de la misma sección de Automations.

`DirectoryPage = {manifest_hash, expected_sources, page_index, page_count, sources}`: índices desde0 y hasta diez fuentes por petición; repetición idéntica idempotente y contenido diferente bajo el mismo índice devuelve409. Registrar completitud en configuración interna y verificar fuentes únicas/huella global antes de iniciar un run. Una carga incompleta no reemplaza el manifiesto vigente; no actualizar parcialmente el que usa una ejecución abierta.

Controles en una sección `Initial market inventory` de Automations, mediante `MarketInventory.jsx`: `Start initial inventory`, `Pause`, `Resume`, `Import observations`, `Retry failed sources`. Listar progreso por fuente, último intento/éxito y acción pendiente; separar `Access pending` de `Import needed`. No crear otra página de fichas: BUS-03 ampliará la consulta del inventario.

Carga manual: archivo JSONL normalizado local, como máximo 1 MiB; procesar por páginas de hasta diez y enviar a la ruta administrativa. Conservar el fichero en memoria mientras dura la operación; un error muestra la línea y conserva el avance confirmado, sin cargar datos personales en almacenamiento del navegador. El servidor vuelve a validar todo. La interfaz no confirma un origen o permiso basándose solo en el archivo.

## DESIGN.md: valores que se aplicarán

Superficie: panel existente, registro producto; no web pública ni rediseño. Valores actuales de `admin/src/styles.css` y DESIGN.md Colors/Hierarchy/Components: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d` para foco/no texto, bronze-dk `#86542d` para texto pequeño/hover, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`.

Tenor Sans/Georgia para títulos (h1 26px, h2 19px), Montserrat/system-ui 14px/1.5 para cuerpo, etiquetas 12px y cabeceras 12px/600. Reutilizar `.card` padding 24px/radio14px; campos radio10px; botones píldora999px/padding10px 20px. Celdas10px 12px y adaptación a tarjetas bajo760px. No nuevas fuentes, bibliotecas, colores ni imágenes.

Estados con texto y color; carga por texto, no nuevos skeletons. Errores `role=alert`, progreso `role=status`/`aria-live=polite` sin anunciar cada registro; etiquetas asociadas y foco2px bronce/offset2px. Propuesta local: controles nuevos de44px de alto para escritorio/móvil. Verificar a1280/390 y zoom200%, sin desbordamiento de página; tablas con nombres legibles y controles de teclado. Nada de animación ornamental; respetar movimiento reducido. No adoptar propuestas visuales genéricas de otras skills sobre las reglas de Hampton.

## Seguridad, rendimiento y skills

Fuentes y anuncios son entrada no confiable: texto React, enlaces con `safeHref`, sin HTML crudo, scripts ni evaluación de instrucciones contenidas en páginas. No enviar datos de contactos a modelos; BUS-09 concretará su carril autorizado. No guardar HTML completo, documentos personales o secretos como evidencia; almacenar valores mínimos y referencias privadas.

Adaptadores externos futuros solo sobre hosts/canales aprobados en servidor, HTTPS, sin direcciones locales/IP literales/credenciales ni redirecciones automáticas a otros destinos. No realizar fetch de una URL arbitraria aportada por una ficha o archivo. El método manual no evita las políticas de acceso/uso por fuente. Logs solo IDs internos, contadores y códigos de error, nunca nombres/contactos o payloads.

Paginación de resumen de fuentes:50 filas por respuesta; sondeo del panel30s solo visible y autenticado, usando `usePoll`. No descargar anuncios completos para mostrar progreso, ni guardar inventario en localStorage. Página de importación/cursor e índices acotados; ningún proceso depende de que la pestaña siga abierta.

`writing-plans`: tareas, contratos y pruebas concretas. `ponytail`: reutilización de SQLite/validaciones/reloj/Automations, sin framework de scrapers. `security-best-practices` y `frontend-security-coder`: límites, auth/origen, protección de URLs y renderizado de datos externos. `impeccable` y `antislop`: controles existentes centrados en iniciar/pausar/entender pendientes, sin estadísticas decorativas ni instalación de herramientas. `web-performance-optimization`: páginas pequeñas, sondeo visible y sin galerías. Taste-skill/páginas nuevas y redesign-skill/rediseño no aplican. No se ejecutó generación de interfaz, inicializador visual ni auditoría global en esta planificación.

## Aceptación

Fuentes utilizables aportan inventario real, con origen, operación, evidencia y fecha; las restringidas tienen acción visible. Reintentar no duplica. Distintas publicaciones conservan anunciantes y contactos. Un fallo o dato desconocido no inventa disponibilidad ni convierte un imprescindible en satisfecho. Pausa/reanudación y reinicio del proceso conservan cursor y registros. El inventario no aparece en la web pública ni autoriza mensajes, matches o propuestas. Una migración y un piloto propio correctos no bastan para declarar cobertura externa terminada.

Plan: [BUS-06](../plans/2026-11-09-list2-build-ready-github.md). Registro: [ledger](../plans/2026-11-09-list2-build-ready-github.md).
