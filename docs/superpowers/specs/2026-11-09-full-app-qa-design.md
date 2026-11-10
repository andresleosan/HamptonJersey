# QA de toda la aplicación · propuesta para autorizar

Estado: A–E completados tras E1 autorizada y verificada; F pendiente de autorización.
Fecha del usuario: 9-nov-2026, America/Bogota.
Base: `main`, `80ad03df7e095750f455aa4aa668573e9aac5db4`.

Revisión independiente de construibilidad: se corrigió el acceso potencial del
runner al perfil Wrangler del host mediante la frontera de contenedor descrita
abajo. Segunda lectura sin preguntas materiales pendientes. Esto no acredita
aislamiento completo por sí sola: la ejecución posterior E1 sí verificó 22/22
controles y selftest del proxy, con Chromium sandbox. No acredita workflows de
aplicación publicados: F no se inició y todavía no se cargó identidad QA.

## Objetivo y decisión

El dueño pidió un entorno separado donde los agentes puedan recorrer la web y
el panel completos, crear, editar y borrar datos ficticios, sin usar su sesión ni
operar sobre producción. Eligió esta dirección después de la propuesta de separar
QA del smoke limitado a History. Este documento concreta esa dirección; no es
permiso para crear recursos, importar SQL, configurar Access/secretos o publicar.

Recomendación técnica del autor: un proyecto Cloudflare Pages nuevo, mediante
Direct Upload, con una D1 y un bucket R2 nuevos; usuario técnico de aplicación
solo en esa D1. Reutilizar las sesiones firmadas y los componentes de la app.
Un ejecutor privado aislado en este PC controla Chromium/Playwright y entrega
resultados saneados. Las pruebas rutinarias no se delegan al dueño.

Alternativas consideradas:

| Alternativa | Utilidad y límite | Decisión |
| --- | --- | --- |
| Solo Miniflare y E2E locales existentes | Rápido, efímero, no verifica despliegue real de Pages/D1/R2 | Conservar como primera capa |
| Proyecto Pages QA separado con D1/R2 propios | Comprueba la app desplegada y admite cambios ficticios; requiere provisión explícita | Recomendada para la dirección elegida por el dueño |
| Preview del proyecto empresarial o usuario de prueba en su D1 | Comparte configuración y aumenta el riesgo de usar recursos reales; contradice Preview sin D1/R2 | Descartada |

Direct Upload evita publicar en `main` para desplegar QA. Se acepta que ese
proyecto no puede convertirse después a integración Git sin recrearlo. No se
crean otra web con Sites, otra lógica de negocio ni otro sistema general de roles.

## Evidencia leída y situación actual

- El remoto y la copia local continúan en el SHA anterior, sin cambios de producto.
- `server/routes/session.js` permite Google/Firebase y exige una fila en `admins`;
  `server/auth.js` vuelve a verificar esa pertenencia en cada petición protegida.
  No existe hoy un rol de operador limitado. No añadir el usuario QA al negocio.
- `tests/e2e.cjs` ya usa `signSession` para una identidad ficticia y cookies de
  prueba. Esto permite automatizar el panel sin un nuevo endpoint de login.
- `tests/run-e2e.cjs` y `tests/serve-e2e.cjs` aíslan Miniflare, generan secretos
  efímeros y prueban con servicios ficticios. No deben apuntarse al entorno remoto:
  contienen operaciones SQL locales y supuestos de fixtures/URLs locales.
- `wrangler.toml` enlaza el negocio y la QA específica de History. Ninguno de esos
  destinos sirve para esta nueva QA completa. Preview se mantiene sin D1/R2.
- `jobs/wrangler.toml` apunta al negocio, tiene cron y binding de correo. No copiar
  esa configuración a QA ni desplegarla para este trabajo.
- Drive admite destinos de prueba (`DRIVE_API`, `DRIVE_TOKEN_URL`); correo ya tiene
  pruebas con un binding ficticio. Firebase web contiene configuración del proyecto
  empresarial y correo genera algunos enlaces al dominio empresarial: requieren
  tratamiento explícito en el artefacto QA, no una copia ciega del build.
- Hay 37 archivos de migración hasta `0038_history_related.sql` (no existe 0028).
  El paquete de History excluyó la semilla real de 0010. Las migraciones y la fixture
  general no son directamente un seed público saneado para toda la app.
- Inventarios remotos consultados solo en lectura: no se encontraron los tres
  nombres QA propuestos abajo. Esto no reserva los nombres ni prueba permisos de
  creación. La primera consulta R2 con `--json` falló; la lectura compatible sin
  esa opción terminó con salida 0. No se creó ningún recurso.
- Este PC tiene Node 24.22.1, Chrome y Docker con daemon Linux operativo. La copia
  del repositorio no tiene instalados Wrangler/Playwright; las consultas anteriores
  usaron npx fijando Wrangler 4.148.0. La implementación debe instalar dependencias
  del runner de forma reproducible, sin presumir pruebas ya ejecutadas.

## Destinos propuestos y límites

| Recurso | Destino nuevo propuesto | Contrato |
| --- | --- | --- |
| Pages | `hamptonjersey-qa` | Direct Upload; sin integración Git, dominio propio ni despliegues automáticos |
| URL | `https://hamptonjersey-qa.pages.dev` | Nombre sujeto a confirmación de Cloudflare al crear; origen fijo del ejecutor |
| D1 | `hampton-app-qa`, binding de app `DB` | ID nuevo, distinto tanto del negocio como de `hampton-qa-history` |
| R2 | `hampton-app-qa-media`, binding `MEDIA` | Privado, sin r2.dev ni dominio público; objetos ficticios servidos por la app QA |
| Usuario de aplicación | `qa-agent@example.test`, nombre `QA Agent` | Fila solo en `admins` de la D1 nueva; no es un buzón ni una cuenta Google |
| Access | Apps `Hampton App QA` y `Hampton App QA Previews` | Protección de todo el sitio, raíz y `*.hamptonjersey-qa.pages.dev`, no solo `/api/qa/*` |
| Identidad Access | `hampton-app-qa-runner` | Token de servicio específico, con caducidad; sin permisos de API Cloudflare |
| Ejecutor | Contenedor Linux sin privilegios en Docker Desktop de este PC | Node + Playwright/Chromium fijados; sin perfil/credenciales Cloudflare del host |

Se usará la misma cuenta Cloudflare que el proyecto existente solo después de
reconfirmar su correspondencia sin publicar datos personales. Si la cuenta o un
nombre no corresponde, detenerse: no reutilizar ni borrar un recurso encontrado.
Los UUID nuevos se registran tras la creación y antes de pedir permiso de import.
No hay UUID inventados, fallback a nombres ni comandos ejecutables de escritura
con destinos pendientes en esta propuesta.

El proyecto QA tiene su propio entorno denominado **Production** por Pages;
ese nombre no significa producción empresarial. Su Preview sigue sin D1/R2,
secretos de sesión ni recursos heredados. La configuración efectiva se verifica
en ambos proyectos antes de una activación; el TOML por sí solo no la acredita.

## Aislamiento que debe demostrar la implementación

1. Configuración/build QA propios, sin modificar los TOML empresariales ni
   publicar cambios en el proyecto `hamptonjersey` o el Worker `hampton-jobs`.
   Crear los artefactos en un directorio separado; no sobreescribir `site` para
   un despliegue empresarial. Registrar SHA fuente, hash del artefacto y overlay QA.
2. Resolver bindings por identificador y comparar la configuración efectiva contra
   un manifiesto permitido de los recursos nuevos. Rechazar los IDs empresariales
   y de History, cualquier secreto/binding extra, destino ambiguo o vista previa
   con D1/R2. El aprovisionador puede necesitar permisos de cuenta: el TOML y el
   nombre QA no limitan sus credenciales. El ejecutor de pruebas no recibe esas
   credenciales, ni capacidad directa para migrar o administrar Cloudflare. Un
   proceso bajo el mismo usuario Windows del aprovisionador no satisface esto:
   podría reutilizar la autenticación Wrangler guardada en ese perfil.
3. Antes de servir datos, el wrapper exclusivo del artefacto QA exige origen
   permitido y un testigo propio en D1. Sin ellos devuelve 503. Ese wrapper no se
   incorpora al build empresarial. El guardia de destino se aplica también a
   cualquier operación de jobs y a las herramientas de inicialización/reset.
4. Access protege raíz, APIs, medios y todos los hostnames de despliegue antes de
   publicar la app con datos. Verificar raíz y wildcard por separado, tokens
   ausentes/incorrectos/caducados y ausencia de reglas Bypass/Everyone. Primer
   despliegue, si Pages lo necesita para habilitar Access: solo página inerte sin
   bindings ni datos, con permiso explícito. `noindex` no reemplaza Access.
5. No instalar credenciales de Google/Drive/Firebase, Hermes, correo o proveedores
   empresariales. El build QA deshabilita el login Google empresarial con un error
   claro; la sesión técnica da acceso a las funciones. No contactos externos reales.
6. Tráfico servidor/browser externo denegado por defecto, con una lista explícita
   mínima para Turnstile de prueba y recursos realmente necesarios. Bloquear
   hostnames empresariales, redirecciones hacia ellos, Firebase empresarial,
   embeds, telemetría y enlaces de contacto. No enviar identidad Access ni cookies
   fuera del origen QA. Sin cabeceras secretas globales, service workers ni trazas
   que guarden cabeceras/cookies; comprobar también redirecciones de subrecursos.

## Usuario de prueba y acceso autónomo

El runner usa la función existente `signSession` con un **SESSION_SECRET nuevo y
exclusivo de QA**. Inserta una cookie `__Host-hs`, host-only, Secure, HttpOnly y
SameSite Strict en un contexto Chrome vacío del origen QA. La aplicación resuelve
`qa-agent@example.test` en su tabla QA `admins`; las operaciones reales de la app
conservan sus controles normales. No introducir bypass de autenticación,
cabecera que suplante usuarios, sesión del dueño ni endpoint público para emitir
cookies. Cerrar el contexto al terminar y probar revocación borrando solo el
usuario temporal de una prueba; nunca el usuario base por accidente.

El usuario tiene permisos de aplicación amplios dentro del sandbox porque el
modelo actual solo tiene `admins`; esto es necesario para probar gestión de
usuarios y otras funciones. **No tiene un rol limitado que el código no posee**,
no pertenece al negocio y no administra Cloudflare, Google o el sistema operativo.
Si se exige un rol nuevo de permisos finos, será una modificación funcional aparte.

Guardar el secreto QA y el token Access únicamente en un almacén privado local
fuera del checkout, con ACL de Windows del usuario propietario. El proceso de
aprovisionamiento es distinto del ejecutor: lanza un contenedor Linux no root,
sin modo privileged, sin capabilities, sin socket Docker ni montajes del perfil,
`.codex`, `.config`, `.wrangler`, `.ssh`, Git o carpetas de trabajo completas.
Solo recibe un paquete de código permitido de lectura, salida saneada en una
carpeta dedicada y sus credenciales nuevas QA por stdin hacia tmpfs privado 0600;
no como argumentos, variables visibles en inspect, imágenes ni volúmenes durables.
Sistema de archivos del contenedor de solo lectura salvo tmpfs necesarios para
Chromium. Red interna con salida por proxy de lista permitida al origen QA y
Turnstile de prueba; denegar acceso a host/LAN/metadata y destinos arbitrarios.
No basta configurar el proxy de Playwright: la red debe impedir una salida directa.
Verificar aislamiento negativo antes de introducir secretos o arrancar las pruebas.
Docker existe y responde Linux en este PC; descargar imágenes y crear el runner
y su proxy requieren la autorización local E, con versiones/digest revisados.
La preparación concreta está en `docs/qa/full-app/runner/README.md` y su
manifiesto `docs/qa/full-app/runner-proposal.json`. Usa Playwright 1.65.0 y
mitmproxy 12.3.1 por digest Linux/amd64; bridge interno con gateway isolated y
dos redes/contenedores sin puertos publicados. El proxy inspecciona HTTPS para
impedir cambios de Host dentro de un túnel permitido. Su CA/clave solo existe
en tmpfs después del permiso E; no se instala en Windows. E no carga secretos
QA: primero debe demostrar aislamiento. La inserción de sesión y Access solo
por origen se concreta con el paquete F y su autorización independiente.
El dueño autorizó el manifiesto E original y se ejecutó sin identidad QA.
La combinación del seccomp oficial con cap_drop ALL bloqueó el chroot requerido
por Chromium. Tras diagnosticarlo en lectura se detuvieron ambos contenedores.
La propuesta custom E1 conserva todo excepto esa llamada permitida y corrige
el selftest: `docs/qa/full-app/runner-correction-e1-proposal.json`. El dueño
autorizó después su hash exacto y se aplicó: se recreó solo el runner, el proxy
conservó su ID y pasaron 22/22 controles más el selftest. Ambos quedan inertes
entre comandos; recibo `docs/qa/full-app/runner-correction-e1-execution.json`.
No se cargó identidad QA, ni se inició F o alguna operación de producción.
No reutilizar el helper POSIX de History (`process.getuid`/0600) como prueba de
privacidad de archivos del host Windows; dentro del contenedor rigen permisos Linux.
No leer ni copiar secretos empresariales para compararlos o generar fixtures.
Generar secretos nuevos mediante aleatoriedad criptográfica después del permiso.
Cada ejecución consume la identidad local sin imprimirla y solo firma ese usuario.
Los agentes invocan un comando local y leen un resultado saneado, sin manejar
credenciales en chat. Los agentes de otras máquinas todavía no tienen acceso:
compartir ejecución vía tailnet necesita configurar y autorizar ese canal aparte.
No crear un servicio remoto/cron por este documento.

## Datos ficticios e integraciones

- Construir un paquete nuevo con esquema saneado y seed completo. No importar el
  paquete History ni `tests/fixtures/seed.sql` sin adaptación. Eliminar del paquete
  la semilla de personas de 0010; conservar el comportamiento del esquema.
- Dataset determinista: usuarios QA, propiedades publicadas/borradores/archivadas,
  medios generados, propietarios, solicitantes, búsquedas/matches, visitas,
  ofertas/ventas, alquileres, vencimientos/pagos, inbox, chats, tareas,
  notificaciones, eventos/History y casos vacíos/error. Fechas relativas a una
  fecha de ejecución registrada; importes sintéticos. Correos solo `.test`, sin
  teléfonos marcables, documentos, fotos ni exportaciones del negocio.
- Identificador de versión de fixture y testigo `qa_app_guard` propios; hashes de
  SQL/manifiesto/medios. Aplicación primero local sobre SQLite/Miniflare. Validar
  integridad referencial, inventario y ausencia de identidades/URLs reales.
- Inicialización remota una sola vez en D1 nueva confirmada vacía. Consultar ID y
  esquema inmediatamente antes. Si un import falla o queda incierto, consultar el
  estado remoto antes de decidir recuperación; no reintentar a ciegas.
- Drive: adaptador de prueba con documentos y medios ficticios, reutilizando los
  contratos ya probados. Sin service account real ni tráfico a Google. El adaptador
  se inyecta solo en el artefacto QA; no requiere otro servicio público inicialmente.
- Correo: sin binding real `send_email`, MX ni Email Routing. Un binding simulado
  conserva mensajes ficticios en una bandeja QA y devuelve resultados de prueba.
  `EMAIL_SERVICE_READY` permanece falso en configuración remota; el wrapper solo
  lo habilita en memoria al inyectar el simulador. Si falta este, falla cerrado.
  Ningún enlace generado debe llevar al sitio empresarial.
- Jobs: reutilizar `server/jobs.js` en el wrapper QA, disparo manual autenticado
  exclusivo de QA, sin cron ni Worker empresarial. Hora controlada cuando proceda;
  retención y reconciliación actúan únicamente sobre fixtures. No routing inbound
  real: inyectar un mensaje ficticio con el mismo manejador.
- Hermes y proveedores: identidad QA separada si se prueban sus rutas; adaptador
  determinista de entrada/salida. No usar conexiones, bots, cuentas ni claves del
  negocio. Integración externa real requiere sandbox del proveedor y otro permiso.
- Turnstile: par oficial de prueba, solo en QA. Google sign-in, entrega de correo,
  Drive y proveedores reales se reportan aparte; simulación no acredita integración.

## Cobertura y aceptación

| Capa | Qué debe acreditar | Qué no debe afirmarse |
| --- | --- | --- |
| Local | Unitarias + E2E efímero del código y aislamiento; prueba negativa de cada guardia | Despliegue remoto o entrega a proveedores |
| QA publicada | Web/panel reales, CRUD, media R2, workflows, usuarios, History, filtros, errores, 1280/390 y accesibilidad pertinente | Operación del negocio ni Google OAuth real |
| Integraciones simuladas | UI y contratos de Drive, correo, jobs, Hermes; fallos y reintentos reproducibles | Envío/recepción reales ni disponibilidad de terceros |
| Externas sandbox, posterior | Google/OAuth y proveedores con cuentas técnicas propias y permiso separado | Cobertura por una sesión firmada o simulación |

No prometer 100 % de cobertura: registrar cada módulo/ruta y su caso ejecutado,
resultado, modo real/simulado, limitaciones y pendientes. Reutilizar las suites
existentes, agregando un runner remoto separado que no ejecute SQL local contra
Cloudflare ni acepte un BASE arbitrario. Serializar las suites mutables mediante
un único ejecutor y candado; identificar cada run y limpiar solo sus filas/objetos
ficticios. Un reset completo requiere otro permiso para IDs exactos.

Antes de declarar QA utilizable: confirmar Access en todos los hostnames, manifiesto
de bindings/secretos efectivos, rechazo de una sesión QA contra una instancia
local con secreto distinto, ausencia de credenciales de provisión en el runner,
cero conexiones al negocio, CRUD remoto y medios, simuladores y jobs, limpieza y
resultado por SHA. **No enviar cookies QA a producción para demostrar rechazo**.
Contrastar la configuración empresarial solo en lectura; no usar el antiguo
`production-check` ni activar `QA_HISTORY_ACTIVE` para esta entrega.

## Autorizaciones específicas, en orden

El dueño concedió A expresamente en este chat después de aprobar el diseño. Se
crearon y verificaron los tres recursos; ver el [registro del paso A](../plans/2026-11-09-full-app-qa-step-a.md)
y [manifiesto de recursos](../../qa/full-app-qa-resources.json). Posteriormente
autorizó B: raíz y wildcard QA quedaron protegidos con una identidad de servicio
exclusiva, comprobaciones HTTP 32/32 y bootstrap inerte sin aplicación ni recursos.
Ver el [registro del paso B](../plans/2026-11-09-full-app-qa-step-b.md).
Después autorizó C: SESSION_SECRET nuevo y cifrado, DB/MEDIA exclusivamente en
Production QA; Preview sin D1/R2 ni secretos. No se hizo un nuevo despliegue.
Ver el [registro del paso C](../plans/2026-11-09-full-app-qa-step-c.md).
El dueño autorizó preparar D localmente, mostrando huella y destino antes de
importar. El paquete está preparado y validado; ver el [registro D](../plans/2026-11-09-full-app-qa-step-d.md).
Después autorizó el hash SQL y UUID exactos: la importación D se ejecutó una
vez y su lectura remota fue verificada. También autorizó subir los tres medios
del manifiesto SHA-256 `8df58b9b326428f3c7e8649fa2e85a779789f6445b3ed0947a3d11d51acc735b`
a `hampton-app-qa-media`: tres PUT, tres descargas con SHA-256/tamaño idénticos,
sin reintentos y bucket privado. E–F y operaciones posteriores siguen pendientes.
El dueño
puede aprobar varias filas expresamente, pero no se ejecutan etapas dependientes
si quedan destinos, hashes o verificaciones pendientes. No existe permiso global
para producción, push, activar History, ampliar privilegios o gastar sin límite.

| Paso | Operación que necesita sí escrito | Destino y condiciones |
| --- | --- | --- |
| A | Crear Pages, D1 y R2 nuevos | `hamptonjersey-qa`, `hampton-app-qa`, `hampton-app-qa-media`, en la cuenta verificada; sin SQL ni enlaces al negocio; sin compras/cambio de plan |
| B | Crear apps/políticas y token Access; publicar bootstrap inerte si hace falta | Solo raíz y wildcard del nuevo proyecto, apps/identidad descritas; sin bindings/datos y con prueba anónima de denegación |
| C | Generar/guardar secretos exclusivos QA y configurar bindings | Solo el entorno Production de `hamptonjersey-qa` y almacén privado del runner; Preview sin D1/R2/secretos; validar configuración efectiva |
| D | Importar esquema/seed y crear usuario ficticio; subir medios ficticios | UUID nuevo de D1 y bucket verificados, nombres anteriores; presentar antes hashes finales de SQL/manifiesto, estado vacío y usuario `qa-agent@example.test` |
| E | Descargar imagen fijada y crear/ejecutar contenedores privados de runner y proxy | Solo Docker Desktop de este PC, nombres `hampton-app-qa-runner` y `hampton-app-qa-egress`; red interna y restricciones anteriores; sin servicio/cron ni montajes del perfil del dueño |
| F | Publicar app QA y ejecutar pruebas de lectura/escritura/borrado de fixtures | Solo proyecto QA; presentar SHA fuente + hash artefacto/overlay antes de publicar; runner aislado de E, sin credenciales de provisión; no reset completo |
| Posterior | Reset total, cambios de plan/coste, cron, OAuth/proveedores sandbox, acceso de otras máquinas, nuevo push | Permisos separados para cada operación, recurso/UUID, archivo/hash o SHA correspondientes |

A–D están completados; E–F conservan su permiso pendiente para sus operaciones,
destinos y artefactos concretos. El permiso
posterior de preparación D produjo el paquete local; el permiso específico
siguiente permitió importar su SQL, ya verificado remotamente. Un permiso
adicional permitió subir los tres medios exactos, verificados por descarga.
C se concreta con los IDs devueltos por A; D con sus hashes y destinos; E con los
digests de imágenes y el manifiesto de red/montajes; F requiere E verificado y el
artefacto probado. E puede prepararse antes de D, sin credenciales Cloudflare.
Una autorización genérica como «haz QA» no sustituye las
confirmaciones específicas de SQL/secretos/Access/publicación que pidió el dueño.

## Retirada y recuperación

Ante un incidente, detener el ejecutor; no seguir escribiendo ni recrear recursos.
Revocación del token Access, rotación del secreto QA o retirada de bindings solo
con autorización de la operación; mantener bloqueo anónimo y conservar el estado
para diagnóstico saneado. No borrar una D1/bucket/proyecto como limpieza implícita.
Los datos del negocio y su configuración no son una vía de recuperación de QA.

## Fuentes de plataforma consultadas

- [Direct Upload y su límite de integración Git](https://developers.cloudflare.com/pages/get-started/direct-upload/).
- [Configuración de Pages y entornos](https://developers.cloudflare.com/pages/functions/wrangler-configuration/).
- [Cobertura Access de raíz pages.dev y previews](https://developers.cloudflare.com/pages/platform/known-issues/#enable-access-on-your-pagesdev-domain).
- [Tokens de servicio para agentes](https://developers.cloudflare.com/cloudflare-one/access-controls/authenticate-agents/#use-service-tokens).

Este archivo no contiene valores de credenciales ni configura recursos. A creó
recursos vacíos y B configuró Access con una identidad de servicio operativa y
bootstrap estático. C guardó SESSION_SECRET y los bindings de proyecto QA, que
se aplicarán en un despliegue futuro autorizado. Todavía no hay aplicación
publicada. D importó exclusivamente el esquema, datos ficticios y la identidad
QA en la nueva D1 y los tres medios ficticios en R2 privado, sin sesión de
aplicación ni pruebas publicadas.
Las etapas restantes conservan sus autorizaciones.
