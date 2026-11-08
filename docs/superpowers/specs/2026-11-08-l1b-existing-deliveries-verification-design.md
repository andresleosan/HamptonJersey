# REG-05 REG-07 REG-08 REG-11 REG-17 · Verificación de entregas existentes · diseño

Lista 1 · 8-nov-2026 · base `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1` comprobada con GitHub a19:30:56UTC. Solo planificación; sin reserva, construcción, migración, envío ni publicación.

**Estado:** Guía de cierre lista; no es construcción nueva. Publicación, migración y activación actuales de cada entrega se verificarán al ejecutarla.

## Propósito y evidencias históricas

Estas cinco tareas ya tienen código y documentos. **Esta guía de cierre/verificación no se cuenta como cinco planes nuevos de funcionalidad.** No reconstruirlas ni aplicar otra migración por una contradicción documental. Los estados parcial/bloqueado del catálogo no prueban ausencia de código, y un archivo en main no prueba migración o activación.

- REG05/07 son cobertura dentro de REG08residencial: documento y código de prioridades/edades/reglas ya presentes, migración0031. Catálogo pide publicar REG08/0031; la reconciliación lo describe como entrega pendiente. Verificar antes de declarar publicada.
- REG08ledger incluye pruebas locales y referencias de revisión. No repetirlas como ejecutadas hoy. BUS12comercial/EST16disponibilidad no se completan por0031.
- REG11taskJSON conserva falta de revisión/publicación0025; ESTADO/reconciliación y la entrega VIS18 posterior aportan evidencia histórica distinta. Clasificar fuente/fecha/SHA con exactitud; no declarar «no construido» por elJSONantiguo.
- REG17taskJSON dice0026pendiente; ESTADO215/entregaVIS18 informa publicación/migración. VIS17consumidor siguependiente y reservarpreferencias no confirma citas. No volveraaplicar0026.

Alternativas: reimplementar«lo parcial» duplicaría funciones; marcar todohecho por main perdería gates. Se propone una matriz de evidencia por código que separa integrado/local, migrado, publicado y activado. El estadoobservado sigue«sin nueva comprobación de producción» hastaejecutaresta guía.

## Artefacto propuesto de verificación

`docs/roadmap/work/REG-08/delivery-verification.md` reúne solo metadatos públicos y resultados sanitizados. Cada fila `DeliveryEvidenceV1={task_id:string,scope:string,code_sha:string|null,review_ref:string|null,local_checks:{command:string,result:'pass'|'fail'|'not_run',at:string}[],migration:{name:string,state:'applied'|'pending'|'unverified',observed_at:string|null},publication:{github_sha:string|null,pages_sha:string|null,jobs_sha:string|null,observed_at:string|null},activation:{state:'active'|'inactive'|'partial'|'unverified',scope:string,evidence_ref:string|null},remaining:string[]}`. Solo hashes/nombres/estados/fechas y enlaces de informe depurado, no correos/capturas de producción/llaves/respuestas deadmin. Ausencia de evidencia es unverified, no pendingaplicaciónniapplied.

Fuentes iniciales concretas: `docs/roadmap/tasks/REG-05.json`, REG07/08/11/17; `docs/roadmap/ESTADO.md`; ledgers `2026-11-07-reg-08-parking-requirements`, `2026-11-07-reg-11-registration`, entregaVIS18 y Git `log -- migrations/0025* migrations/0026* migrations/0031*`. Localizar nombre real exacto antesde usarlo; los prefijosno reservan una nuevamigración. Contrastar READMEdepublicaciónvigente/contratoavanzar.

## Secuencia de verificación y límites

1. Comprobar el repositorio canónico con el verificador oficial, registrar fecha y SHA y conservar el trabajo pendiente. Comparar ancestros sin modificar las entregas privadas de otras sesiones.
2. Localizar la evidencia de publicación y los despliegues correspondientes mediante las herramientas oficiales disponibles. Para migraciones de producción usar solo una consulta autorizada del entorno, por ejemplo `migrar-hampton ver` cuando exista en ese taller. No inventar una consulta con credenciales de otra sesión. Si falta acceso, registrar `unverified` y el responsable; no convertirlo en `pending` o `applied` por inferencia.
3. Reproducir la aceptación en una fixture local nueva con las migraciones y casos existentes: rango de dormitorios/baños para REG-05; mascotas yes/no/unsure para REG-07; parking imprescindible y prioridades/edades desconocidas para REG-08; modalidades, operaciones simultáneas y duplicados sin enumeración para REG-11; franjas semanales y CAS para REG-17. Un build no demuestra estas conductas.
4. La inspección pública de producción puede comprobar formularios y metadatos mediante lectura. No crear aplicantes, guardar viviendas, reservar visitas o enviar correo real como parte de esta verificación. Cualquier lectura autenticada debe usar el entorno autorizado y conservar solo evidencia depurada. No exportar contactos.
5. Cuando código, migración y publicación estén comprobados pero falte un consumidor, describir ese tramo. No clasificar la tarea como carente de código. Si aparece un defecto reproducible, registrar el caso y preparar su corrección dentro de un alcance build revisado; esta tanda solo autoriza planes.
6. Una publicación o migración nueva requiere revisión y autorización separada sobre un SHA concreto. Esta guía no las concede.

## Conciliación documental futura

Solo después de comprobar la evidencia, actualizar `docs/roadmap/tasks/<CODE>.json` y ESTADO con el estado por alcance, fecha y referencia, y regenerar los derivados mediante los scripts oficiales. No editar a mano HTML o catalog.json. No marcar REG-05/07 como completas por haber planificado BUS-12. Conservar los estados de las otras listas y las decisiones humanas. En esta entrega solo se guarda la guía, sin cambiar estados del producto.

## Aceptación

- DV01: cada afirmación de estado tiene fecha, fuente y SHA.
- DV02: pendiente, sin verificar, publicado y activado se distinguen.
- DV03: las contradicciones de REG-11/17 se resuelven por evidencia sin repetir migraciones.
- DV04: REG-05/07 se vinculan a REG-08 sin reimplementarlas.
- DV05: el artefacto no contiene credenciales, datos personales o capturas privadas.
- DV06: no se envía correo ni se modifica un dato real para comprobar la entrega.
- DV07: las regresiones locales pasan o se identifica el bloqueo real.
- DV08: el catálogo regenerado refleja la evidencia comprobada.

Son criterios de ejecución futura, no resultados obtenidos en esta tanda.

## Diseño y skills

**UI comprobada en código, frente a la cabecera desfasada de DESIGN.md:** `admin/src/styles.css`: ink `#151515`, paper `#ffffff`, mist `#f4f3f0`, line `#e3e0da`, stone `#6b665e`, bronze `#a56b3d`, bronze-dk `#86542d`, ok `#2f6b4f`, err `#a32020`, warn-bg `#fff6e5`, field-line `#8f8a82`. Tenor Sans/Georgia H1 26px/H2 19px, peso400; Montserrat/system-ui 14px/1.5, labels12px. Page1240px y padding24px16px120px; card24px/radio14px, field9px12px/radio10px, botones10px20px/radio999px. Reusar `.card/.field/.btn/.warn/.actionbar/.badge`, gaps12/16/24px, editor280px y apilado900px; piezas nuevas apilan760px. Botón hover bronze-dk, disabled opacity.45; foco2px bronze/offset2px y, si contraste medido lo exige, bronze-dk en el control tocado. Contraste texto≥4.5:1, foco/bordes≥3:1; estados con texto, labels nativos, aria-invalid/describedby y status/alert. Controles32px escritorio/44px móvil, teclado, 1280/390 y zoom200%, reduced motion. Copy/API inglés. ENERGY1/RHYTHM1/MOTION1; sin fuentes, imágenes, librerías o animaciones nuevas. React escapa texto; URLs por helpers existentes; sin PII/tokens en storage, URL, analytics o logs. No polling de ficha completa ni N+1; las solicitudes tardías no sobrescriben formularios.

avanzar delimita lista/reserva y base; brainstorming y grill-me distinguen hechos, propuestas y decisiones externas; writing-plans fija contratos y pruebas. Impeccable/product register ordena revisión y foco; redesign-existing-projects conserva los componentes existentes; taste-skill no aplica a una página nueva porque esta unidad amplía la ficha existente. Security-best-practices y frontend-security-coder acotan datos, permisos, CAS y salida escapada; antislop conserva identidad Hampton sin decoración y exige estados reales; web-performance-optimization acota cargas; ponytail reutiliza validación, matching y eventos, sin otro motor. No se instala ninguna skill o dependencia.
