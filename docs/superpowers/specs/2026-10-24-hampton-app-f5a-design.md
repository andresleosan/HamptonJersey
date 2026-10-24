# Hampton App · F5-A: alquileres gestionados

Fecha: 2026-10-24 · Estado: respuestas de Luis (24-oct) y decisiones de Claude · Base: `main` después de F3-C
Parte de la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §3 `tenancies`/`charges`/`payments`/`compliance_items`/`maintenance_jobs`, §4.6, §5.11, §7.3 «Alquiler» y «Licencia de vivienda en alquiler», §9 F5). Donde este documento no dice nada, mandan la arquitectura y los specs de F0, F1-A, F3-A, F3-C y F7-A.

## 1. Intención

Hoy los alquileres gestionados son el negocio de Hampton (Luis, 24-oct). Se llevan de memoria, en hojas y en el banco. Al equipo le quitan horas y le dan sustos cuatro cosas, todas marcadas por Luis:
- quién no ha pagado y qué toca hacer con cada atraso;
- los plazos legales: licencia, EICR, gas, alarmas, depósito en 30 días, inventario en 7 días;
- las renovaciones y las subidas de renta con su tope;
- las reparaciones.

F5-A pone cada vivienda gestionada, su propietario, su contrato, sus cobros, sus plazos y sus reparaciones en el panel. Una pantalla **Rentals** dice cada día qué toca hacer.

Lo que Luis dijo sobre el servicio y el volumen:
- **Servicio:** depende del propietario. Con unos Hampton cobra la renta y liquida (gestión completa) y con otros solo busca inquilino (*let only*).
- **Volumen:** hoy son menos de 15, pero no está seguro, así que debe aguantar más («preparado por si son más»).

Por eso, además de marcar pagos a mano, F5-A importa el extracto del banco en CSV y concilia por referencia.

F5-B traerá lo que necesita servicios externos o un abogado:
- recordatorios por email o WhatsApp y cartas con plantilla validada;
- el portal y las solicitudes del inquilino con referencias;
- la firma electrónica y la liquidación enviada sola;
- las inspecciones programadas con fotos y la clasificación de reparaciones con IA.

**Éxito (verificable):**
- El equipo da de alta un propietario, una vivienda con su servicio y un contrato. Los cobros mensuales se generan solos desde el inicio hasta hoy y el siguiente.
- Un pago, marcado a mano o importado del CSV, se aplica a la deuda más antigua. Un contrato con renta vencida e impagada aparece en «Arrears» con sus días de retraso y el siguiente paso de la secuencia (día +1, +5, +7, +10, +14) el día que toca. El paso se marca hecho.
- Importar un extracto CSV hace cuatro cosas:
  - empareja cada ingreso con su contrato por la referencia `HE-T0001` de la descripción;
  - deja en «Unmatched» lo que no casa;
  - permite asignarlo a mano;
  - no duplica nada si el mismo extracto se importa dos veces.
- Cada obligación legal (licencia, EICR, gas, alarmas, depósito, inventario de entrada y de salida) tiene fecha límite y avisa a 60, 30 y 7 días. Vencida, sale en rojo y suma en el contador de la barra.
- A 90 días del fin de un contrato de plazo fijo aparece «Renewal due». El asistente de renta calcula la renta máxima con el RPI que introduce el equipo y la primera fecha posible.
- Una reparación sigue su estado con urgencia, proveedor, presupuesto y aprobación del propietario cuando supera su límite. El coste pasa a la liquidación del mes.
- La liquidación mensual de cada propietario con gestión completa se imprime desde el navegador. Muestra rentas cobradas, honorarios, reparaciones y neto a pagar.

**No-objetivos:**
- envíos (email, WhatsApp, cartas automáticas);
- portal del inquilino y solicitudes con referencias;
- firma electrónica;
- PDF generado en el servidor;
- registrar que se pagó al propietario;
- inspecciones programadas;
- IA;
- datos bancarios del propietario;
- fichas públicas nuevas al acabar un contrato;
- enlazar viviendas con `listings` o inquilinos con `applicants`.

**Anti-objetivos:**
- Cobrar dos veces el mismo mes o importar dos veces el mismo movimiento.
- Que una regla legal esté escrita en varios sitios: todos los plazos viven en una constante revisable (§7.3 de la arquitectura: «son parámetros, no código»).
- Datos del inquilino o del propietario en una ruta pública o en el navegador fuera de la sesión del panel.
- Que la barra del panel deje de caber en una línea a 1280 px.
- Pantallas o botones que no hacen nada.

## 2. Decisiones

| # | Decisión | Quién · por qué |
|---|---|---|
| R1 | Servicio por vivienda: `full` (cobra y liquida) o `let_only`. Cobros, pagos, atrasos y liquidación solo existen en `full`. Plazos legales, renovaciones y reparaciones, en las dos | **Luis**: «Depende del propietario» |
| R2 | Pensado para cientos de contratos: listas con búsqueda y filtros; saldos, atrasos y vencimientos calculados en SQL (funciones de ventana), no recorriendo filas en JS; índices en cada consulta del día a día; importación de CSV | **Luis**: «preparado por si son más» |
| R3 | Tablas nuevas `landlords` y `rentals` (la vivienda gestionada, con dirección en texto y parroquia). No se reutilizan `contacts` (12 meses de retención, únicos por email, matching) ni `listings` (catálogo público) | Claude. Un propietario puede tener varias viviendas. La relación es contractual, no de búsqueda |
| R4 | Un contrato (`tenancies`) por vivienda activo a la vez (índice único parcial). Lleva el inquilino principal (nombre, email, teléfono), los demás ocupantes en texto y estos datos: tipo `fixed` o `periodic`, régimen `2011` o `2025` (§7.3), inicio, fin si es fijo, renta mensual en libras enteras y día de pago (1–28). También el depósito (importe, recibido el, protegido el, referencia de mydeposits), las fechas de los inventarios de entrada y salida, el último cambio de renta y el preaviso (fecha y quién lo da). Al terminar, `ended_on` | Claude, desde §3/§4.6 de la arquitectura |
| R5 | **Referencia de pago única** `HE-T` + id con 4 cifras (`HE-T0042`), generada al crear el contrato. El inquilino la pone en su transferencia | Arquitectura §5.11 |
| R6 | **Cobros** (`charges`): uno por mes y contrato `full`, con vencimiento el día de pago, desde el inicio hasta el mes en curso más el siguiente, sin pasar del fin del contrato. Se generan con una sentencia idempotente (`INSERT … SELECT … ON CONFLICT DO NOTHING`, único `(tenancy_id, due_on)`) al crear el contrato y al leer Rentals. Un cambio de renta con fecha efectiva rehace solo los cobros futuros aún no pagados. Primer mes completo, sin prorrateo; el equipo corrige un importe a mano con evento | Claude: sin cron en Pages; leer basta para tener el mes al día. Prorratear exige reglas que Hampton no ha dado |
| R7 | **Pagos** (`payments`): fecha, importe, descripción y origen (`manual`, `import`). Contrato opcional: sin él queda en «Unmatched». El saldo es la suma de cobros vencidos menos la suma de pagos. El atraso cuenta desde el cobro más antiguo que los pagos no cubren (orden FIFO) | Claude |
| R8 | **Secuencia de atraso**: +1 «Friendly reminder», +5 «Firm reminder», +7 «Call the tenant», +10 «Tell the landlord», +14 «Formal letter», en días desde el vencimiento del cobro impagado más antiguo. El panel muestra el siguiente paso pendiente y el equipo lo marca hecho, con nota. F5-A no envía nada. Un pago que cubre la deuda cierra la secuencia sola | Arquitectura §5.11; envíos en F5-B |
| R9 | **Importar CSV**: el navegador lee el archivo (≤ 1 MB, no se guarda) y el equipo elige las columnas de fecha, importe y descripción; formatos de fecha `DD/MM/YYYY` y `YYYY-MM-DD`. La elección se recuerda en `app_settings` por cabecera de columnas. El servidor recibe filas ya separadas (máx. 2.000) y las valida. Solo entran ingresos (importe > 0). Cada fila lleva una huella (fecha + importe + descripción + número de aparición en el archivo, en SHA-256) única en `payments`, así que reimportar no duplica. Emparejado: referencia `HE-T\d{4}` en la descripción, sin distinguir mayúsculas ni espacios. Si el contrato no existe o no es `full`, va a «Unmatched». Antes de confirmar se ve un resumen con cuántas emparejan, cuántas no y cuántas estaban ya | Claude. Banco desconocido: columnas a elegir en vez de un formato fijo |
| R10 | **Plazos legales**, constantes en `server/rentals.js`, validadas por un abogado de Jersey antes de fiarse de ellas: licencia de vivienda 2 años, EICR 5 años, gas 1 año (solo si la vivienda tiene gas), alarmas 1 año (revisión anual de humo y CO), depósito protegido 30 días desde que se recibe, inventario de entrada 7 días desde el inicio y de salida 7 días desde el fin. Avisos a 60, 30 y 7 días | §7.3 de la arquitectura |
| R11 | Obligaciones por vivienda (`compliance_items`): tipo (`licence`, `eicr`, `gas`, `alarms`), última vez hecha y caducidad (calculada como última + periodo, editable para fechas reales del certificado), nota. Las del contrato (depósito, inventarios) se calculan de sus fechas, sin filas. Una vivienda nueva crea las tres o cuatro filas vacías («Not recorded», que cuenta como vencida para que nadie la olvide) | Claude |
| R12 | **Renovación**: un contrato `fixed` sale como «Renewal due» desde 90 días antes de su fin. **Asistente de renta**: el equipo guarda el RPI de Jersey vigente (porcentaje y fecha, en `app_settings`, editable). Para un contrato calcula la renta máxima = renta × (1 + RPI) redondeada a la libra hacia abajo, y la primera fecha efectiva posible = la más tardía entre «último cambio + 12 meses» (o inicio + 12 meses) y «hoy + 2 meses». Muestra las excepciones de la ley (mejoras, renta muy por debajo del mercado) como texto, sin aplicarlas. Aplicar una subida crea el cambio con su fecha (R6) y su evento | §7.3; las cartas, en F5-B |
| R13 | **Preaviso**: registrar quién lo da y cuándo. El panel muestra la fecha mínima de salida: inquilino en periódico, 1 mes; casero sin causa en periódico, 1 año; en plazo fijo, el fin del contrato. Lo demás, como texto informativo. Al terminar (`ended_on`), la vivienda queda libre para otro contrato y el inventario de salida empieza su plazo | §7.3 |
| R14 | **Reparaciones** (`repairs`): título, detalle, urgencia (`emergency`, `urgent`, `routine`), estado (`reported` → `awaiting_approval` → `approved` → `in_progress` → `done`; o `cancelled`), proveedor (texto), presupuesto, coste final, fecha de hecho y si se carga al propietario (por defecto sí). Si el presupuesto supera el `approval_limit` del propietario (£, opcional), pasa por `awaiting_approval` y se anota cuándo aprobó. Una emergencia abierta suma en el contador | Arquitectura §5.11 sin IA ni directorio de proveedores |
| R15 | **Liquidación** (`full`): por propietario y mes de Jersey, una vista imprimible (CSS de impresión, sin PDF) con estas líneas por vivienda: rentas cobradas en el mes (pagos con fecha en el mes), honorarios = cobrado × `fee_percent` de la vivienda, reparaciones hechas en el mes cargadas al propietario, y el neto | Claude |
| R16 | **Contador** de la barra junto a **Rentals**: contratos con atraso cuyo siguiente paso ya toca + obligaciones vencidas + renovaciones por decidir (dentro de 90 días sin preaviso ni cambio) + emergencias abiertas + pagos sin emparejar. Mismo `/admin/notifications/counts`, un campo `rentals` | Claude, como Sales en F3-C |
| R17 | **Barra**: con Rentals no cabe a 1280 px. Availability, 3D tours y Users pasan a un menú **Settings** (botón con `aria-expanded`, Escape lo cierra, el foco vuelve al botón). Rentals va después de Sales | Claude: son pantallas de configuración, se usan poco |
| R18 | **Historial** propio: tabla `rental_events` (vivienda, contrato opcional, cuándo, quién, tipo, datos JSON). El `CHECK` de `events` no se toca, porque reconstruirla con `notifications` apuntándole no compensa | Claude, como V11 de F3-C |
| R19 | **Retención**: contratos, pagos y reparaciones se guardan mientras dure la relación y 6 años más (confirmar con el abogado). Una vivienda se archiva (D9) y no se borra para siempre si tiene contratos. El borrado de 12 meses (G2) no aplica a estas tablas | Claude |
| R20 | **Importes** en libras enteras > 0 y ≤ 1.000.000 (renta, depósito, presupuestos, costes); el importe de un pago admite peniques (se guarda en peniques, `INTEGER`) porque el banco los trae. `fee_percent` entre 0 y 100 con dos decimales. Fechas `YYYY-MM-DD`; «hoy» y «este mes» en hora de Jersey | Claude |
| R22 | **Contratos que ya están en marcha**: cada contrato lleva `collect_from` (fecha desde la que Hampton cobra; por defecto, el inicio) y un saldo inicial opcional (`opening_balance`, peniques ≥ 0, la deuda que arrastra), que entra como un cobro con vencimiento en `collect_from`. Sin `collect_from` no hay cobros (`let_only`, o aún no se cobra). Pasar una vivienda de `let_only` a `full` con contrato activo exige poner `collect_from` en ese momento (el panel lo pide); nunca se generan cobros anteriores | Claude, a partir del builder check: el alta de las viviendas actuales no puede llenar Arrears de meses que ya se cobraron fuera |
| R23 | **Calendario de cobros**: el primero vence en `collect_from`; los siguientes, el `due_day` de cada mes siguiente. Sin prorrateo: si el primer periodo es más corto, el equipo corrige su importe a mano (queda marcado `edited` y con evento). `due_day` por defecto = día de inicio, con tope 28 | Claude |
| R24 | **Fin del plazo fijo y renovación**: un contrato `fixed` que pasa su `end_on` sin `ended_on` sigue activo y sigue generando cobros (en Jersey pasa a periódico mientras el inquilino siga). Sale en Renewals como «Fixed term ended», no se oculta. Acción **Renew** en el mismo contrato, que conserva la referencia de pago: nuevo `end_on` o paso a `periodic`, cambio de renta opcional, y régimen `2025` si la renovación es posterior al 15-abr-2026. Renew cierra «Renewal due». `ended_on` puede ser una fecha futura (salida prevista): los cobros paran en ella y la vivienda queda libre para dar de alta el siguiente contrato | Claude |
| R25 | **Pago marcado a mano y luego importado**: si una fila importada empareja con un contrato que ya tiene un pago `manual` del mismo importe, con fecha a ±7 días y sin huella, no se crea otro: ese pago recibe la huella de la fila (así reimportar tampoco duplica) y el resumen lo cuenta como «Already recorded by hand» | Claude |
| R26 | **Tipo de pago**: `kind` = `rent` (por defecto), `deposit` u `other`, editable. Solo `rent` cuenta para saldos, atrasos, liquidación y honorarios. `deposit` y `other` se ven en el contrato y en una línea aparte de la liquidación, sin honorarios | Claude |
| R27 | **Pasos de atraso**: el «siguiente paso» es el último ya debido que no está hecho; los anteriores no hace falta marcarlos. Los pasos van atados al cobro impagado más antiguo; si un pago parcial lo cubre, la secuencia empieza de nuevo para el siguiente | Claude |
| R28 | **Cambio de renta**: `effective_on` no puede ser anterior a hoy. Cambia el importe de los cobros con `due_on >= effective_on` aún no vencidos y no editados a mano; los ya vencidos no se tocan | Claude |
| R29 | **GST en la liquidación**: ajuste `gst_percent` en `app_settings` (por defecto 0 = Hampton no registrado). Si es mayor que 0, la liquidación añade la línea de GST sobre los honorarios | Claude; Luis confirma si Hampton está registrado en GST |
| R30 | **Asistente de renta y régimen**: el cálculo con tope RPI y la regla de 12 meses solo se aplican a contratos `2025`. En contratos `2011` el asistente muestra «Rent changes follow the tenancy agreement (2011 law). Check with a lawyer» y deja registrar el cambio sin calcular un tope | Claude, desde §7.3 |
| R21 | **Antes de cobrar rentas en una cuenta propia** hay que confirmar el registro en la JFSC por administrar fondos (arquitectura §7.3). No es código: va en ESTADO.md como requisito antes de usar la gestión completa en producción | Claude |

## 3. Datos (migración `0013_rentals.sql`)

Cada tabla con su comentario de una línea, `created_at`, `updated_at`, `updated_by` donde se edita, y bloqueo optimista por `updated_at` en las ediciones de formulario (como fichas y aplicantes).

- `landlords`:
  - `id`, `name` (1–120), `email`, `phone` (texto ≤ 120, email con forma de email);
  - `approval_limit INTEGER` (£, opcional);
  - `notes` (≤ 2.000), `archived_at`.
- `rentals`:
  - `id`, `landlord_id` (→ `landlords`, sin cascada), `address` (1–200), `parish` (la lista de parroquias que ya usa el panel);
  - `service` (`full`, `let_only`), `fee_percent REAL`, `has_gas INTEGER` (0, 1 o NULL = no se sabe, y entonces cuenta como que sí);
  - `notes`, `archived_at`.
- `tenancies`:
  - campos de R4, más `payment_ref TEXT UNIQUE`;
  - `CHECK` de tipos, régimen, día 1–28, fin posterior al inicio, y `end_on` obligatorio en `fixed`;
  - índice único parcial `(rental_id) WHERE ended_on IS NULL`.
- `rent_changes`: `tenancy_id`, `effective_on`, `rent`, `created_at`, `created_by`. Es la historia que usa R6 y R12.
- `charges`: `tenancy_id` (cascada), `due_on`, `amount` (peniques), `kind` (`rent`, `opening`), `edited` (0/1, R23/R28), `UNIQUE (tenancy_id, due_on, kind)`.
- `payments`:
  - `id`, `tenancy_id` (NULL = sin emparejar), `received_on`, `amount` (peniques > 0), `description` (≤ 300);
  - `kind` (`rent`, `deposit`, `other`, R26), `source` (`manual`, `import`), `import_hash TEXT UNIQUE`, `created_at`, `created_by`.
  - Índices `(tenancy_id, received_on)` y parcial `(received_on) WHERE tenancy_id IS NULL`.
- `arrears_steps`: `tenancy_id`, `charge_due_on`, `step` (claves de R8), `done_at`, `done_by`, `note`, `PRIMARY KEY (tenancy_id, charge_due_on, step)`.
- `compliance_items`: `rental_id` (cascada), `kind`, `done_on`, `expires_on`, `note`, `PRIMARY KEY (rental_id, kind)`.
- `repairs`: campos de R14, `rental_id`, `tenancy_id` opcional, índice parcial de las abiertas.
- `rental_events`: `id`, `rental_id`, `tenancy_id`, `at`, `actor`, `type`, `data` (JSON). Índice `(rental_id, at)`.
- `app_settings`: `key TEXT PRIMARY KEY`, `value TEXT` (JSON), `updated_at`, `updated_by`. Claves: `rpi` (`{percent, as_of}`), `gst_percent` (R29) y `csv_map:<huella de cabecera>` (`{date, amount, description, date_format}`).

## 4. Panel

Sigue `DESIGN.md`. Todo el texto en inglés (D19).

- **Barra**: Rentals después de Sales, con el contador de R16; menú Settings (R17).
- **Rentals** (`#/rentals`):
  - Arriba, «To do» en bloques:
    - Arrears: contrato, inquilino, deuda, días y siguiente paso con «Mark done»;
    - Compliance: vivienda, obligación, fecha y estado;
    - Renewals;
    - Repairs abiertas, las emergencias primero;
    - Unmatched payments: importe, fecha, descripción y «Assign» a un contrato.
  - Debajo, la lista de viviendas con búsqueda (dirección, propietario, inquilino, referencia) y filtros (servicio, con atraso, con vencimiento, archivadas). Columnas: dirección, propietario, servicio, inquilino, renta, saldo y marcas.
  - Botones: New landlord, New property, Import bank CSV, Statements.
- **Vivienda** (`#/rentals/<id>`):
  - datos y propietario;
  - contrato activo con su referencia de pago, saldo, cobros y pagos recientes, «Record payment», «Change rent» (con el asistente de R12), «Record notice» y «End tenancy»;
  - «New tenancy» cuando no hay contrato activo;
  - obligaciones con «Update»;
  - reparaciones con «New repair» y su ciclo;
  - contratos anteriores plegados;
  - historial.
- **Propietario** (`#/rentals/landlords/<id>`): sus datos (con barra Save/Discard) y sus viviendas.
- **Importar** (`#/rentals/import`), en tres pasos en la misma pantalla:
  1. elegir el archivo;
  2. columnas y formato de fecha, con 5 filas de muestra;
  3. resumen (emparejan, sin emparejar, ya importadas, ignoradas por ser cargos) y «Import».
- **Liquidación** (`#/rentals/statements?landlord=<id>&month=YYYY-MM`): selector de propietario `full` y mes. Al imprimir no salen la barra ni los botones.
- **Ajustes del RPI**: dentro del asistente de renta («Jersey RPI: 3.2% as of …», editable).

## 5. API (resumen; el plan fija las formas)

Todo bajo `/admin`, con sesión y comprobación de origen, validado en el servidor.

- `GET /admin/rentals` → to do, lista y totales. Un solo batch: genera los cobros que falten (R6) y lee.
- `GET/POST /admin/landlords`, `GET/PUT /admin/landlords/:id`, `POST /admin/landlords/:id/{archive,restore}`.
- `POST /admin/rentals`, `GET/PUT /admin/rentals/:id`, `POST /admin/rentals/:id/{archive,restore}`.
- `POST /admin/rentals/:id/tenancies`, `PUT /admin/tenancies/:id`, `POST /admin/tenancies/:id/{rent,renew,notice,end}`.
- `POST /admin/payments` (manual), `PUT /admin/payments/:id` (asignar un pago sin emparejar o corregirlo), `POST /admin/payments/import` (`{rows, dry_run}`).
- `PUT /admin/tenancies/:id/arrears/:due_on/:step`.
- `PUT /admin/rentals/:id/compliance/:kind`.
- `POST /admin/rentals/:id/repairs`, `PUT /admin/repairs/:id`.
- `GET /admin/statements?landlord=&month=`.
- `GET/PUT /admin/settings/rpi`, `GET/PUT /admin/settings/csv-map`.
- `GET /admin/notifications/counts` añade `rentals`.

## 6. Despliegue

Sale con la Entrega 2. Antes del push hay que aplicar en remoto la migración `0013_rentals.sql`, después de la `0012`. No hay datos que migrar; Hampton da de alta sus viviendas tras publicar. Antes de usar la gestión completa en producción hay que confirmar el registro en la JFSC (R21) y que un abogado revise los plazos de R10 y R13.

## 7. Ciclo y calidad

Como F3-C: plan con `superpowers:writing-plans`, subagentes Opus con esfuerzo alto, revisión por tarea, revisión final de todo, pruebas `node:test` (incluidas importación duplicada, FIFO, generación de cobros idempotente, cambio de renta y límites de mes en hora de Jersey) y `tests/e2e.cjs` ampliado. El recorrido del e2e:
1. propietario → vivienda → contrato;
2. pago manual → atraso → «Mark done»;
3. importar CSV → emparejado y sin emparejar → asignar;
4. obligación vencida → contador;
5. reparación con aprobación → liquidación impresa.

Capturas a 1280×800 y 390×844. ESTADO.md y la memoria se actualizan al cerrar.
