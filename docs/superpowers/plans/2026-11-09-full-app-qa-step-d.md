# QA completa · preparación del paso D

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para esta preparación local; no ejecutar importaciones remotas sin el sí específico posterior.

**Goal:** Entregar SQL revisable y verificable para `hampton-app-qa`, con esquema final, datos exclusivamente ficticios y `qa-agent@example.test`.

**Architecture:** Recuperar solo el DDL final de las 37 migraciones mediante SQLite en memoria; descartar todas sus filas. Generar una semilla QA nueva, metadatos de migraciones y testigo propio, con rechazo previo a cualquier escritura si la base no está vacía. Mantener SQL UTF-8/LF y manifestar sus huellas y el destino exacto.

**Tech Stack:** Python estándar/sqlite3, unittest y Wrangler 4.148.0 únicamente para importación local y preflight remoto de lectura.

**Spec:** `docs/superpowers/specs/2026-11-09-full-app-qa-design.md`.

## Autorización y límites

Al iniciar la preparación, el dueño pidió mostrar huella/destino antes de
importar. Posteriormente autorizó importar exactamente el SQL SHA-256
`5024c26b87f676c28efb01a3fa7d111afd2bf790b6d6da169e38a92d9c8d6e95`
en `hampton-app-qa` (`53bc4af9-7250-44fe-8f90-6e415fda1034`). Este permiso se
ejecutó una vez. No autorizó subir medios, desplegar, ejecutar E–F ni producción.

- D1 prevista: `hampton-app-qa`, UUID `53bc4af9-7250-44fe-8f90-6e415fda1034`.
- Binding de app ya configurado: `DB` solo en Production de `hamptonjersey-qa`.
- Un TOML de importación exclusivo usará `APP_QA_DB` con ese UUID; no es una ACL.
- No usar la D1 empresarial, la QA de History ni nombres ambiguos de Wrangler.
- No leer secretos ni filas del negocio. No copiar la fixture general ni las
  identidades de las migraciones. Se recupera DDL, nunca filas de origen.
- Si una futura importación falla o queda incierta, leer el estado remoto antes
  de decidir cualquier reintento. El paquete es de inicialización, no idempotente.

## Review Focus

1. Esquema incompleto o triggers perdidos: comparar cada objeto con las migraciones.
2. Semillas reales o destinatarios externos: exigir `.test`, nombres QA y teléfonos nulos.
3. Destino equivocado/no vacío: preflight por UUID y SELECT inicial que falle antes de DDL/DML.
4. Fixtures sin relaciones o fechas obsoletas: integridad referencial y ancla temporal registrada al importar.
5. Hash alterado por CRLF/regen: bytes LF, manifiesto y regeneración reproducible.

## Archivos

- `docs/qa/full-app/build.py`: genera SQL/manifiesto/medios ficticios de forma local.
- `docs/qa/full-app/setup.sql`: artefacto final revisable, sin secretos.
- `docs/qa/full-app/manifest.json`: destino, procedencia, huellas, conteos y límites.
- `docs/qa/full-app/import-wrangler.toml`: único binding `APP_QA_DB`, sin destino empresarial.
- `docs/qa/full-app/README.md`: verificación y autorización pendiente, sin comandos de escritura remota ejecutados.
- `docs/qa/full-app/media/`: imágenes de prueba generadas, solo locales.
- `tests/test_full_app_qa_bundle.py`: pruebas de privacidad, guardia, esquema, integridad y relaciones.
- `.gitattributes`: fijar LF para SQL/manifiesto del paquete QA completo.

## Tareas

- [x] Escribir y ejecutar primero las pruebas del paquete ausente (RED).
- [x] Construir esquema/semilla y superar las pruebas locales (GREEN).
- [x] Importar el mismo SQL únicamente en D1 local efímera y comprobar resultados.
- [x] Revisar independientemente el paquete y resolver hallazgos materiales.
- [x] Revalidar solo en lectura cuenta, UUID y esquema vacío remoto.
- [x] Registrar huella exacta, destino, evidencia y autorización de importación pendiente.

## Registro

Preparación iniciada sobre HEAD `80ad03df7e095750f455aa4aa668573e9aac5db4`, con
los documentos A–C locales existentes. Aún no hay importación remota de D.

Preparación terminada el 2026-11-10 UTC. RED inicial: 9 pruebas fallaron por
ausencia del paquete. GREEN final: 10/10, incluida regresión RED/GREEN del
contrato monetario/de cobro de alquileres hallado por revisión independiente.
La semilla usa origen de consentimiento válido `web`, exclusivamente ficticio.
Wrangler local importó el SQL final; los 59 conteos coinciden y no hay claves
foráneas rotas. Segundo intento rechazado sin cambios de conteo.

La comprobación local inicial de conteos incluyó por error `_cf_METADATA`, tabla
interna de Miniflare. Se corrigió el verificador para contar solo las tablas
del manifiesto. Otra consulta de verificación superó el límite de términos UNION
de D1 local; se sustituyó por subconsultas escalares. Esos chequeos fallidos
no hicieron escrituras remotas ni cambiaron el paquete SQL.

Preflight remoto de lectura: cuenta única y tres D1 contrastadas; resolución
de `APP_QA_DB` al UUID previsto y cero objetos de aplicación, solo `_cf_KV`.
GitHub main y HEAD coinciden. Sin cambios de archivos empresariales existentes.

SQL final: 146527 bytes, SHA-256
`5024c26b87f676c28efb01a3fa7d111afd2bf790b6d6da169e38a92d9c8d6e95`.
El usuario y los tres medios ficticios solo están preparados localmente.
**Importación y subida R2 pendientes de permisos específicos; E–F sin ejecutar.**

### Continuación: importación SQL expresamente autorizada

El registro anterior corresponde a la preparación. Tras el sí específico en
chat, se repitieron huellas SQL/manifiesto, cuenta única por tres recursos D1
conocidos, resolución exacta por UUID y vacío remoto; todo pasó. SQL y TOML
se copiaron byte a byte a un directorio temporal sin configuración empresarial.
Se ejecutó una sola importación remota con Wrangler 4.148.0; código de salida 0.
El SQL y manifiesto de propuesta permanecen inalterados.

El verificador inicial no confirmó el resumen CLI y marcó `AssertionError`.
Se detuvo sin reintentar y se inspeccionó el estado remoto exclusivamente en
lectura. Esa verificación independiente pasó: 156 objetos DDL idénticos, los
conteos de las 59 tablas, 37 migraciones, guard propio y único admin QA.
Claves foráneas sin violaciones, correo deshabilitado, outbound pausado y cero
envíos/jobs activos. No se afirma un formato concreto del resumen no conservado;
la prueba de éxito es la lectura completa del estado esperado en el UUID QA.

Evidencia: `docs/qa/full-app/import-receipt.json` e `import-readback.json`.
Ahora existe `qa-agent@example.test` únicamente como identidad de aplicación QA;
no se crearon sesión, cuenta Google ni runner. **Cero subidas de medios, cambios
de producción, nuevos despliegues o pasos E–F.** La parte SQL D está completada;
la parte R2 D conserva su permiso pendiente. No se hizo commit ni push.

### Preparación posterior de los tres medios

El dueño pidió preparar la subida a `hampton-app-qa-media` para poder avanzar
posteriormente a E–F; no concedió la autorización específica de subida ni E–F.
Se creó `docs/qa/full-app/media-upload-plan.json`, SHA-256
`8df58b9b326428f3c7e8649fa2e85a779789f6445b3ed0947a3d11d51acc735b`,
con exactamente tres PNG, claves `qa/full-app-v1/qa-pattern-01.png` a
`qa-pattern-03.png`, 3562 bytes cada uno (10686 total), y MIME `image/png`.
Las huellas individuales y condiciones de recuperación están en la propuesta.

Verificación de lectura a `2026-11-10T04:51:08.002897Z`: hashes/PNG/CRC válidos,
cuenta verificada por los recursos esperados; bucket distinto del negocio,
privado, sin dominios; GET de cada clave indica ausencia. Las tres filas QA
`media` ya importadas coinciden en claves, MIME, tamaño y dimensiones. Sin
escrituras D1/R2, secretos, despliegue, push ni E–F. Antes de ejecutar cualquier
PUT se repetirá el preflight y se exigirá el sí para esta propuesta y destino.

### Ejecución posterior de la subida expresamente autorizada

El dueño autorizó el manifiesto SHA-256
`8df58b9b326428f3c7e8649fa2e85a779789f6445b3ed0947a3d11d51acc735b`
exclusivamente para `hampton-app-qa-media`, sin producción ni E–F. Se conservaron
inalterados esa propuesta, el SQL, el manifiesto de fixtures y los PNG originales.
Antes de cualquier PUT se verificaron cuenta, privacidad y ausencia de las tres
claves; antes de cada PUT se repitieron cuenta/recursos conocidos, privacidad,
hash de la copia local y ausencia de la clave exacta. Las operaciones usaron
directorio temporal sin TOML empresarial, bucket/key explícitos y `--remote`.

Tres PUT con `image/png`, una vez por objeto y sin reintentos; los tres
finalizaron con código 0. Tras cada uno, GET a archivo temporal y comprobación
de SHA-256 completo y tamaño: 3/3 idénticos, 3562 bytes cada uno, total 10686.
Privacidad final: r2.dev deshabilitado y cero dominios personalizados.
Cierre verificado a `2026-11-10T04:54:52.383792Z`.

Evidencia sin credenciales: `docs/qa/full-app/media-upload-receipt.json`.
**A–D completados. Sin cambios D1, producción, Access, bindings, plan, dominios,
secretos, publicación, commit o push. E–F siguen sin autorización ni ejecución.**
No repetir PUT de esos objetos: ya existen y sus bytes están verificados.
