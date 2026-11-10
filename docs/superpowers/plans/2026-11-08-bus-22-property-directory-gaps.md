# BUS-22 · Plan para contrastar los huecos restantes

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **I · Investigación**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Contraste independiente sobre primera investigación aceptada.

**Para ejecutar/completar:** Comparaciones/omisiones/correcciones con evidencia posterior propia; no contar una ronda histórica sin demostrar correspondencia. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V01, V02. Dependencias: BUS-21 aceptado.

> Ejecución futura: usar `superpowers:executing-plans`. Documento preparado bajo la planificación de BUS-21; no existe nueva reserva ni investigación BUS-22 en este encargo.

**Objetivo:** aportar un segundo contraste independiente sobre omisiones y carencias del catálogo aceptado, aprovechando toda evidencia válida de Property Directory.

**Arquitectura:** recibir la primera pasada aceptada, contrastarla con las rondas históricas y buscar solo donde falte evidencia, independencia o cobertura; registrar diferencias explícitas.

**Herramientas:** SQLite en lectura, Python estándar, CSV y Markdown; sin dependencias nuevas.

**Spec:** [decisiones y contrato compartido](../specs/2026-11-08-bus-21-23-property-directory-gaps-design.md).

## Dependencia y archivos

Entrada obligatoria: aceptación real de BUS-21 (`research_accepted` vigente), su catálogo, matriz, informe y pendientes. Una aceptación del plan o una reserva cerrada en modo plan no satisface esa dependencia.

La planificación de este documento se comprobó con `plan --list 2 --task BUS-22`: sin reserva ni autorización de construir. El catálogo de entrada futuro debe combinar Property Directory con el registro de Hermes recuperado en `handoff-hermes1/main`, usando el mapa del spec; no iniciar otro directorio ni repetir la identificación de fuentes ya resueltas.

Consultar además `Assets/property-directory/research/round-02/`, `round-03/`, `round-04/` y sus manifests, informes y decisiones. Estas rondas conservan sus fechas originales; no se reasignan automáticamente a BUS-22.

Salidas futuras propuestas, a reservar antes de escribir: `docs/roadmap/work/BUS-22/property-directory-contrast-matrix.csv`, `property-directory-second-pass-report.md`, `property-directory-second-pass-diff.csv` y `property-directory-second-pass-pending.csv`. Conservar material privado fuera de Git público. Reservar explícitamente los artefactos del directorio si se actualizan.

## Reglas comunes

Aplicar el contrato de evidencia del spec: tres familias, Jersey JE, pendientes por fuente y conservación de IDs, canales y fechas. No recopilar inmuebles ni cambiar producto. No se requieren altas nuevas para aceptar la pasada. DESIGN.md: interfaz y Playwright no aplican; siguen las restricciones de seguridad y rendimiento del spec.

## Paso 1 · Acotar el contraste

- [ ] Comprobar la aceptación y fijar la huella del catálogo de entrada; conservar el catálogo previo como referencia.
- [ ] Relacionar la evidencia histórica con los requisitos del segundo contraste: método propio, búsquedas adicionales, correcciones y pendientes. Identificar exactamente qué no acredita.
- [ ] Crear una lista de dudas y omisiones por familia. Para cada categoría cubierta, registrar la referencia que permite reutilizarla sin visitar de nuevo sus fuentes.
- [ ] Incluir pendientes de identidad/marca, enlaces incompletos, cobertura social no acreditada y contradicciones de acceso. Un acceso restringido sin cambio se hereda con su condición de reintento.

**Comprobación:** cada investigación propuesta tiene una carencia o necesidad de independencia identificada. No se ha creado una repetición completa de las 138 fuentes.

## Paso 2 · Contraste independiente posterior

- [ ] Ejecutar después de la aceptación de BUS-21 las búsquedas adicionales necesarias, con fecha, consultas y método propios.
- [ ] Buscar omisiones en agencias, portales/clasificados y canales sociales según los huecos de cobertura, incluyendo particulares; la evidencia suficiente de una categoría se referencia sin repetirla.
- [ ] Contrastar cada candidato con IDs, nombres, alias, páginas canónicas, dominios, redirecciones y canales antes de darlo de alta.
- [ ] Registrar páginas abiertas, indexación y accesos fallidos por separado; no reutilizar una fecha anterior como comprobación nueva.

**Comprobación:** hay evidencia propia del contraste posterior y una conclusión por candidato; la lectura del informe de BUS-21 no se usa como segunda investigación.

## Paso 3 · Diferencias y entrega

- [ ] Entregar diferencias con campos `source_id`, `channel_url`, `change_type`, `before_reference`, `after_reference`, `reason`, `checked_at`, `pass_id`.
- [ ] Usar `change_type`: `added`, `corrected`, `duplicate_linked`, `discarded`, `pending`; conservar las fuentes previas y documentar relaciones, sin borrados silenciosos.
- [ ] Si no hay altas o correcciones, explicitar cero cambios y conservar las consultas y conclusiones que sostienen ese resultado.
- [ ] Actualizar matriz y pendientes; solicitar aceptación real de BUS-22. No abrir BUS-23 hasta obtenerla.

**Salida para BUS-23:** catálogo acumulado fechado, informe independiente, diff, matriz y pendientes con siguiente acción.

## Casos de revisión y validación

- Mismo dominio y canal nuevo: enlazar al registro apropiado, sin confundir página con empresa.
- Evidencia antigua correcta: reutilizar su contenido, sin alterar fecha ni fingir contraste posterior.
- Cero fuentes nuevas: aceptable si el método y las diferencias están documentados.
- Pendiente de acceso sin novedad: no insistir ni eliminarlo como si estuviera resuelto.
- Segunda pasada propuesta antes de aceptar BUS-21: detener ejecución y conservar solo el plan.

Comprobar comparación de catálogos por ID, conservación de referencias y correspondencia informe/diff/matriz. Cualquier actualización de SQLite se verifica con integridad, claves foráneas y restauración SQL en copia autorizada. Sin código ni interfaz, no corresponden suites de aplicación ni Playwright.
