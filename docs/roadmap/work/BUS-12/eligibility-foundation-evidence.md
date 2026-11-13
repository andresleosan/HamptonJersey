# BUS-12 · Fundamento local de elegibilidad

`isFullAvailableCandidate` es una base pura y provisional del predicado común de B01 y §5 del diseño de evaluación. No está conectada a rutas, inventario, SAP-02 ni al reloj BUS-17; estas pruebas sintéticas no acreditan integración, disponibilidad real ni publicación. No altera datos ni decide presentación, envío o aprobación.

## Contrato local de entrada

`current` identifica búsqueda, propiedad y operación (`candidateKey`), episodio activo, revisiones de criterios y candidato y versión de reglas. `evaluation`, `availability`, `staffDecision` y `clientDecision` deben aportar exactamente las mismas seis claves de contexto. Las revisiones son enteros seguros no negativos y las demás claves son cadenas no vacías. Todos los estados son explícitos; un registro ausente, una clave incompleta o distinta y un valor desconocido devuelven `false`. La decisión de empleado `pending` no exige aprobación; solo se admiten `pending` o `approved`, y para cliente `pending` o `accepted`. El productor debe acreditar que `pending` representa ausencia de rechazo o descarte en el episodio, no convertir datos desconocidos en `pending`.

La evaluación requiere `meets`, `mustsConfirmed: true`, `essentialsConfirmed: true`, condiciones del caso y legales `satisfied`, y `excluded: false`. La disponibilidad requiere `confirmed`, `current: true` y una referencia de evidencia no vacía. El llamador es responsable de comprobar la procedencia, alcance, vigencia y revocaciones de la evidencia; esta función no verifica referencias ni plazos. Los flags de condiciones deben resultar de evaluación real, no de score, publicación o aprobación. Una preferencia incumplida puede coexistir con `meets`. Ninguna clasificación o flag provisional sustituye BUS-13 ni valida reglas legales.

El booleano `false` engloba tanto inelegibilidad acreditada como información insuficiente. Un consumidor de ausencia **no puede** traducir cada `false` en ausencia conocida: debe comprobar por separado integridad y cobertura del conjunto actual, identidad, versiones y evidencia en un snapshot coherente; si no puede, debe mantener `fullAvailable` desconocido y no arrancar ni avanzar el reloj por inferencia. Debe revalidar datos y versiones en la transacción del efecto. Los campos y la igualdad estricta de revisiones son guardas propuestas, no un esquema aprobado ni un adaptador de productores existentes; integrar requiere reconciliar contratos reales, incluidos episodios sin decisión y política de vigencia, y ensayar concurrencia y revocaciones.

## Verificación

Fixtures sintéticos de `tests/server/search-eligibility.test.mjs`: clasificación, imprescindibles, esenciales, condición legal, exclusión, evidencia y disponibilidad, decisiones, versiones/contexto y datos incompletos, además de preferencia fallida. Se ejecuta con `node --test tests/server/search-eligibility.test.mjs`. La suite integrada, D1, navegador, conexiones reales y producción quedan fuera de este trabajo delimitado.

## Endurecimiento de entrada

La función solo acepta registros ordinarios (prototipo `Object.prototype` o nulo) y propiedades propias de datos para los campos requeridos; copia cada valor una vez y falla cerrado si su inspección produce una excepción. Rechaza arrays, funciones, propiedades heredadas y accessors. No existe detección general de proxies sofisticados: el adaptador debe entregar DTO fiables de un snapshot transaccional y revalidar antes de efectos. Las pruebas incluyen getters cambiantes y que lanzan, registros heredados y proxies revocados; no prueban la integridad de productores externos.

Integración del 13-nov: pasaron 2.105 pruebas JavaScript, 25 Python, build, release, catálogo y paquetes. Playwright: no aplica. El predicado sigue desconectado y requiere cobertura triestado, DTO fiable y snapshot coherente antes de utilizarse para concluir ausencia.
