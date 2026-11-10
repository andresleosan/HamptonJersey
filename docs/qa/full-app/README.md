# QA completa · SQL y medios del paso D verificados

> Estado actual: QA publicado y smoke autenticado completado con F1 autorizada.
> Último pase: 71/71 API + 66/66 UI; primer pase con tres fallos UI no reproducidos.
> Ver AGENT-RUNNER.md y published-smoke-report.json. Producción sin cambios.


Preparado localmente sobre `main` / `80ad03df7e095750f455aa4aa668573e9aac5db4`.
El dueño autorizó expresamente importar el SQL con la huella y UUID siguientes.
**Importado una sola vez y verificado mediante lectura remota el 2026-11-10 UTC.**
Existe la fila `qa-agent@example.test` en esta D1 QA. Los tres medios ficticios
también se subieron tras permiso específico y se verificaron por descarga.
No se ha publicado la aplicación ni avanzado a E–F.

**Estado posterior de E: completado tras E1 autorizada.** La corrección aprobada
resolvió el bloqueo chroot de Chromium: 22/22 controles runtime y selftest del
proxy correctos, con sandbox activo. Se recreó solo el runner; proxy y redes
conservan sus IDs. Ambos contenedores están inertes entre comandos, sin identidad
QA. F no se inició. Ver `runner-execution.md` y
`runner-correction-e1-execution.json`. El recibo E original conserva el fallo
anterior y los manifiestos de preparación se mantienen como snapshots históricos.

## Artefactos y destino

| Artefacto | Bytes | SHA-256 |
| --- | --- | --- |
| `setup.sql` | 146527 | `5024c26b87f676c28efb01a3fa7d111afd2bf790b6d6da169e38a92d9c8d6e95` |
| `manifest.json` | 9089 | `1ed4994cb34151ca5abeff988b2f855ea07375d31168169bf3a0f7faf7e860b9` |

SQL UTF-8 sin BOM, LF. El manifiesto contiene huellas de entradas y medios,
destino y conteos esperados. Se conserva inalterado como propuesta histórica:
sus flags `remote_import_authorized/performed=false` describen su preparación,
no el estado actual. La ejecución y autorización posteriores constan en
`import-receipt.json`; las comprobaciones remotas, en `import-readback.json`.
Ninguno contiene credenciales.

- D1: **hampton-app-qa**, UUID **53bc4af9-7250-44fe-8f90-6e415fda1034**.
- Cuenta Cloudflare única, verificada por coincidencia de recursos Hampton.
- Importación propuesta: binding `APP_QA_DB` de `import-wrangler.toml`.
- Aplicación: binding `DB`, únicamente en Production del proyecto separado
  **hamptonjersey-qa**. Ese entorno de Cloudflare pertenece a QA. Preview sigue
  sin D1/R2. Este paquete no cambia bindings.
- D1 empresarial `hampton` y QA anterior de History tienen UUID distintos y son
  destinos prohibidos. Un TOML con UUID no sustituye comprobar la resolución real.

## Contenido y límites

DDL final de las 37 migraciones: 57 tablas de aplicación, 66 índices explícitos,
30 triggers y una vista. Se añaden `d1_migrations` con los 37 nombres aplicados
y `qa_app_guard`: 59 tablas propias en total. El constructor ejecuta las
migraciones solo en SQLite en memoria, exporta el esquema y descarta todas las
filas originales, incluidas identidades y tours.

Semilla nueva: propiedades publicadas, borradores, archivo y revisión; contactos,
solicitantes, visitas, matches, ofertas, venta e hitos; alquileres, contratos,
cobros, pagos, cumplimiento y reparación; tareas, notificaciones, chats, correo
ficticio, borrador de job, importación fallida, anunciantes, investigación,
estadísticas e History con más de una página de eventos.

Única fila de `admins`: **qa-agent@example.test**, **QA Agent**. La aplicación
actual solo tiene este modelo de acceso: es administrador de la aplicación
**dentro de esta D1 QA**, sin acceso a Cloudflare ni al negocio. No crea cuenta
Google, contraseña, sesión ni bypass; el acceso del agente corresponde a etapas
posteriores. Identidades `.test`, teléfonos nulos y gráficos generados.
Consentimientos y mensajes son estados ficticios, sin entrega ni consentimiento
real. No se copiaron filas del negocio.

Las fechas dependen de `qa_app_guard.seeded_at` y `fixture_day`, fijadas una vez
al importar en UTC. Cobros/pagos usan peniques y rentas usan libras. El contrato
full-service tiene historial inicial, tres cargos mensuales y cambio futuro;
el let-only no tiene cargos ni fecha de cobro.

Correo deshabilitado, resumen sin destinatarios, outbound pausado y cero
envíos/trabajos en cola. No incluye bindings de proveedores ni secretos.

Tres PNG sintéticos 600×400 están preparados en `media/`, con hashes y claves
R2 en el manifiesto. Destino: **hampton-app-qa-media**. El SQL preparó solo sus
metadatos; una autorización posterior permitió subir esos tres objetos exactos.
Están verificados en R2 privado. La aplicación aún no está publicada y su
entrega de medios por HTTP no está probada.

### Subida autorizada y verificada

La propuesta inalterable `media-upload-plan.json` fija los tres archivos,
hashes, claves, MIME y verificaciones posteriores. SHA-256 de la propuesta:
`8df58b9b326428f3c7e8649fa2e85a779789f6445b3ed0947a3d11d51acc735b`.
Destino exclusivo: **hampton-app-qa-media**, prefijo **qa/full-app-v1/**.
La propuesta conserva sus flags históricos de preparación sin autorización;
el permiso y ejecución posteriores constan en `media-upload-receipt.json`.

| Archivo y clave bajo ese prefijo | Bytes | SHA-256 |
| --- | --- | --- |
| `qa-pattern-01.png` | 3562 | `8f7b868d78e352846f692651670b55fbc740c2279f48e8d2c5c3f82a8beefe79` |
| `qa-pattern-02.png` | 3562 | `f3ddadced0b467375992f442e45c21c29d0d88884c917bcede1c470f4a59db59` |
| `qa-pattern-03.png` | 3562 | `426040834026c2fdfb641cade566bbe8614d0ee1411688333812dc20de71e929` |

Preflight de lectura a `2026-11-10T04:51:08.002897Z`: cuenta verificada por las
tres D1 conocidas; bucket distinto del empresarial; r2.dev deshabilitado y cero
dominios; las tres claves exactas devolvieron objeto inexistente. La métrica
del bucket reportó cero objetos, pero la ausencia de las claves se comprobó
además mediante GET individuales. Las tres filas `media` de la D1 QA coinciden
en clave, miniatura, tipo, tamaño, dimensiones y visibilidad con la propuesta.
Los PNG tienen CRC válidos, dimensiones 600×400 y solo chunks IHDR/IDAT/IEND.

El dueño autorizó esta huella de propuesta y este bucket. Se revalidaron cuenta,
bytes, privacidad y ausencia inmediatamente antes de cada PUT, desde directorio
temporal sin configuración empresarial. Los tres PUT y sus GET finalizaron
con código 0; los tres SHA-256 y tamaños remotos coincidieron. Una subida por
objeto, cero reintentos y 10686 bytes en total. La privacidad se revalidó al
final: r2.dev deshabilitado y cero dominios. Las métricas agregadas no se usan
como prueba del resultado. No se usaron nuevas credenciales ni se hicieron cambios
de D1, Access, bucket, dominios, bindings, plan o despliegue. Wrangler PUT puede
sobrescribir: el preflight de ausencia no es una garantía atómica frente a otro
escritor; detenerse ante colisión o concurrencia sospechada. Ante resultado
incierto, leer antes de reintentar; un objeto ya idéntico se verifica sin PUT
adicional. No borrar ni sobrescribir un objeto diferente.

El permiso de subida se ejecutó; los objetos ya existen, no repetir PUT.
No se autorizó ni ejecutó E–F o push. E requerirá preparar
y aprobar su imagen fijada, red y montajes; F su artefacto/SHA y pruebas.

## Evidencia

Preflight remoto de solo lectura del 2026-11-10 UTC: cuenta única; nombres/UUID
de las tres D1 contrastados; Wrangler 4.148.0 resolvió `APP_QA_DB` al nombre/UUID
previstos; `sqlite_master` remoto solo contenía `_cf_KV`, cero objetos de
aplicación. No se consultaron filas empresariales ni secretos.

- 10/10 pruebas Python: paridad exacta DDL, integridad, claves foráneas, privacidad,
  identidad, relaciones, alquileres, pausa de envíos, rechazo sin cambios de
  base ocupada/reimportación, huellas y reproducibilidad.
- Wrangler 4.148.0 importó estos mismos bytes **solo en D1 local efímera**;
  los conteos de las 59 tablas coinciden y `foreign_key_check` quedó vacío.
  Miniflare añade `_cf_METADATA`, tabla interna ajena al paquete.
- Segundo intento local rechazado por la primera consulta (`malformed JSON`),
  con conteos idénticos. Python compara además el dump completo sin cambios.
- Revisión independiente completada; corregidas unidades/historial de alquiler.
- GitHub `main` y HEAD local coinciden con el SHA fuente. Sin commit ni push.

La autorización posterior identificó exactamente el hash SQL y UUID de esta
tabla. Se repitió el preflight de huellas/cuenta/resolución/vacío inmediatamente
antes de importar una copia byte a byte. Wrangler finalizó con código 0.
El verificador inicial no aceptó el resumen CLI y detuvo la validación con
`AssertionError`; no se repitió la importación. La lectura remota independiente
confirmó los 156 objetos DDL exactos, los conteos de las 59 tablas, las 37
migraciones, el guard y la única identidad QA, sin errores de claves foráneas.
También confirmó correo deshabilitado, outbound pausado y cero trabajos/envíos
activos. El resumen CLI no se usa como prueba del resultado remoto.

Esto verifica el paquete, su importación local y el estado importado en D1 QA.
No es E2E de la aplicación,
chequeo de filas empresariales ni smoke autenticado publicado.

Reproducción local sin red:

```powershell
python docs/qa/full-app/build.py --check
python -m unittest discover -s tests -p test_full_app_qa_bundle.py -v
Get-FileHash docs/qa/full-app/setup.sql -Algorithm SHA256
Get-FileHash docs/qa/full-app/manifest.json -Algorithm SHA256
```

## Recuperación y futuras operaciones

El sí escrito para este hash SQL y UUID D1 ya se ejecutó. La D1 ahora contiene
el esquema y las fixtures: **no reimportar este paquete**. Cualquier operación
nueva requiere su permiso específico. El preflight de identidad y vacío se
aplicó antes de la única importación; el guard no sustituye esa comprobación.

Inicialización **no idempotente**, sin reset ni `DROP` de tablas existentes.
Si la importación queda incierta, inspeccionar primero el estado remoto antes
de decidir cualquier reintento; no asumir éxito ni reversión total. Leer guard,
esquema y conteos. No ejecutar directamente las migraciones empresariales en QA:
este paquete sustituye sus semillas iniciales. E/F, `QA_HISTORY_ACTIVE`, cambios
de producción y push siguen fuera del permiso.

## Paso F preparado · aplicación completa

La preparación actual está en `publish/README.md`, con revisión independiente y
71 comprobaciones API + 66 UI locales aprobadas. No se desplegó la aplicación
ni se cargó identidad real al runner. Access/Production/Preview y runtime E1
verificados en lectura. El SQL adicional de una fila espera su permiso propio.
Propuesta sellada: `publish-proposal.json`, SHA-256 `be67091b22cd5bdcab7d8dd7a91e5d5d6cd8cfbfed0e5011245049ccc6d37f96`.
No reimportar setup.sql ni interpretar esta preparación como smoke publicado.
