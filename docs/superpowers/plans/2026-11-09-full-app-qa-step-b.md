# QA completa · paso B · registro

Estado: paso B completado y verificado a `2026-11-10T04:17:33Z`.

## Autorización y límites

El dueño autorizó en este chat configurar Access y la identidad de servicio para
`hamptonjersey-qa.pages.dev` y todos sus hostnames de despliegue. No autorizó tocar
producción ni avanzar a C–F. La autorización de B incluye el bootstrap inerte del
diseño si resulta necesario para comprobar la protección; no publicar la app.

- Destinos: raíz `hamptonjersey-qa.pages.dev` y wildcard
  `*.hamptonjersey-qa.pages.dev`, incluyendo hashes y alias.
- Aplicaciones previstas: `Hampton App QA` y `Hampton App QA Previews`.
- Identidad de servicio prevista: `hampton-app-qa-runner`, con caducidad.
- Exclusivamente Service Auth con ese token; sin Everyone, Bypass ni acceso de
  miembros por defecto. No crear permisos de API Cloudflare para el ejecutor.
- Guardar la identidad nueva fuera de Git y sin exponer valores en logs, chat o
  capturas. No leer/copiar credenciales anteriores.
- No configurar SESSION_SECRET, bindings, datos, usuarios, runner ni aplicación.

## Verificaciones y operaciones

- La cuenta autenticada sigue siendo única; los nombres de Pages y UUID D1 QA y
  empresarial coinciden con el registro de A, comprobado solo en lectura.
- Se buscó un conector Cloudflare: no disponible. Wrangler 4.148.0 no tiene un
  comando Access y su autenticación OAuth no declara permisos Access. No se
  extrajo su token ni se intentó ampliar sus permisos.
- Se abrió una pestaña específica en Chrome y se verificó el proyecto nuevo.
  Su configuración inicial no tiene variables/secretos ni bindings.
- Se pulsó `Restrict previews` únicamente en `hamptonjersey-qa`. El panel confirmó
  previews restringidos y creó la app `33a0abb5-4f6b-4235-8160-8710b063966e` para
  `*.hamptonjersey-qa.pages.dev`, con la política inicial de miembros
  `949a2368-f131-44d7-933d-8630fc845ec8`.
- Esa política inicial aún debe sustituirse por Service Auth exclusivo y falta
  configurar raíz, persistir identidad y ejecutar comprobaciones negativas y
  autenticadas. No equivale a protección final verificada.
- Se creó únicamente el token `hampton-app-qa-runner`, UUID de recurso
  `df7cd5a1-76a1-4fed-9c89-1894b94326a0`, duración 720h (30 días). Los valores
  nuevos se conservaron fuera de Git en archivos con ACL exclusiva del usuario
  Windows, comprobada sin imprimir valores. El guardado se verificó por igualdad
  en memoria y formato; no se copiaron credenciales anteriores. No es un token de
  API Cloudflare y no se configuró SESSION_SECRET.
- Se creó la política `Hampton App QA Service Only`, ID
  `d05d1e3a-506f-4912-ad48-2f2cb7a91551`, acción Service Auth y selector Service Token
  exclusivamente para `hampton-app-qa-runner`. Se retiró la asociación de la regla
  inicial de miembros. La aplicación existente se renombró `Hampton App QA` y su
  destino se cambió del wildcard a la raíz `hamptonjersey-qa.pages.dev`, siguiendo
  el procedimiento de Pages para cubrir raíz y previews por separado.
- El panel confirmó `Application successfully configured`; su inventario muestra
  raíz QA y la política exclusiva. Falta recrear/comprobar wildcard, releer ambas
  políticas y verificar denegación/acceso real. No dar B por completado todavía.
- Se volvió a restringir Preview tras convertir la primera app en raíz. Se creó
  `Hampton App QA Previews`, app `2e15da5c-dcea-4c08-82dc-440f5d78702f`, para
  `*.hamptonjersey-qa.pages.dev`. Se retiró su regla de miembros inicial
  `9b033fb8-1266-4fbd-a73b-a24cd543e098` y se adjuntó únicamente la política
  reutilizable `d05d1e3a-506f-4912-ad48-2f2cb7a91551`. Inventario releído: ambas
  apps muestran exclusivamente `Hampton App QA Service Only`.
- Prueba remota previa al bootstrap: raíz y hostname de sondeo del wildcard
  devuelven 403 tanto anónimos como con el secreto ficticio incorrecto; con la
  identidad nueva devuelven 522 (no hay origen desplegado). Ese 522 no se presenta
  como éxito de la aplicación ni prueba positiva completa.
- Se preparó el bootstrap estático de B en `docs/qa/access-bootstrap`: solo
  `index.html`, `access-check.txt` y `_headers`, sin scripts, funciones, datos,
  variables ni bindings. Huella SHA-256 del manifiesto canónico de esos archivos:
  `d907fd079669526233410fede5aebc2832210c578fc5fdb725f901ef7015479f`.
  La publicación inerte de B está en curso para verificar raíz, hash y alias,
  manteniendo la aplicación del paso F sin publicar.

## Pendientes

- [x] Crear identidad exclusiva y conservarla privadamente sin revelar valores.
- [x] Establecer Service Auth exclusivo en raíz y wildcard, con denegación por defecto.
- [x] Releer configuración efectiva y comprobar que no hay reglas amplias.
- [x] Verificar bloqueo anónimo/identidad incorrecta y acceso con identidad correcta
  en hostnames reales; usar bootstrap sin datos solo si es necesario.
- [x] Confirmar que C–F siguen sin ejecutar y actualizar manifiesto sin credenciales.

## Evidencia final de Access

- Ambas apps se releyeron en sus vistas persistidas: una sola política cada una
  (tabla con cabecera + una fila). La raíz no tiene subdominio/path limitante;
  Preview conserva `*` y cubre todos los paths. No hay Allow Members, Everyone ni
  Bypass asociados a estas apps.
- La vista persistida de la política compartida indica 1 regla, 2 aplicaciones,
  acción Service Auth e Include Service Token `hampton-app-qa-runner`. Las dos
  aplicaciones listadas son exclusivamente las apps QA de raíz y wildcard.
- Bootstrap de B publicado en el proyecto QA sin configuración de recursos:
  rama `main`, hash `868e44b9`; rama `qa-access-bootstrap`, hash `6323fc32` y alias
  `qa-access-bootstrap`. Ambos son HTML/texto inerte; no es el despliegue de la
  aplicación F ni un smoke funcional de la app.
- Verificación HTTP **32/32** a `hamptonjersey-qa.pages.dev`,
  `868e44b9.hamptonjersey-qa.pages.dev`, `6323fc32.hamptonjersey-qa.pages.dev` y
  `qa-access-bootstrap.hamptonjersey-qa.pages.dev`: por host, anónimo/clave errónea
  dan 403 y token correcto da 200 con marcador exacto en `access-check.txt`;
  `/`, `/admin/`, `/api/admin/users`, `/api/qa/history`, `/media/qa-probe` dan 403
  sin identidad. No se siguen redirecciones ni se imprimen cuerpos/cabeceras
  sensibles. No se enviaron credenciales QA a producción ni a terceros.
- La caducidad real del token todavía no ha ocurrido y no se simuló una revocación
  remota. Su duración configurada es 720h; estas comprobaciones no acreditan login
  Google ni funcionalidades de la aplicación.
- Identidad nueva conservada en `%USERPROFILE%\HamptonQA\full-app-access`,
  `client-id.txt` y `client-secret.txt`, con ACL exclusiva del usuario. Los valores
  no se guardan en este repositorio. No abrirlos como evidencia ni adjuntarlos.
- Captura de prueba sin valores de credenciales ni datos personales:
  `test-results/qa-access-policy.png` (directorio ignorado por Git).
- Lectura final por Wrangler: dos despliegues, únicamente los bootstraps registrados;
  configuración descargada de Production QA y Preview sin bindings D1/R2 ni
  variables. `d1 info` al UUID QA exacto mantiene cero tablas de usuario.
- GitHub y HEAD siguen en `80ad03df7e095750f455aa4aa668573e9aac5db4`;
  archivos de aplicación y TOML empresariales sin cambios. No se hizo push.
  No se configuraron secretos de sesión, recursos de C ni datos/usuario de D;
  no se creó el runner E ni se desplegó la aplicación F. Producción empresarial
  no recibió cambios ni credenciales de prueba.
