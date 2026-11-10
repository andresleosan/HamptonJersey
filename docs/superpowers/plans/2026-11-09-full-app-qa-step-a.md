# QA completa · paso A · plan y registro

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans para ejecutar los pasos autorizados, sin extender esta autorización a B–F.

**Goal:** Crear exclusivamente Pages `hamptonjersey-qa`, D1 `hampton-app-qa` y R2 privado `hampton-app-qa-media` en la cuenta Cloudflare verificada de Hampton.

**Architecture:** Tres recursos nuevos y vacíos, sin conectarlos entre sí ni al negocio. Verificación remota antes y después de cada creación, con destinos explícitos y Wrangler 4.148.0; ante resultado incierto, leer antes de decidir cualquier reintento.

**Tech Stack:** PowerShell, Python para filtrar salidas, Wrangler 4.148.0.

**Spec:** `docs/superpowers/specs/2026-11-09-full-app-qa-design.md`.

## Global Constraints

- Autorización escrita del dueño en este chat: diseño aprobado y paso A para los tres nombres anteriores; sin cambio de plan ni tocar producción.
- Sin Access, secretos, SQL, usuarios, bindings, objetos, despliegues, cambios DNS, cron, push ni borrados.
- No buscar/imprimir credenciales, correos ni identificadores personales. El ID de cuenta se usa solo en memoria como selector explícito y se contrasta mediante recursos conocidos.
- No aceptar automáticamente ningún cambio de plan, compra, suscripción o activación de servicio de pago. Si se solicita, detenerse.
- Registrar el UUID D1 nuevo y estados no sensibles después de verificarlos. No usar UUID inventados ni recuperar destinos mediante nombres ambiguos.
- Las consultas D1 de este paso son únicamente `SELECT` de esquema o metadatos; no se importan migraciones.

## Review Focus

- Cuenta equivocada: exigir el proyecto Pages empresarial y UUID de D1 conocidos en la cuenta seleccionada, solo en lectura.
- Colisión de nombres: detenerse ante recurso previo o destino no correspondiente, sin reutilización/borrado implícitos.
- Creación incierta: consultar inventario/estado después del intento; no repetir creaciones sin resolverlo.
- R2 público: confirmar configuración efectiva de URL de desarrollo y dominios antes de declarar bucket privado.
- Pages no vacío: exigir ausencia de despliegues y bindings de datos en el recurso nuevo; no publicar un bootstrap en A.

## Ejecución del paso A

**Files:** Este registro y actualización de estado documental del diseño. Ningún archivo de aplicación ni TOML empresarial.

- [x] Verificar sintaxis de comandos de la versión fijada y seleccionar la cuenta; comprobar recursos conocidos en lectura.
- [x] Releer inventarios y confirmar los tres nombres libres inmediatamente antes de crear.
- [x] Crear Pages con nombre explícito y rama de referencia `main`, mediante Direct Upload; verificar inventario y cero despliegues.
- [x] Crear D1 con nombre explícito y ubicación automática; verificar UUID nuevo, separación de negocio/History y esquema vacío salvo internos.
- [x] Crear R2 con nombre explícito y valores predeterminados, sin activar URL pública ni adjuntar dominios; verificar estado privado/vacío en la medida expuesta por la API.
- [x] Registrar resultados y límites de lectura; confirmar que solo hay cambios documentales locales y ningún push.

## Registro de ejecución

- Cuenta autenticada única, elegida explícitamente para cada operación. Coinciden
  proyecto Pages empresarial y UUID conocidos de D1 empresarial/History, en lectura.
- Inventarios precreación: los tres nombres estaban libres. El listado JSON de
  Pages usa `Project Name`, no `name`; el primer guardia se detuvo sin escritura y
  se corrigió la interpretación antes de crear recursos.
- Primer intento Pages, salida 1: inventario posterior confirmó ausencia del
  proyecto. La lectura específica de Workers devolvió script inexistente
  (10007). No se repitió sin reconciliar. El código de Wrangler 4.148.0 contempla
  delegación automática de Pages a Workers para sesiones de agentes; se usó su
  opción explícita `pages project create --force` para exigir Pages, sin desplegar.
- Pages: creación explícita salida 0; proyecto `hamptonjersey-qa`, dominio asignado
  `hamptonjersey-qa.pages.dev`, proveedor Git `No`, listado de despliegues vacío.
  `pages download config` se ejecutó solo hacia una carpeta temporal y terminó con
  salida 0: raíz/Production QA y Preview reportan cero bindings D1 y R2.
- D1: creación de `hampton-app-qa` salida 0 con actualización automática de config
  deshabilitada. UUID verificado `53bc4af9-7250-44fe-8f90-6e415fda1034`, distinto
  del negocio y History. Un TOML efímero exclusivo de lectura resolvió el binding
  al UUID nuevo: `d1 info` reporta 0 tablas de usuario y el SELECT a `sqlite_master`
  encontró solo esquema interno. No se importó SQL.
- R2: creación de `hampton-app-qa-media` salida 0 con actualización automática de
  config deshabilitada. `bucket info --json` confirma nombre, clase Standard,
  `object_count=0` y `bucket_size=0 B`. Son métricas de R2, no un listado S3
  consistente; además, este paso no realizó ninguna carga de objetos. Lecturas
  `dev-url get` y `domain list`, ambas salida 0: acceso r2.dev deshabilitado y cero
  dominios personalizados. No se modificó una política de publicación.
- Cierre verificado a `2026-11-10T03:56:39Z` (9-nov, America/Bogota). Los tres
  recursos nuevos existen. No hay despliegues, importaciones, cuenta de prueba
  operativa, Access, secretos nuevos, bindings remotos ni cambios de plan.
- No se ha ejecutado B–F. Solo preparación documental local; código, TOML
  empresariales y SHA de main permanecen sin modificaciones ni push.
- [Manifiesto de recursos sin credenciales](../../qa/full-app-qa-resources.json).
