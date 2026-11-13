# PUB-19 · recorrido construido con controles cerrados

El cálculo cuenta contactos distintos por celda y conserva alquiler y compra separados. Un borrador privado se revisa por páginas; la publicación requiere autorización externa vinculada al contenido y al ledger, y permite revocación. La página pública consume únicamente el snapshot autorizado. Las celdas pequeñas no se entregan, pero el umbral no sustituye la revisión de inferencias.

Las pruebas sintéticas incluyen D1 local para 20/21 contribuciones, carreras, rollback, revocación, recuperación y borrado; la interfaz aislada cubre paginación, cambio de cuenta, gate apagado, respuestas tardías, móvil y escritorio. Hubo revisión independiente y corrección de sus hallazgos. La limpieza de demanda tiene pase y reintentos separados del proceso de retención existente.

El esquema es propuesta fuera de migrations y los controles están apagados. No hay demanda ni autorización real publicadas. Antes de activar se requiere identidad y deduplicación verificadas, revisión competente de inferencias, autorización real, revisión de esquema y presupuesto D1, retención validada y decisión de activación. Un reloj caído impide garantizar purga puntual; la identidad durable de sesión no se acredita. El enlace de valoración depende de PUB-10.

La guarda detecta ausencia de objetos por nombre; no valida definiciones SQL ni claves foráneas. Las mutaciones y lectura pública revalidan presencia en su batch; las lecturas privadas aún comprueban por separado y no acreditan atomicidad ante cambios concurrentes del esquema. Revisar y resolver estos límites antes de activar.
