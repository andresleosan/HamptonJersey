# Corrección E1 propuesta · no aplicada

La ejecución del manifiesto E `6db42ba2693bd3740a1d6cb571a6a52cf54c30b9547aba5a1c4d452e4ebf5dcb`
descargó las dos imágenes fijadas y el SDK, creó los recursos aprobados y verificó
su configuración efectiva. Veinte controles anteriores al browser pasaron.
Chromium falló antes de poder ejecutar los otros dos controles. Ambos
contenedores quedaron **detenidos**, con redes, imágenes y staging conservados.
No hay identidad QA, cambios Cloudflare/D1/R2, publicación o F.

## Causa y delta mínimo

Chromium aborta en `sys_chroot("/proc/self/fdinfo/")`. El perfil oficial permite
esa llamada solo bajo `includes.caps=[CAP_SYS_CHROOT]`. Docker omite la regla
cuando se configura `cap_drop: ALL`, incluso si Chromium crea después un user
namespace. La prueba de lectura confirmó UID 0 dentro del namespace hijo y
EPERM en chroot. Es un defecto de compatibilidad del perfil que se preparó.

La propuesta derivada **añade únicamente `chroot` a la regla incondicional que
ya permite clone/setns/unshare**. No añade capabilities ni modo privileged, no
desactiva sandbox/seccomp y no cambia UID, límites, red, imágenes o montajes.
El kernel sigue exigiendo la capability correspondiente dentro del namespace
del proceso: el UID 1000 ordinario no obtiene permiso de chroot en el namespace
padre. Es una ampliación explícita del filtro de syscalls, pendiente de otro sí.
No se afirma todavía que baste para que arranque Chromium.

El Compose derivado es idéntico salvo el puntero a este perfil custom. No se
modifica ningún archivo original sellado por el permiso anterior.

## Corrección del diagnóstico del proxy

El diagnóstico original también tenía dos errores de construcción de pruebas:
`Request.make` recibe body como tercer argumento, y normaliza Host desde URL.
La versión corregida usa `headers=` y modifica el Host adversario después de
crear la petición. Esa misma versión pasó dentro de la imagen real mediante
stdin, sin DNS ni tráfico real y sin modificar archivos montados. Sus bytes se
proponen ahora para sustituir solo el diagnóstico en el staging del proxy.
La política `egress_addon.py` y `policy.py` no cambian.

## Operaciones que necesitan el nuevo permiso E1

1. Revalidar los dos manifiestos, hashes y recursos existentes detenidos.
2. Ejecutar `apply_diagnostic.py --authorized-proposal-sha256 <huella-nueva>`:
   cambia únicamente `test-results/qa-agent-runtime/egress-package/proxy_selftest.py`.
3. Reiniciar **solo** el proxy existente `hampton-app-qa-egress`, sin recrearlo,
   con CA nueva únicamente en su tmpfs, y comprobar salud y permisos de la CA.
4. Recrear **solo** `hampton-app-qa-runner` con este Compose/perfil derivado,
   mismos digest, bind mounts, redes y restricciones. No borrar redes, imágenes,
   fixtures, resultados ni datos. No volver a descargar dependencias.
5. Verificar inspect efectivo contra el original más este único delta; ejecutar
   diagnóstico corregido del proxy y los 22 controles originales del runner.
6. Ante cualquier nuevo fallo, detener sin introducir identidad, sin bajar más
   controles y sin entrar en F. Inspeccionar estado antes de reintentar.

Preparación verificada: pruebas offline del delta, sintaxis Python y validación
Compose. **Este perfil no se ha aplicado ni probado en contenedor.**
La aprobación anterior no se extiende silenciosamente a esta modificación.

Fuentes de la causa:

- [Compilación de reglas condicionales Docker](https://github.com/moby/profiles/blob/main/seccomp/seccomp_linux.go).
- [chroot y capacidades](https://man7.org/linux/man-pages/man2/chroot.2.html).
- [Capabilities en user namespaces](https://man7.org/linux/man-pages/man7/user_namespaces.7.html).
- [Chromium: ChrootToSelfFdinfo](https://chromium.googlesource.com/chromium/src/+/main/sandbox/linux/services/credentials.cc).
