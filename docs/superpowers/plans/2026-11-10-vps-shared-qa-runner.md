# Runner QA compartido en VPS · implementación

> **For agentic workers:** Usar superpowers:executing-plans y TDD. Preparar y revisar localmente; instalación/identidad/servicio remoto esperan aprobación del manifiesto final.

**Goal:** Permitir pruebas QA reproducibles por Codex, Hermes1 y Hermes2 con una sola ejecución mutable simultánea y evidencia por tarea.

**Architecture:** Dos contenedores aislados existentes por diseño E1, controlador Python root-owned de operaciones fijas, colas por volumen de taller y resultados canónicos fuera de ellos. Sin API nueva ni acceso Docker para los agentes.

**Tech Stack:** Python3.12+, Docker29, Compose, systemd, Playwright-core1.65, Node del contenedor; sin dependencias nuevas del host.

**Spec:** docs/superpowers/specs/2026-11-10-vps-shared-qa-runner-design.md.

## Global Constraints

- Solo QA con origen, D1 y R2 fijados; sin producción, push, migración ni cambios Access.
- Reutilizar y preservar los archivos sellados F/F1/E1 del PC.
- No leer valores de identidad durante preparación ni transferirlos sin sí específico.
- Sin UI de producto nueva: no aplica paleta/layout; seguridad y límites de red de DESIGN y E1 se conservan.
- Actividad compartida no verificada en este PC; trabajo de infraestructura QA solicitado en este chat, sin construir una tarea funcional duplicable.

## Review Focus

1. Entradas de cola con paths/commands/symlinks/hardlinks: rechazar antes de leer datos o ejecutar.
2. Jobs duplicados/inciertos o dos talleres: idempotencia y candado global; nunca repetir inciertos.
3. Valores QA en logs/env/args: stdin y tmpfs, salida cerrada, almacenamiento host protegido.
4. Daemon o contenedor incorrecto: endpoints locales fijados, IDs/imagen/red/montajes efectivos antes de identidad.
5. Smoke genérico presentado como tarea hecha: suites específicas, límites y pruebas locales separados.

## Tareas

- [x] Inventario remoto solo lectura de host, Docker y talleres; confirmar ausencia de conflictos.
- [x] Cola/cliente con pruebas de formato, seguridad de archivos, idempotencia y exclusión.
- [x] Controlador Linux, Compose y bootstrap con validaciones antes de identidad y parada ante incertidumbre.
- [x] Suite de History B y driver compartido; pruebas locales con datos ficticios.
- [x] Paquete público sellado, instrucciones de instalación y manifiesto con destinos exactos.
- [x] Revisión independiente; permiso único agrupado preparado para las operaciones descritas.
- [ ] Tras permiso: instalar, aislar, transferir identidad, ejecutar suites y habilitar cola; verificar ambos clientes.

## Ledger inicial

10-nov: HEAD/main/GitHub80ad03d iguales; cambios locales QA de esta misma sesión
conservados. No hay modificaciones versionadas de producto. Acceso SSH verificado
sin aceptar hostkeys nuevas. Docker29.5/cgroupv2 y memoria/disco suficientes,
imágenes QA todavía ausentes y volúmenes de ambos talleres identificados solo por
metadatos. Ningún valor de claves, configuración privada o env recopilado.

Preparación cerrada: manifiesto
2ed8614ed501ff04bfc71903f9a669f45b07754e6e3959067069eea2ea9cd232;
archivo064cbfa54593c51c314cc77d70d044c77561a8cf5e486192ab5043a8f7cc6226.
49 tests Python Windows (6 omitidos), 49 Linux temporales públicos (1 omitido),
12 Node offline y58 de regresión QA pasan. History B Miniflare14 API+4 UI pasa
con adapter ASSETS local; todavía no es evidencia publicada desde VPS.
Revisión independiente final sin hallazgos P0/P1/P2 abiertos en alcance local.
No se instaló, descargó imagen ni transfirió identidad. La siguiente operación
espera autorización explícita del destino y huella; no requiere push.

10-nov, ejecución autorizada: paquete íntegro instalado parcialmente; imágenes y
contenedores/redes QA nuevos creados. Aislamiento FAIL al llegar a Chromium;
20 controles previos pasan. Host con unprivileged_userns_clone=0. Ambos
contenedores QA parados y PID0 verificados, receipt fallido conservado. Ninguna
identidad leída/transferida, PC no parado, unidades/colas no creadas y ningún
smoke publicado ejecutado. No reintentar ni cambiar políticas del host compartido.
Ver docs/qa/vps-runner/execution-report.md. La última tarea permanece pendiente.

10-nov, investigación solicitada en el mismo host: no hay KVM expuesto. Se
preparó piloto opcional gVisor/systrap sin cambios de sysctl/AppArmor/daemon,
sin identidad ni red. Artefacto oficial release-20261102.0 verificado por SHA.
Manifiesto candidato7bd6db6fcaec7a7ba8ec63a9f680f4668645b66f46675a48f505e9f6e817e17a;
tar db7cb1b35df13176b35ef175044a44c27e4e12e62b6af79be07cfd5f169ffd1a.
6 Node+7 Python offline pasan; supervisor exige cgroup host antes del token GO
que libera Chromium. No se instaló ni ejecutó gVisor. Esta alternativa añade
software privilegiado y consumo acotado al host, aunque conserva sus políticas
y servicios previos. Solo se propone autorizar el piloto; no se da por demostrada
su compatibilidad ni se adapta/activa el runner completo bajo esa autorización.
Ver docs/qa/vps-runner/gvisor-probe/{investigation.md,README.md,proposal.json}.

10-nov, piloto7bd6 autorizado y ejecutado una vez: contenedor nuevo configurado
y verificado, unidad transitoria iniciada; contenedor exit1, supervisor exit2,
sin result.json. No aprobado; no se acredita sandbox/cgroup vivo ni causa exacta.
Parada/PID0 y retiro de shim PATH verificados, unidad descargada y evidencia
conservada. Cero cambios observados de estado de los81 contenedores previos;
Docker/containerd/SSH, políticas y defaults iguales. Sin identidad, PC, aplicación
publicada ni push. No reintentar sin diagnóstico revisado y autorización específica.
Ver docs/qa/vps-runner/gvisor-probe/execution-report.md.

10-nov, investigación posterior solicitada sin repetir: metadatos del probe parado
y8 binarios oficiales verificados solo en lectura. Reproducción local con
Readable real confirma destrucción de stdin por for-await/break; se corrige en
V2 con destroyOnReturn=false. SupervisorV2 conserva fase/causa saneadas ante
fallo. Flags privados CPU creación/ciclo1x y OCI seccomp true; check Seccomp2 en
Node antes de Chromium. La causa histórica exacta sigue no concluyente.
Manifiesto candidato d9dccc95971daf16209a42d5ba5baa4b8dc642c872a3be93f4ee9022207c707c;
tar f6eaf6bc624c3b8aa2ab796d8ba382b4a7211e5077814af43de4262820309d94.
V2:8Node+8PythonPASS; regresión V1:6Node+7PythonPASS. No se instaló, reactivó
launcher ni repitió el piloto. V2 espera sí específico para un intento offline
en rutas nuevas y su limpieza, sin identidad/app publicada ni cambios globales.
Ver docs/qa/vps-runner/gvisor-correction-v2/{README.md,investigation-report.md}.
