# QA History · relevo seguro para Codex

**No ejecutar operaciones remotas por leer este documento.** Verificar GitHub, candado y estado vivo antes de continuar; la autorización para subir un SHA no autoriza migrar o activar la QA.

## Archivos de entrega

- `qa-history-setup.sql`: esquema de 37 migraciones y 60 eventos ficticios. Se omitió de la variante QA una semilla de identidades reales de la migración 0010; no se modificó la migración empresarial. SHA-256: `56829f5a7f01504cf168c073a34e86765d50417f3c382d2802d3e83082ad078f`.
- `qa-wrangler.toml`: un solo binding `QA_DB`, para la D1 de prueba. SHA-256: `b79a4f7f1184fc27a37f722e16e9675fd8448371631978a53f35fd1a859b4423`. **No es una lista de acceso**: Wrangler remoto puede resolver por nombre otras D1 aunque no estén en este archivo.
- Los archivos son públicos y no incluyen claves ni personas reales. La identidad de servicio y cualquier permiso Access se guardan fuera de Git/chat.

## Estado y límites

El código de `server/qa-history.js` exige `QA_HISTORY_ACTIVE='true'`, clave exclusiva, binding QA diferente al negocio y un testigo presente solo en QA. El commit destinado a relevo **no configura** `QA_HISTORY_ACTIVE` ni `QA_HISTORY_KEY`; el endpoint permanece inactivo (503) incluso si se enlaza la D1. El inicio Google de los administradores no se comprueba con la identidad QA. Las pruebas locales usan dos D1 efímeras; el chequeo real de negocio solo lee y responde `{ok:true}` cuando se active de forma segura.

La D1 remota `hampton-qa-history` fue creada vacía por el dueño. El asistente solo verificó en modo lectura que su UUID difiere del de `hampton`, que tiene solo la tabla interna de Cloudflare, y que la base empresarial tiene la tabla `listings` sin el testigo QA. **No se ha importado el SQL remoto ni se ha configurado Access/secreto.** Antes de dar por bueno cualquier dato después de este corte, volver a consultar las bases y GitHub.

## Próximos controles (sin atajos)

1. En el PC autorizado del dueño, verificar SHA-256 de ambos archivos descargados desde GitHub. Desde la raíz del repositorio, ejecutar `npx.cmd --yes wrangler@4.148.0 d1 info QA_DB --config docs/qa/qa-wrangler.toml --json` y comparar el UUID con el QA comprobado. Consultar `sqlite_master` de `QA_DB` solo con SELECT y exigir que siga vacía salvo tablas internas. No pegar correos, tokens o identificadores personales en el chat.
2. Pedir **sí escrito específico** para importar el archivo de la huella anterior en la D1 QA exacta. Usar el **binding `QA_DB`**, no un nombre de D1, y nunca `--yes` de Wrangler D1. Si hay error o timeout, **leer el estado remoto antes de reintentar**: el paquete no es idempotente.
3. Tras el import autorizado, verificar testigo QA, 37 filas `d1_migrations`, 60 eventos, 0 personas de plantilla y `PRAGMA foreign_key_check`; confirmar ausencia de testigo en negocio. Un problema requiere recuperación solo de QA, no de producción.
4. Diseñar y configurar Access de servicio para `/api/qa/*` en dominio propio y `pages.dev`/previews, comprobar denegación anónima en todos. Conservar Preview sin D1/R2. Solo después añadir el secreto QA en Pages Production, confirmar que no coincide con secretos de otros roles y activar `QA_HISTORY_ACTIVE` por un cambio revisado/aprobado. No distribuir identidades entre talleres: centralizar smoke por tailnet y compartir resultados ligados al SHA.
5. Un push a `main` requiere candado, remoto sin avance, pruebas/revisión del SHA final y otro **sí explícito para ese SHA**. Comprobar Pages/Jobs, bindings efectivos de Production/Preview y que la QA siga 503 hasta que Access/activación estén listos. No afirmar smoke autenticado publicado por un 401/503 o por el E2E local.

C pendiente de SPR-02 y el texto versionado anterior que decía «B local» siguen como trabajos separados; no mezclar el estado QA con el de B ya publicado.
