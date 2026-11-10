# BUS-21 · Plan para completar la primera investigación

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **I · Investigación**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Reutilizar directorio e investigar primera pasada faltante.

**Para ejecutar/completar:** Trabajo y aceptación real de primera pasada; cada fuente inaccesible registra pendiente/motivo sin impedir el resto. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V01, V02. Dependencias: Evidencia Property Directory existente y metodología/IDs conservados.

> Ejecución futura: usar `superpowers:executing-plans`, tarea por tarea. Este encargo solo prepara el plan; no inicia la investigación ni concede permiso de publicación.

**Objetivo:** completar únicamente las carencias demostradas de la primera cobertura de Property Directory.

**Arquitectura:** contrastar la SQLite, sus exportaciones y los informes existentes en lectura; recuperar primero la evidencia y abrir investigación solo para huecos justificados. Conservar IDs y procedencia.

**Herramientas:** SQLite en lectura, Python estándar, CSV y Markdown existentes; sin dependencias nuevas.

**Spec:** [decisiones y contrato compartido](../specs/2026-11-08-bus-21-23-property-directory-gaps-design.md).

## Condiciones y archivos

Planificación local de Lista 2 comprobada con `plan --list 2 --task BUS-21`: `reserved:false`, `buildAuthorized:false`. El relevo anterior en generación 3 se conserva como antecedente, no como requisito para escribir planes. La futura construcción exige resolver el estado de construcción propio, revisar alcance y dependencias y obtener reserva build según el contrato vigente. BUS-19 mantiene restricciones por fuente; el acceso total no es condición para comenzar.

Entradas: `Assets/deep-research-report.md`, `Assets/property-directory/{manifest.json,research-sources.json,property-directory.sqlite3,sources.csv,source-endpoints.csv,pending.csv,README.md}`, `research/round-02/`, `round-03/`, `round-04/` y referencias `Assets/jersey-market/`.

Entrada heredada ya recuperada: `handoff-hermes1/main` en `ed56694308803a6a73b25afb87600705d2a1b722`, con `docs/roadmap/work/BUS-21/{first-pass.md,sources.json}` y su spec/plan/ledger. Consultar el mapa de reutilización del spec. Reutilizar también los constructores Python y sus pruebas existentes; no levantar otra base o lector equivalente.

Salidas futuras propuestas, a reservar antes de escribir: `docs/roadmap/work/BUS-21/property-directory-gap-matrix.csv`, `property-directory-first-pass-report.md` y `property-directory-first-pass-pending.csv`. Los datos e informes con información privada permanecen fuera de Git público; publicar solo la síntesis saneada que se autorice. Si se actualiza Property Directory, reservar cada artefacto necesario; el alcance heredado no autoriza escribir `Assets/`.

## Reglas comunes

Aplicar el contrato de matriz, acceso y evidencia del spec. Mantener Jersey JE, las tres familias de fuentes, los timestamps reales y todas las referencias históricas. Ninguna extracción de inmuebles ni cambio de producto. DESIGN.md: sin cambios de interfaz, tokens visuales y Playwright no aplican; conservar seguridad, privacidad y ausencia de rastreo innecesario descritas en el spec.

## Paso 1 · Fijar la base y recuperar evidencia

- [ ] Localizar una copia autorizada de los materiales; registrar huellas, fecha, recuentos y último informe disponible.
- [x] Recuperar y contrastar el trabajo `ed566943` de Hermes, conservado en referencia local sin modificar el origen; mapa de correspondencias documentado en el spec.
- [ ] Antes de construir, integrar sus cambios revisados con el main vigente y comprobar los activos locales reutilizables. La recuperación en una referencia Git no se presenta como fusión ni publicación.
- [ ] Incorporar a la matriz las observaciones heredadas: Hampton, seis portales, categorías sociales y cinco leads ya identificados en Property Directory. Mantener sus fechas y éxitos/intentados distintos; no abrir búsquedas para redescubrir esas identidades.
- [ ] Para cada uno de los 67 campos `evidence_url` vacíos, revisar informe, endpoints y referencias documentales antes de abrir una búsqueda. Los 55 con evidencia en endpoints no se dan por resueltos sin evaluar su suficiencia.
- [ ] Crear una matriz por fuente/canal/requisito según el spec, incluyendo la evidencia heredada válida y su fecha original.

**Comprobación:** están representados los 138 IDs iniciales o sus sucesores explícitamente justificados; cada requisito tiene valoración y referencia o motivo de carencia. Un campo vacío no genera automáticamente una nueva investigación.

## Paso 2 · Investigar las carencias identificadas

- [ ] Separar las 14 fuentes sin URL: CBRE y Moore como antecedentes históricos; BCK Lettings, Choice Properties, De Vere y Marks como agencias por resolver; ocho grupos sociales como canales por verificar. Revisar AW Properties aparte, conservando la distinción entre web inactiva y empresa inactiva.
- [ ] Revisar las 36 etiquetas de acceso desconocido contra el material existente; conservar acceso desconocido cuando la evidencia no permita resolverlo.
- [ ] Evaluar los 78 candidatos sin endpoints `sale`/`rent`: un índice combinado puede servir para ambas operaciones; un directorio o servicio puede ser no aplicable. Buscar únicamente rutas que realmente falten.
- [ ] Completar agencias, portales/clasificados y canales sociales con las consultas necesarias para los huecos. No seguir una cuota de diez fuentes nuevas ni reabrir fuentes suficientemente cubiertas.
- [ ] Registrar en Meta lo comprobable públicamente; lo restringido recibe acción manual y condición de reintento. No simular actividad de grupos por aparecer en un directorio.

**Comprobación:** cada visita o consulta nueva responde a un `gap_reason`; cada resultado tiene URL, método, fecha y alcance. Las fuentes no accesibles no se contabilizan como vacías.

## Paso 3 · Entregar primera pasada y pendientes

- [ ] Agrupar duplicados conservando canales y referencias; dejar identidades dudosas para revisión humana.
- [ ] Redactar el informe con método, tandas realmente ejecutadas, evidencia reutilizada y diferencias respecto de las 138 fuentes iniciales.
- [ ] Dejar por cada pendiente motivo, último intento, responsable/rol, siguiente acción y condición de reintento.
- [ ] Solicitar revisión y aceptación de BUS-21 con sus entregables reales. Mantener pendiente la investigación si solo se entregaron planes.

**Salida para BUS-22:** catálogo fechado, matriz evaluada, informe, decisiones de deduplicación y cola pendiente. BUS-22 empieza después de la aceptación de esta investigación.

## Casos de revisión y validación

- Evidencia solo indexada: clasificar como tal, sin afirmar página abierta.
- Cita interna no resoluble: recuperar su fuente o dejar limitación explícita.
- Grupo restringido o fallo de acceso: pendiente manual, nunca cero anuncios.
- Antigua marca y varias webs del mismo operador: conservar alias/canales sin nuevas entidades ficticias.
- Índice compartido o servicio sin vacante: distinguir ruta reutilizable, no aplicable y disponibilidad sin acreditar.

Verificar IDs, enlaces y trazabilidad de la matriz. Si se modifica la base en un encargo autorizado, comprobar integridad, claves foráneas, restauración del SQL y coherencia de CSV en una copia de trabajo; no reconstruir sobre el original sin conservarlo. Si solo cambia investigación/documentación, no ejecutar suites de aplicación. Ante cambios de código autorizados, aplicar los checks de avanzar.
