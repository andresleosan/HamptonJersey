# Investigación: Chromium con sandbox en la misma VPS

10-nov-2026. Preparación solicitada por el dueño después del fallo de aislamiento
del manifiesto2ed8614e. Solo se hizo inventario remoto de lectura y se descargó
el artefacto público oficial al PC; no se ejecutaron binarios nuevos en la VPS.

## Evidencia del destino

- Kernel6.8.0-147-generic; userns_clone0; AppArmor userns restriction1.
- Docker29.5, cgroupv2 con driver systemd, runtime predeterminado runc. Los
  contenedores QA anteriores siguen detenidos; identidad QA ausente.
- /dev/kvm ausente y sin flags vmx/svm expuestos. No hay qemu, firecracker,
  runsc o bwrap instalados. El lanzador runsc shim propuesto y sus directorios
  nuevos no existen. Cero consumidores previos de runtime runsc encontrados.
- /usr/local/bin es root-owned sin escritura de grupo/otros. No se encontraron
  los dos archivos globales opcionales config.toml de runsc; no se leyeron perfiles
  personales, claves, variables de entorno, logs o filas empresariales.

## Opciones contrastadas

1. **Modificar el kernel compartido y añadir AppArmor QA.** Es menos software
   nuevo, pero unprivileged_userns_clone es un bloqueo global. Docker no soporta
   convertir sysctls que afectan al host en ajustes exclusivos de un contenedor.
   Una regla AppArmor no elimina ese bloqueo. Esta opción cambiaría una política
   del host compartido y no se propone bajo el requisito actual.
2. **Capacidades amplias/SUID o flags que desactivan sandbox.** No preservan la
   frontera UID1000/sin capacidades/no-new-privileges solicitada. Descartados.
3. **VM anidada.** La vía acelerada no está disponible en el inventario. Emular
   otra máquina por software es una alternativa más grande y costosa; no mínima.
4. **Runtime gVisor opcional, piloto offline (propuesta).** Virtualiza el entorno
   de syscalls de la aplicación. systrap no requiere KVM; Docker documenta usar
   un shim nuevo en PATH por nombre calificado sin editar ni recargar el daemon.
   Solo la prueba nueva pide ese runtime; runc sigue siendo el predeterminado.
   No se afirma compatibilidad Chromium hasta observar el sandbox real allí.

## Conclusión y frontera de autorización

Hay una alternativa razonable que conserva las políticas y servicios actuales:
probar gVisor/systrap solo en un contenedor nuevo sin red. Es una hipótesis
verificable, no una solución ya demostrada. La documentación de compatibilidad
de gVisor también exige probar la carga concreta. Primero se autoriza ese piloto;
si funciona, se prepara la adaptación del runner completo en otro manifiesto.

El cambio añade archivos públicos y un shim opcional al host, ejecuta un runtime
nuevo durante la prueba y comparte CPU/RAM. No equivale a impacto físico cero ni
a ausencia de nueva superficie de software privilegiado. Su alcance evita cambiar
configuración, políticas y reinicios de producción; no promete riesgos nulos.

La aceptación exige resultado Chromium completo, parada del contenedor nuevo,
evidencia host de cgroups efectivos y comparación de estado previo/posterior.
Un resultado de Chromium verde sin esas evidencias externas no aprueba el piloto.

## Fuentes primarias consultadas

- [Docker: shims por contenedor sin configurar daemon](https://docs.docker.com/engine/daemon/alternative-runtimes/).
- [Docker: sysctls compatibles y prohibición de modificar el host desde --sysctl](https://docs.docker.com/reference/cli/docker/container/run/).
- [gVisor: plataforma systrap predeterminada y KVM opcional](https://gvisor.dev/docs/user_guide/platforms/).
- [gVisor: kernel de aplicación y preparación privilegiada del sandbox](https://gvisor.dev/docs/architecture_guide/intro/).
- [gVisor: compatibilidad pendiente de probar cada carga](https://gvisor.dev/docs/user_guide/compatibility/).
- [Release oficial fijada y checksums](https://github.com/google/gvisor/releases/tag/release-20261102.0).
- [Chromium: namespaces y seccomp en Linux](https://chromium.googlesource.com/chromium/src/+/main/sandbox/linux/README.md).
- [Ubuntu: mediación AppArmor de user namespaces](https://documentation.ubuntu.com/security/security-features/privilege-restriction/apparmor/).

Evidencia de preparación: test-results/qa-vps-sandbox-options-readonly.json,
qa-vps-gvisor-preparation-preflight.json y qa-vps-gvisor-host-cgroup-preflight.json.
