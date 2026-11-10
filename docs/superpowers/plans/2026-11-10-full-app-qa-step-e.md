# Paso E · preparación del runner aislado

> **For agentic workers:** Usar superpowers:executing-plans; preparar localmente y detenerse antes de pull/create/start hasta el sí específico para los artefactos finales.

**Goal:** Presentar imágenes fijadas por digest, red, montajes y controles revisables antes de ejecutar el runner QA.

**Architecture:** Runner Playwright Linux/amd64 no root en bridge interno con gateway `isolated`; proxy mitmproxy separado con salida, HTTPS validado y allowlist exacta. Sin secretos reales en E: las pruebas negativas deben pasar antes de cualquier habilitación de identidad en F.

**Tech Stack:** Docker Desktop Linux 29.9.1, Compose 5.6.0, Playwright 1.65.0/noble, mitmproxy 12.3.1; política Python estándar y diagnóstico Node.

**Spec:** `docs/superpowers/specs/2026-11-09-full-app-qa-design.md`.

## Límites globales

- Solo preparación local y metadatos públicos de imágenes; no pull/build/create/start.
- Sin producción, D1/R2, Access, credenciales existentes, publicación, push ni F.
- Contenedores futuros: `hampton-app-qa-runner`, `hampton-app-qa-egress`.
- UID/GID 1000, cap_drop ALL, no-new-privileges, raíz read-only y tmpfs.
- No perfil Windows, checkout completo, `.git`, socket Docker ni credenciales de provisión.
- No puertos publicados; solo QA exacta y Turnstile por proxy, sin salida directa del runner.
- No aislamiento declarado hasta pruebas negativas de Docker/Chromium después del permiso E.

## Review Focus

1. Bridge interno con IP de host o bypass DNS: gateway isolated y DNS local sin reenvío externo.
2. CONNECT hacia IP compartida con otro hostname: inspeccionar HTTPS, Host y destino antes de conectar.
3. DNS público que devuelve LAN/metadata: resolver una vez, rechazar cualquier IP no global y fijar la IP conectada.
4. Montajes demasiado amplios o creaciones implícitas: tres carpetas dedicadas, create_host_path=false.
5. Secretos/flujo HTTP en resultados: E sin secretos, proxy sin dumps/logs y diagnóstico de estados fijo.

## Archivos y tareas

- `docs/qa/full-app/runner/`: Compose, imágenes, seccomp upstream, política proxy,
  diagnóstico de aislamiento, staging permitido y documentación.
- `tests/test_full_app_qa_runner.py`: entradas adversarias de política y contrato de Compose.
- `docs/qa/full-app/runner-proposal.json`: huellas de todos los archivos y autorización pendiente.

- [x] Resolver manifiestos oficiales y digests Linux/amd64 sin descargar capas.
- [x] Pruebas RED y política/configuración mínima GREEN.
- [x] Validar Compose sin ejecutar y revisar fronteras de red/montajes.
- [x] Revisión independiente; resolver hallazgos materiales.
- [x] Fijar huellas finales y presentar permiso concreto E; F no incluido.

## Decisiones de preparación

Docker local verificado: contexto `desktop-linux`, pipe Docker Desktop Linux,
daemon Linux/amd64 y Compose. Nombres QA de contenedores/redes aún libres.
Los CIDR `172.30.230.0/28` y `172.30.231.0/28` no colisionan con redes Docker
ni rutas IPv4 actuales del host; se repetirán estas comprobaciones al ejecutar.

Ruling: usar inspección HTTPS en el proxy, en vez de túnel CONNECT opaco — una
allowlist de nombres CONNECT no impide cambiar Host dentro de TLS sobre IP
compartida — añade mitmproxy fijado y CA efímera solo dentro de tmpfs del proxy.
La CA no se instala en Windows. El contexto Chromium de diagnóstico confiará
solo en el proxy de esta red; el proxy verifica certificados del servidor.
Esta concreción forma parte del permiso E pendiente, no de F.

Ruling: no inyectar secretos QA en E — basta acreditar aislamiento antes de
introducir identidad — las sesiones y cabeceras Access por origen se implementan
en el artefacto F revisado, sin trasladar credenciales de provisión.

## Registro de preparación

RED inicial: 7 pruebas fallaron por ausencia de política/Compose. Stager:
regresión RED y GREEN para límites de extracción. Revisión independiente
encontró que `client.error` no aborta por sí solo en ClientHello de mitmproxy
12.3.1, y que la imagen declara un volumen persistente implícito. Dos pruebas
RED añadidas; corregidas con latch por client-id y tmpfs explícito sobre
`/home/mitmproxy/.mitmproxy`. También se rechazaron rutas NTFS ADS en el tar.
Resultado final: 10/10 pruebas offline, sintaxis Node/Python y Compose válidos.
Revisión independiente final sin hallazgos materiales pendientes.

Preparados 22 controles runtime del runner y un selftest del proxy con su API
real, ambos pendientes de ejecución autorizada. No se ha descargado el SDK ni
las capas de las dos imágenes; las referencias fijadas no están presentes en
el daemon. No existen contenedores/redes QA ni staging runtime en este PC.
Los metadatos públicos y el archivo seccomp son los únicos assets upstream
descargados durante la preparación. No se leyó ningún secreto ni dato de negocio.

E requiere sí específico para el manifiesto `docs/qa/full-app/runner-proposal.json`:
descarga de dos imágenes fijadas y SDK, creación de dos redes/contenedores,
CA de inspección efímera en tmpfs y pruebas de aislamiento sin identidad QA.
F, producción, credenciales de provisión, app publicada, push y cambios de
configuración Cloudflare permanecen excluidos.

Propuesta final: SHA-256
`6db42ba2693bd3740a1d6cb571a6a52cf54c30b9547aba5a1c4d452e4ebf5dcb`.
14 archivos sellados; validación fresca 10/10, sintaxis y Compose normalizado
correctos. Los blobs de configuración de ambos digests oficiales se contrastaron:
Playwright no declara volúmenes y mitmproxy declara solo el destino ya cubierto
por tmpfs. Engine reporta seccomp builtin y 7884038144 bytes de memoria.
La inspección local confirma imágenes fijadas ausentes, cero contenedores/redes
QA y staging runtime inexistente. No se hizo pull/create/start ni acceso a QA.

## Ejecución E autorizada posteriormente · detenida sin F

El dueño autorizó expresamente el manifiesto anterior, incluida CA efímera y
pruebas. Preflight repitió los 14 hashes, contexto/endpoint Docker Desktop local,
Linux/amd64, seccomp, nombres libres y CIDR sin colisiones. Dos imágenes por
digest y SDK por integridad verificados; staging solo de la allowlist. Un único
Compose up creó dos redes y dos contenedores; proxy sano y runner inerte.
Inspect efectivo verificó imágenes/IDs, UID, cap_drop ALL, NoNewPrivs, root ro,
binds exactos, tmpfs, ausencia de volúmenes durables/puertos, límites, DNS,
networks, IPC privado y seccomp exacto. No se leyó Env ni credenciales.

El selftest original falló por errores de autoría del diagnóstico: Request.make
trata su tercer argumento como body y normaliza Host desde URL. La comprobación
auxiliar por stdin, con headers= y Host adversario asignado después, pasó con
API real y DNS simulado. Ningún archivo original ni montado fue modificado.

El diagnóstico original del runner pasó 20 controles anteriores al browser.
Chromium no arrancó: abortó en sys_chroot('/proc/self/fdinfo/'). El perfil
oficial condiciona chroot a CAP_SYS_CHROOT, incompatible con cap_drop ALL al
compilarse el filtro. Se verificó en lectura namespace hijo UID 0 y chroot EPERM.
No se desactivó sandbox ni se añadieron capabilities. Dos lanzamientos auxiliares
de diagnóstico confirmaron el mismo fallo; no hubo reintentos de despliegue.

Se verificó CA existente solo en tmpfs, UID1000 y permisos privados de archivo y
directorio, sin leer sus valores. Luego se detuvieron ambos contenedores,
conservando imágenes, staging y redes. E está **incompleto**, no aprobado como
aislamiento utilizable. F no se inició; no se cargó identidad QA ni hubo cambios
de producción/Cloudflare/D1/R2, publicación o push.

Corrección separada, todavía sin aplicar:
`docs/qa/full-app/runner-correction-e1-proposal.json`, SHA-256
`b46184c3b4b548e483e6411b3ec31f54da512f6205c08b54fb9cc5d3d35314da`.
Solo permite chroot incondicional en el perfil custom y corrige el diagnóstico;
Compose difiere únicamente en la ruta al perfil. Revisión independiente sin
hallazgos materiales; 3/3 pruebas del delta más 10/10 originales offline.
Reiniciar proxy y recrear solo runner con este delta exige nuevo sí específico,
porque cambia el seccomp sellado por la autorización original. No se afirma
que la corrección garantice arrancar Chromium hasta probarla con ese permiso.

Evidencia actual: `docs/qa/full-app/runner-execution-receipt.json`.

## E1 posteriormente autorizada · E completado

El dueño autorizó exactamente E1 SHA-256
`b46184c3b4b548e483e6411b3ec31f54da512f6205c08b54fb9cc5d3d35314da`,
reinicio del proxy, recreación solo del runner y repetición de pruebas, sin F.
Preflight: los 21 archivos sellados coinciden, contexto local correcto,
contenedores detenidos e IDs/redes exactos. Script de actualización revisado
cambió solo el diagnóstico del staging; manifiestos/archivos fuente intactos.

Proxy reiniciado con mismo ID, sano; solo runner recreado con el perfil E1.
Inspect confirmó el delta permitido y todos los controles anteriores: mismas
imágenes, redes y montajes, UID1000, cap_drop ALL, NoNewPrivs, seccomp exacto,
root ro, tmpfs, límites, IPC privado y ningún volumen durable o puerto publicado.
Sin descargas nuevas ni cambios de SDK.

El diagnóstico corregido del proxy pasó con API real y sin tráfico/DNS real.
El diagnóstico original del runner pasó **22/22**, incluidos Chromium con
sandbox activo y rechazo de host ajeno. Una ejecución de cada diagnóstico.
CA nueva en tmpfs, UID1000, archivo y directorio privados: solo stat, sin leer
valores. Tmpfs QA del runner vacío. Cierre a `2026-11-10T05:57:45.430448Z`.

E completado. Contenedores inertes entre comandos, proxy sano, sin identidad QA,
sin producción/Cloudflare/D1/R2, publicación, push o F. Recibo vigente:
`docs/qa/full-app/runner-correction-e1-execution.json`. El fallo original queda
conservado como evidencia histórica, enlazado al resultado E1 satisfactorio.
