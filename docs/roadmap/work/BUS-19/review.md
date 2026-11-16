# BUS-19 · Revisión documental por canal

**Estado: avance local parcial, sin política ejecutable, permiso concedido ni conector activado.** La entrada es BUS-23 aceptada localmente el 13-nov-2026; coinciden las huellas de su propuesta y trece entregables. Los eventos y el tablero remotos no se han actualizado.

## Resultado

El [registro documental](access-decisions.json) y la [cola filtrable](access-review-queue.csv) trasladan los **237 registros fuente/ruta de 141 IDs** del relevo aceptado, con referencia a cada fila de origen, restricción heredada, evidencia conocida y siguiente acción. Sus categorías son de investigación: **no son `SourceAccessDecision`**, no están conectadas al producto y ninguna equivale a `allowed` o `approved`. Las 14 filas sin URL se mantienen como tales: ocho sociales, dos históricas y cuatro que esperan identificación del canal.

| Estado de revisión documental | Registros |
|---|---:|
| Condiciones y método por revisar | 155 |
| Solo referencia | 34 |
| Restricción específica heredada por revisar | 11 |
| Canal social fuera de etapa / revisión manual futura | 10 |
| Conector Places o Properties aplazado | 6 |
| Identificar URL | 4 |
| Homely excluida por el proyecto | 3 |
| Rightmove: automatización restringida | 3 |
| OnTheMarket: revisar automatización y reutilización | 3 |
| Identidad y derechos de propuesta por revisar | 3 |
| Otra revisión manual pendiente | 3 |
| Referencia histórica | 2 |

Los recuentos son **filas de fuente/ruta**, no fuentes independientes ni permisos. Se conservan los 141 IDs, incluidos tres que siguen siendo propuestas sujetas a cotejo de alias. Las referencias previas a endpoints no se han convertido en URL si estas faltan. Las acciones específicas y condiciones originales permanecen junto a cada fila.

## Condiciones y límites observados

Las [condiciones de Rightmove](https://www.rightmove.co.uk/c/terms-of-use/), §5.2 y §5.5, enumeran el uso de bots y otras formas automatizadas entre las restricciones y contemplan consentimiento escrito para determinadas formas de acceso. No se asume que un eventual permiso cubra métodos o usos distintos. Las [condiciones de OnTheMarket](https://www.onthemarket.com/terms/), §3.3 y §2.2, distinguen determinadas condiciones de identificación y robots para programas automatizados, y restringen el almacenamiento o la republicación sin consentimiento escrito. Ninguna de estas observaciones habilita un lector: faltan método, alcance, derechos y comprobación de robots aplicables.

Las páginas consultadas de Gaudin y Jersey Insight tratan respectivamente la relación agencia/cliente y la publicidad/listados; no prueban una licencia de lectura para terceros. La búsqueda parcial de Broadlands no resuelve el contrato aplicable. La página de condiciones de Propertyskipper devolvió `Cache miss` y no se reintentó; las consultas sobre JEP no identificaron condiciones suficientes. El [registro de evidencia](evidencia-condiciones-2026-11-13.md) distingue páginas recuperadas, consulta parcial, búsqueda insuficiente y fallo; los once registros asociados a páginas recuperadas representan cuatro documentos, no once permisos.

Homely permanece excluida por decisión del proyecto. Places.je y Properties.je siguen fuera de la etapa de conectores y conservan sus requisitos de clave o permiso escrito; Meta tampoco se activa. Las seis fuentes con restricciones específicas heredadas mantienen sus once registros destacados, sin borrar la evidencia previa. Una respuesta HTTP, una mención de API, una fuente sin URL o un fallo no equivalen a permiso, éxito actual o cero anuncios.

## Dependencia de implementación

El [complemento de BUS-19](https://github.com/andresleosan/HamptonJersey/blob/main/docs/superpowers/plans/2026-11-09-bus-19-per-source-access-decisions-closure.md) exige integrar primero `BUS-06:source-schema` y mantener una sola autoridad de permisos. Se buscaron en la rama `codex/hampton-design-pass` y en la copia local más reciente `a3cfc90` los contratos y tablas previstas de mercado sin encontrar `market_sources`, `market_source_policies`, `market_observations` o los servicios nominales del plan. Esta comprobación no sustituye una consulta del estado de producción ni garantiza que otra rama carezca de ellos.

Por ello se preparó la revisión documental independiente sin crear una segunda base, persistencia, API o pantalla. Para cerrar BUS-19 faltan el esquema y la autoridad de BUS-06, los controles de versión y canal en lectura/escritura, la interfaz protegida, las pruebas correspondientes y las evidencias de permiso reales por método. La revisión de fuentes y la construcción son entregas distintas; no hay que aprobar todas las fuentes para usar alguna que esté debidamente autorizada y tenga controles efectivos.

## Método e incertidumbre

Se fijó el [protocolo](protocolo-2026-11-13.md) antes de consultar y se conservaron las [consultas](consultas-2026-11-13.md), resultados e intentos fallidos. Los términos del propio operador se usan para describir su texto, no como dictamen general; se buscaron restricciones de automatización, conservación y reutilización. Las páginas de condiciones se consultaron para cuatro fuentes; no se revisaron robots por agente/ruta, ni inventarios, anuncios, Meta, cuentas o datos de particulares. Los fragmentos de anuncios devueltos por el índice no se guardaron ni se usaron.

El registro no concluye ausencia de restricciones cuando una búsqueda o apertura falla. La incertidumbre restante está en vigencia y ámbito de cada texto, identidad de alias, URL faltantes, licencia del método, retención, términos de terceros y disponibilidad real de controles. El [manifiesto](manifest-revision.json) identifica las huellas de entrada y salida.

## Comprobaciones y siguiente paso

Se verificaron las huellas aceptadas, la correspondencia de las 237 claves fuente/ruta, los 141 IDs, las restricciones heredadas y la igualdad entre JSON y CSV. No se creó ninguna decisión ejecutable ni se habilitó un lector. **Playwright: no aplica**; no cambian interfaz ni producto. El checklist de GitHub continúa en **60/221 (27,1 %)** y el tablero desplegado no se ha comprobado.

Para continuar, **BUS-06 · esquema de fuentes** debe prepararse sobre una base reconciliada y con una sola autoridad; la tarea completa también conserva su dependencia de integración de AGE-04. Luego BUS-19 puede persistir y aplicar decisiones por canal, con pruebas y revisión de fuente. No se solicita permiso para desplegar o migrar con este avance documental.
