# BUS-21–23 · Completar las carencias de Property Directory

**Alcance vigente8-nov:** [decisiones posteriores de Luis](../../roadmap/2026-11-09-list2-published-scope.md) y [preparación por tarea](../plans/2026-11-09-list2-build-ready-github.md) sustituyen propuestas incompatibles de este diseño: conexión centralPro/Hermes, no planes individuales, Meta fuera, WhatsApp/conectores/local posteriores y enlace privado hasta revocación. No asumir habilitación del proveedor ni ejecutar ramas históricas excluidas.

Fecha: 8-nov-2026. Estado: alcance acordado con Luis; planes preparados, investigaciones sin ejecutar.

## Decisiones y alcance autorizado

Luis pide un plan para cada tarea que investigue solamente lo que falte de Property Directory. Confirma que esta sesión trabaja únicamente en planificación y que la construcción posterior debe ampliar lo ya creado. El relevo histórico desde Hermes 1 se aceptó en generación 3. La política publicada después permite planificación local sin reservas: en esta actualización no se crean ni renuevan reservas ni se concede permiso de construcción.

Se conservan los requisitos vigentes: Jersey, Islas del Canal (JE), agencias y sus webs, portales/clasificados, páginas de Facebook, Marketplace y grupos, incluidos particulares. BUS-22 espera la aceptación de BUS-21 y BUS-23 la de BUS-22. Preparar sus planes no reserva ni ejecuta esas dos tareas.

## Enfoque elegido

Se consideraron repetir las investigaciones completas, aceptar automáticamente las cuatro rondas locales o contrastar sus evidencias y completar carencias. Luis elige la tercera opción. Repetir todo desperdicia trabajo; el número de rondas no acredita por sí solo cobertura ni independencia.

El primer paso es recuperar evidencia, no navegar de nuevo. Una fuente ya cubierta no se vuelve a investigar sin una razón registrada: enlace roto, contradicción, cobertura insuficiente, evidencia no recuperable o necesidad de contraste independiente pendiente. No se imponen cuotas de fuentes nuevas.

## Base comprobada en lectura

- Main canónico actualizado: `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`, comprobado el 8-nov-2026 mediante `scripts/check-avanzar.mjs`. Se incorporaron los tres commits posteriores a `6d2f779` por avance directo, verificando que los seis documentos locales conservaron sus huellas. HEAD coincide con el remoto observado; la copia conserva los borradores sin commit.
- Material local: `Assets/deep-research-report.md`, `Assets/jersey-market/` y `Assets/property-directory/`; estos materiales no aparecen en el clon limpio de main. El ejecutor debe localizar una copia autorizada, sin copiar credenciales ni datos privados al repositorio público.
- Manifest del directorio: generado `2026-11-07T23:42:32Z`; 138 fuentes, 124 páginas canónicas, 12 grupos completos de diez y 0 inmuebles, anuncios u observaciones.
- Huella de la SQLite leída: `a09ea489a46566db4a786505e979f066fff4e9b1b4beb781d804e7a3b0c683af`. Si cambia, recalcular el diagnóstico conservando el anterior.
- 45 fuentes tienen investigación complementaria estructurada; las 93 restantes no deben presentarse como recién verificadas.
- 14 fuentes sin URL canónica: dos antecedentes históricos, cuatro agencias y ocho grupos sociales. La web inactiva AW Properties es un caso distinto.
- 36 accesos desconocidos; 10 canales restringidos. Son dimensiones distintas, no categorías para sumar.
- 67 registros sin `sources.evidence_url`: todos tienen fila del informe original y 55 tienen evidencia en endpoints. No equivalen a 67 investigaciones inexistentes; evaluar suficiencia y recuperar enlaces verificables.
- 78 fuentes carecen de endpoint estructurado `sale`/`rent` según un filtro inicial que excluye referencias, fuentes excluidas e históricas/inactivas. No son 78 fallos confirmados: puede haber índices compartidos o servicios que no correspondan a venta/alquiler.
- Las rondas 2–4 no mencionan expresamente Facebook/Marketplace en sus informes; comprobar su cobertura en los demás materiales antes de concluir que falta.

## Trabajo anterior recuperado y contrato de reutilización

El historial de Hermes 1 se recuperó mediante un bundle Git verificado, sin copiar bases ni credenciales y sin modificar su HEAD. El commit completo `ed56694308803a6a73b25afb87600705d2a1b722` está disponible en esta copia bajo `refs/remotes/handoff-hermes1/main`. La referencia conserva la historia y los 11 archivos de su entrega, no solo una descripción del relevo. No está fusionada en main: conservar esa distinción hasta revisar e integrar sus diferencias documentales.

Consultar los archivos originales sin reconstruirlos:

```sh
git show handoff-hermes1/main:docs/roadmap/work/BUS-21/first-pass.md
git show handoff-hermes1/main:docs/roadmap/work/BUS-21/sources.json
git show handoff-hermes1/main:docs/superpowers/plans/2026-11-08-bus-21-sources-first-pass-ledger.md
```

El registro heredado aporta 11 grupos: Hampton propio comprobado, seis portales pendientes y cuatro categorías sociales pendientes. Conserva nueve URLs propias comprobadas, cero URLs externas verificadas, dos enlaces sociales descubiertos y cinco leads históricos. Su `CONNECT 403` describe la red del taller en esa fecha, no invalida la evidencia anterior de Property Directory.

| Registro de Hermes | Registro ya existente en Property Directory | Tratamiento futuro |
|---|---|---|
| Hampton Estates | `src-hampton-estates` | Conservar URLs y comprobaciones fechadas como observaciones del mismo registro |
| Places.je | `src-places-je` | Reutilizar fuente y canales; añadir intentos del taller sin degradar éxitos anteriores |
| Homely.je | `src-homely-je` | Conservar exclusión de extracción y procedencia |
| Properties.je | `src-properties-je` | Conservar permiso escrito y evidencia de acceso por separado |
| JEP property | `src-jersey-evening-post-property` | Reutilizar la fuente y su URL específica; la raíz genérica intentada no la sustituye |
| OnTheMarket | `src-onthemarket-jersey` | Reutilizar identidad y filtro Jersey |
| Rightmove | `src-rightmove-jersey` | Reutilizar identidad y filtro Jersey |
| Facebook Marketplace | `src-facebook-marketplace-jersey` | Asociar el intento genérico como antecedente; no acredita acceso al filtro local |
| Facebook pages / groups / private sellers | Cobertura de los canales sociales del directorio | Son categorías de cobertura, no tres nuevas entidades |
| Columbia Estates | `src-columbia-estates` | El lead ya está identificado en la base: contrastar evidencia, no redescubrirlo |
| Red Properties | `src-red-properties` | Mismo tratamiento |
| Prestige Properties | `src-prestige-properties` | Mismo tratamiento |
| Slomans | `src-slomans` | Mismo tratamiento |
| Bull and Company | `src-bull-co` | Resolver por identidad/alias conservando el ID existente |

La correspondencia anterior es documental: las filas originales no se actualizaron. Conservar `attemptedAt` y `lastSuccessAt` de los canales de Hermes como intento/éxito por canal. Mapear `rootUrl`, `saleUrl`, `rentUrl`, `verification`, `access`, `evidence`, `policy`, `extraction` y `pending` a las columnas existentes de la matriz; no crear otra base ni otro esquema para reproducirlas. No sumar los 11 grupos a las 138 fuentes: se solapan y algunos son categorías.

Activos que la construcción futura debe reutilizar: `scripts/property_directory.py`, `scripts/jersey_market.py`, sus pruebas `tests/test_property_directory.py` y `tests/test_jersey_market.py`, el esquema `Assets/jersey-market/schema.sql` y los datos e informes originales. Están en la copia local que conserva Property Directory; no se afirma que formen parte de main ni que se hayan ejecutado sus pruebas en este encargo. La incorporación futura debe preservar su procedencia, revisar privacidad y reservar alcance; no reimplementarlos desde cero.

Antes de construir: integrar de forma revisada la historia de Hermes con el main vigente, incorporar los activos reutilizables permitidos y verificar la matriz combinada. No sustituir main por la rama antigua ni copiar retrospectivamente sus estados al catálogo como si acreditaran investigación aceptada. Esta integración es un prerrequisito explícito de construcción, no una investigación adicional ni autorización de producto.

## Contrato común de evidencia y pendientes

La matriz por fuente y canal usa: `task_id`, `source_id`, `channel_url`, `family`, `requirement`, `existing_reference`, `checked_at`, `evidence_method`, `assessment`, `gap_reason`, `next_action`, `owner`, `pass_id`.

`family`: `agency`, `portal_classified`, `social`. `assessment`: `covered`, `research_needed`, `manual_pending`, `historical`, `not_applicable`. Cada clasificación tiene justificación; `covered` requiere evidencia identificable con fecha y alcance. Fecha desconocida se conserva como desconocida. Los tokens de citas del informe no son enlaces públicos resolubles: recuperar su fuente cuando sea necesario o registrar la limitación.

Una investigación nueva registra consultas, momento real, URLs revisadas, método, resultado y diferencia respecto de la referencia anterior. Distinguir página abierta de indexación, directorio de publicación, cartera corporativa de oferta disponible y oferta de servicios de arrendamiento. La ausencia de resultados no prueba ausencia de fuente ni de anuncios.

Un pendiente requiere el motivo, último intento, próxima acción, responsable o rol y condición de reintento. No repetir automáticamente una fuente restringida sin cambio de acceso, nueva pista o necesidad documentada. Una evidencia suficiente puede justificar no revisitar un canal en una pasada posterior.

## Secuencia y aceptación

BUS-21 produce primera cobertura aceptable y carencias explícitas. BUS-22 aporta contraste independiente posterior sobre huecos y omisiones; BUS-23 hace la tercera revisión posterior y consolida. Cero altas es válido con método y resultados documentados.

Las rondas históricas se aprovechan con sus fechas reales como antecedentes. No renombrarlas para fingir que ocurrieron después de una aceptación actual. La matriz debe justificar qué requisito ya cumplen; si falta secuencia o contraste independiente, investigar únicamente ese hueco después de la aceptación precedente.

La aceptación de investigación se registra con `research_accepted` por la identidad autorizada. El cierre de una reserva en modo plan solo acredita planificación; no completa la investigación ni desbloquea por sí mismo BUS-22/23.

## Límites técnicos y de publicación

No se recopilan inmuebles, descargan fotografías, construyen scrapers, cambian esquemas, migran bases, instalan herramientas ni publican artefactos. La base y los informes originales permanecen intactos durante este encargo. La futura actualización de datos necesitará alcance y modo autorizados; el alcance documental actual no la permite.

Conservar IDs, alias, canales y relaciones; una URL o dirección parecida no fusiona entidades automáticamente. Las fuentes históricas y las excluidas se conservan con su clasificación. Properties.je mantiene permiso escrito, Places su requisito de clave cuando corresponda, Homely la exclusión y Meta las restricciones; cualquier revisión posterior debe respetar BUS-19. Un bloqueo deja trabajo manual y no paraliza otras fuentes utilizables. No contactar, solicitar altas ni usar cuentas autenticadas por iniciativa propia.

El commit de Hermes 1 `ed566943` y archivos locales permanecen intactos en origen; su historia está recuperada y su contenido documental contrastado en este destino. Su fusión en main sigue pendiente y debe preceder a la construcción. Las pruebas declaradas por Hermes son históricas: no se atribuyen como comprobaciones ejecutadas aquí.

## DESIGN.md y skills

Superficie afectada: Markdown de planificación. No cambia web, panel, API ni mensajes visibles. Paleta, tipografías, tamaños, espaciado, componentes, responsive, foco y zoom de DESIGN.md no aplican. Se conserva D19 para una eventual interfaz futura (inglés), sin crear interfaz en este encargo. No se adoptan propuestas visuales del documento.

Seguridad: evidencia sin credenciales ni datos personales en Git público; solo enlaces HTTP(S) para futura representación, sin incrustar HTML recuperado. Rendimiento: reutilizar evidencia y consultar SQLite local en lectura; sin rastreo masivo ni bucles de reintento. Verificación: diff documental y ausencia de cambios en fuentes de datos; Playwright no aplica.

`grill-me` aclaró el alcance y la reutilización; `writing-plans` separa entradas, acciones y aceptación; `ponytail` conserva SQLite/CSV/Markdown y evita herramientas nuevas. Impeccable, taste-skill, redesign, frontend-security-coder y web-performance-optimization no requieren intervención porque no cambia producto ni interfaz. Las restricciones pertinentes de seguridad se recogen arriba; no se ejecuta auditoría de aplicación. Antislop se concreta en pasos verificables, sin tareas genéricas ni investigación duplicada; no se instala ni activa automatización adicional.

## Entregas

- [Plan BUS-21](../plans/2026-11-09-list2-build-ready-github.md).
- [Plan BUS-22](../plans/2026-11-09-list2-build-ready-github.md).
- [Plan BUS-23](../plans/2026-11-09-list2-build-ready-github.md).
- [Ledger](../plans/2026-11-09-list2-build-ready-github.md).
