# BUS-23 · Plan para completar y consolidar el directorio

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


**Preparación vigente · revisión 8-nov-2026:** **I · Investigación**. [Matriz por tarea](2026-11-10-tp05-construction-index.md) y [decisiones](2026-11-10-tp05-construction-index.md) prevalecen sobre propuestas anteriores que cambien en esta revisión. Tercer contraste y manifiesto consolidado revisable.

**Para ejecutar/completar:** Aceptar manifiesto/evidencias/cobertura y dejar pendientes reales; es investigación, no escribir otro archivo que diga consolidado. Decisiones: sin nueva decisión de producto identificada. Verificaciones: V01, V02. Dependencias: BUS-22 aceptado.

> Ejecución futura: usar `superpowers:executing-plans`. Este documento no reserva BUS-23 ni autoriza recopilar inmuebles.

**Objetivo:** cerrar las carencias investigables que queden tras BUS-22 y consolidar un directorio revisable con pendientes explícitos para el futuro inventario.

**Arquitectura:** tercera investigación secuencial acotada a huecos y omisiones; consolidación que conserva IDs, canales, fechas, relaciones y procedencia de todas las pasadas.

**Herramientas:** SQLite, Python estándar, CSV y Markdown existentes; sin dependencias nuevas.

**Spec:** [decisiones y contrato compartido](../specs/2026-11-08-bus-21-23-property-directory-gaps-design.md).

## Dependencia y archivos

Entrada obligatoria: aceptación real de BUS-22 (`research_accepted` vigente), catálogo acumulado, matrices, informes, diffs y pendientes de las dos pasadas precedentes. No sustituirla por la aprobación de sus planes.

La planificación local se comprobó con `plan --list 2 --task BUS-23`: sin reserva ni autorización de construir. Consolidar sobre la base y constructores existentes y la evidencia de Hermes recuperada, según el mapa del spec; no reconstruir la solución ni crear otra base paralela.

Salidas futuras propuestas, a reservar antes de escribir: `docs/roadmap/work/BUS-23/property-directory-third-pass-report.md`, `property-directory-third-pass-diff.csv`, `property-directory-final-matrix.csv` y `property-directory-inventory-handoff.csv`. Actualizar `Assets/property-directory/` solo con alcance explícito sobre sus archivos y una copia de trabajo conservada; no publicar material privado por estar mencionado en el plan.

## Reglas comunes

Aplicar el contrato del spec: tres investigaciones secuenciales con evidencia diferenciada, sin repasar fuentes cubiertas sin motivo. Mantener las restricciones BUS-19 y pendientes manuales sin bloquear fuentes utilizables. No recopilar inmuebles ni activar conectores. DESIGN.md: no cambia interfaz, por lo que paleta, tipografía, responsive y Playwright no aplican; conservar seguridad y ausencia de rastreo redundante.

## Paso 1 · Seleccionar las omisiones finales

- [ ] Comprobar la aceptación de BUS-22 y registrar huella y fecha de su catálogo.
- [ ] Revisar las tres familias y las diferencias acumuladas para seleccionar carencias resolubles, identidades dudosas y posibles omisiones.
- [ ] Relacionar cada carencia con evidencia histórica existente antes de abrir nuevas consultas; la cuarta ronda local puede aportar antecedentes sin transformarse en una tercera pasada posterior ficticia.
- [ ] Heredar sin repetir los pendientes cuyo acceso no cambió; dejar fecha del último intento y condición de reintento.

**Comprobación:** existe una cola justificada de investigación final y una referencia para cada parte ya cubierta.

## Paso 2 · Tercera investigación y contraste

- [ ] Ejecutar después de aceptar BUS-22 consultas propias para los huecos y las omisiones seleccionadas.
- [ ] Registrar método, consultas, fecha real, URLs y resultados; distinguir fuente pública, acceso restringido, indexación y ausencia de evidencia.
- [ ] Registrar diferencias con el mismo contrato `source_id`, `channel_url`, `change_type`, referencias anterior/posterior, motivo, fecha y pasada del plan BUS-22.
- [ ] Conservar cero incorporaciones cuando sea el resultado sustentado, sin fabricar nuevas fuentes para alcanzar un objetivo numérico.

**Comprobación:** el informe acredita la tercera revisión independiente y secuencial, y cada resultado puede rastrearse a una consulta o evidencia previa reutilizada.

## Paso 3 · Consolidar y preparar el relevo a inventario

- [ ] Consolidar por IDs y relaciones explícitas, conservando canales distintos, alias, antecedentes y procedencia de cada afirmación.
- [ ] Clasificar fuentes de publicación, directorios de descubrimiento, referencias históricas, fuentes excluidas y canales con gestión manual pendiente.
- [ ] Preparar por fuente/canal: ID, URL de entrada, función, operaciones acreditadas, territorio, método de acceso, política vigente, evidencia/fecha, última comprobación correcta conocida y próxima acción.
- [ ] No inventar una fecha de éxito cuando solo hay intentos fallidos; mantenerla desconocida si no existe evidencia.
- [ ] Entregar catálogo, matriz final, tres informes con sus diferencias y cola de inventario/manuales. Solicitar aceptación de BUS-23 con la evidencia real.

**Salida para BUS-06:** directorio consolidado y rutas utilizables o pendientes explícitos. BUS-06 conserva además sus requisitos de acceso BUS-19 e integración AGE-04; este plan no los da por satisfechos.

## Casos de revisión y validación

- Varias publicaciones del mismo operador: conservar canales sin inventar entidades ni inmuebles adicionales.
- Web inactiva y sucesor conocido: preservar historia y relación; no borrar silenciosamente IDs.
- Oferta corporativa o de servicios: no marcarla como inventario disponible sin evidencia.
- Fuente restringida: entrega manual, no cero anuncios ni eliminación del catálogo.
- Investigación o aceptación faltante: mantener pendiente la secuencia y no certificar tres pasadas por el número de archivos.

Verificar conservación de IDs/relaciones, claves foráneas, integridad SQLite y reconstrucción SQL si se actualiza el directorio. Contrastar los CSV y los recuentos con el manifest; no exigir nuevos grupos completos de diez ni perder el remanente por no completar otro grupo. Confirmar que las tablas de inmuebles siguen intactas y que no se afirma inventario recopilado. Sin código o interfaz no corresponden suites de aplicación ni Playwright.
