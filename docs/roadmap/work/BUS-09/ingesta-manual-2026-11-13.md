# BUS-09 · Puente interno de observaciones manuales

Fecha: 13-nov-2026. Base local `f49617ac0e7caaaa34a93c54c92150182abd7ffb`. BUS-09 y BUS-06 continúan **parciales**. El trabajo queda preparado para revisión; no se ha conectado a una ruta, activado un gate, consultado una fuente real ni aplicado una migración remota.

## Alcance preparado

`server/market-observation-ingest.js` recibe una página estructurada ya suministrada por un consumidor interno; no es lector y no hace peticiones de red. `market-manual-contract.js` limita la página a diez registros y 128 KiB, rechaza campos ajenos al contrato, contenido prefabricado como `normalized`, getters y datos fuera de orden temporal, y no trunca entradas. Solo acepta URL HTTPS canónica sin credenciales, query, fragmento o escapes, dentro de hosts y segmentos de ruta expresamente guardados en la política; esta restricción conservadora puede dejar fuera URLs legítimas que requieran otra forma de evidencia.

La escritura usa `commitObservationPage` de BUS-06. Una guarda tipada comprueba dentro del mismo batch el actor registrado y su `added_at`, fuente/canal manual, versión de política, hosts/rutas, evidencia de acceso y retención, vigencia y manifiesto aceptado. La guarda existente añade lease, generación, cursor y estado del recorrido. Una repetición revalida actor y política antes de devolver el recibo. Un cambio de URL u operación para la misma clave de fuente/canal se rechaza sin sobrescribir historia; requiere revisión posterior y no queda registrado como conflicto separado.

Se conserva la URL, fecha declarada, términos monetarios originales, períodos, moneda, texto y referencias permitidas. El importe mensual redondeado mantiene su contrato previo y se añade la fracción exacta en unidades menores para evitar comparar un redondeo como si fuera el original. No se mezclan renta y prima; valores desconocidos siguen desconocidos. Reobservar los mismos hechos con otra fecha no genera por sí solo un evento de cambio material en este puente. Las observaciones son declaraciones de fuente, no disponibilidad confirmada ni decisiones humanas; no se escriben identidades, propiedades canónicas ni matches. El hash de origen corresponde al objeto estructurado canónico recibido, no acredita los bytes de una página de proveedor.

## Límites de seguridad e integración

El texto del actor **no autentica una sesión**. La comprobación de `admins` y `added_at` solo detecta ciertas revocaciones; una eliminación y recreación con la misma identidad y fecha puede eludirla. Falta una identidad/generación de sesión durable y una ruta autenticada, same-origin y autorizada que la suministre y revalide. El contrato original de `commitObservationPage` sigue disponible sin la guarda opcional para sus consumidores existentes; ninguna ruta futura debe tratarlo como una autorización ni omitir la guarda de este puente.

El método manual exige hosts/rutas explícitos aunque algunas políticas manuales actuales puedan tenerlos vacíos. Las páginas no pueden declararse completas: falta autoridad de alcance y evidencia independiente. No se fusionan claves distintas de una misma URL; BUS-10 y los contratos nominales de fuente deben resolver duplicados sin inferir identidad. Los textos de una observación privada pueden contener datos personales y requieren la política de retención aplicable; no se envían a logs ni a una proyección pública desde este tramo. No se han construido lectores Hampton, manuales o externos ni acreditado cobertura de proveedores.

## Pruebas y estado al detener

- La primera focal del puente falló por implementación ausente; después pasaron los casos de procedencia, importes y fracción exacta, política/actor revocados, identidad de fuente, replay, respuesta perdida, mutación del input, contradicciones y privacidad.
- La última batería puramente local terminó **53/53** con SQLite en memoria y exclusión explícita de Miniflare: `/tmp/hampton-bus09-sqlite-final.log`.
- Un filtro negativo de Node no excluyó dos pruebas D1 y provocó una ejecución no coordinada: **45/47**, con cierre de socket y `ECONNRESET`; log `/tmp/hampton-bus09-regression-first.log`. Se notificó y cesó. En el siguiente turno exclusivo pasó la repetición **19/19**, incluidas esas dos pruebas y la focal nueva D1 efímera de revocación y rollback; log `/tmp/hampton-bus09-d1-exclusive-first.log`.
- La última restricción de caracteres para `territory_evidence` se añadió después de la focal D1 y pasó en SQLite; **falta repetir D1 sobre el commit final**, además de la revisión independiente y la suite de integración completa. No hay cambios de interfaz; Playwright no aplica a este tramo.

La revisión independiente del puente desconectado no encontró fallos bloqueantes confirmados. Antes de conectar observaciones históricas, reconciliar `monthly_rent_exact`: incorporar esa clave a normalizaciones antiguas puede generar un evento de cambio sin cambio de hechos. El actor textual no autentica una sesión.

Integración conjunta del 13-nov: pasaron 2.050 pruebas JavaScript, 25 Python, build, `check:release`, `team:check`, `check:packages` y `git diff --check`. Playwright: no aplica a estos núcleos sin interfaz. Las funciones y esquemas propuestos siguen desactivados; no se verificó D1 remoto.

**Compatibilidad histórica:** la ausencia del campo derivado de renta exacta en observaciones antiguas ya no genera por sí sola un evento material; los términos originales siguen comparándose. La prueba reprodujo el evento falso antes de corregirlo y verifica también un cambio real de importe. Revisión independiente sin hallazgos; 50 pruebas focales y D1 local pasaron. El puente sigue sin ruta y la identidad de sesión durable sigue pendiente.

Integración posterior: 2.051 pruebas JavaScript y 25 Python aprobadas, además de build, release, catálogo y paquetes. Playwright: no aplica.
