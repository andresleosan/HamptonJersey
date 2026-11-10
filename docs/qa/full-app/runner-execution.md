# Paso E completado tras E1 autorizada

Resultado verificado: **22/22 controles de aislamiento y selftest del proxy
correctos**, incluido arranque de Chromium con sandbox y bloqueo de host ajeno.
Registro: `runner-correction-e1-execution.json`.

El dueño autorizó expresamente la propuesta E1 SHA-256
`b46184c3b4b548e483e6411b3ec31f54da512f6205c08b54fb9cc5d3d35314da`.
Se comprobaron sus siete archivos, los catorce del manifiesto E original,
contexto Docker Desktop local, IDs de contenedores detenidos y redes existentes.
Todos los archivos y manifiestos originales permanecen inalterados.

Se sustituyó únicamente el diagnóstico permitido en el staging del proxy.
El proxy existente se inició sin recreación y conservó su ID; se recreó solo
el runner con el perfil E1 exacto. No hubo descargas, imágenes nuevas ni cambios
de SDK, red, bind mounts, UID, límites o capabilities. Inspect efectivo confirmó
todos los controles y que los IDs de las dos redes no cambiaron.

La llamada chroot permitida en el filtro custom resolvió el fallo de arranque
observado. Se conservan sandbox, cap_drop ALL, NoNewPrivs y raíces read-only.
Pasaron los bloqueos de salida directa, DNS externo, host/LAN/metadata y destinos
no permitidos; también los cambios adversarios de Host/SNI dentro de TLS.
El selftest corregido del proxy pasó con su API real y DNS simulado, sin red real.

La CA se generó en tmpfs privado del proxy con UID1000 y permisos exclusivos
del propietario. Se comprobaron solo metadatos, nunca los valores. No se instaló
CA en Windows, no se exportó su clave y `/run/qa` del runner está vacío.

Ambos contenedores quedan en ejecución inerte entre comandos, sin puertos
publicados, API de control, cron ni tareas de aplicación. El proxy está sano.
**No se cargaron credenciales QA ni se inició F**, publicación o smoke autenticado.
No hubo cambios de producción, Cloudflare, D1/R2 o push.

Los archivos bajo `runner/` y `runner-correction-e1/` y sus propuestas se
conservan como snapshots históricos sellados, incluso donde describen permisos
pendientes al prepararse. El estado actual está en este registro, el recibo E1
y `../full-app-qa-resources.json`. El recibo E original preserva el fallo anterior.
