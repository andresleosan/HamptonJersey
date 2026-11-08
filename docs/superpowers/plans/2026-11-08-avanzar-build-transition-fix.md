# Reparación del cambio de plan a build

Autorización: Luis permite corregir y publicar el cliente y recuperar la reserva de BUS-21 para Hermes h1, conservando sus cambios y commits. Base: main 8b455a6bc9bc6af0647b3b710e9778a8d3a3873a.

## Causa y alcance

`resume --mode build` y `accept-handoff --mode build` comprobaban archivos guardados usando el modo anterior. En una investigación documental, JSON y HTML reservados quedaban bloqueados por la restricción Markdown de plan antes de consultar al servidor. La reparación afecta únicamente al cliente portable, sus pruebas y este contrato; no cambia el coordinador desplegado, catálogo, permisos, credenciales, red ni producto.

El preflight usa el modo solicitado validado y conserva el alcance de escritura, auditoría Git, aprobación congelada, procedencia y generación. La petición sigue pasando por la autorización del servidor. Antes de guardar autoridad local, una respuesta a resume debe confirmar el modo solicitado. Un resultado incierto conserva la operación para repetirla con su mismo identificador. Una entrega submitted no cambia de modo durante una aceptación.

## Aceptación y comprobación

- Reproducir el rechazo de JSON/HTML reservados antes de cambiar producción.
- Permitir su transición explícita en resume y aceptación, conservando commits y archivos.
- Mantener el rechazo sin cambio de modo y para archivos fuera del alcance de escritura.
- Conservar autoridad local si el servidor rechaza la transición.
- Rechazar respuestas de éxito que no confirmen el modo solicitado.
- Ejecutar suite del cliente, suite del proyecto, runtime del coordinador, build y check:release; revisión independiente antes de publicar.
- Verificar main remoto; actualizar h1 mediante su SSH y Git protegidos, preservando sus commits.
- Recuperar la reserva sin contacto hacia el mismo actor/sesión/checkout/host. h1 acepta la nueva generación con build y confirma su estado. La recuperación no declara terminada BUS-21 ni inicia BUS-22.

## Reglas aplicables

Sin interfaz: paleta, tipografía, responsive y Playwright no aplican. Se conserva la regla de DESIGN.md §Seguridad frontend: la validación del cliente ayuda y el servidor verifica la autoridad. No se añaden librerías (§Rendimiento). Las reglas del proyecto mantienen secretos fuera de Git y de salidas, identidad instalada de cada cliente, ninguna ampliación de acceso y ninguna nueva consulta periódica o servicio permanente. Se usan systematic-debugging para la causa, test-driven-development para las regresiones y requesting-code-review para la revisión independiente. Las skills visuales no aplican a este cambio del CLI.

## Evidencia

Las ocho regresiones nuevas fallaron por plan_scope antes del cambio y pasan tras la reparación. La reconciliación final prueba el mismo cuerpo e identificador de operación, la adopción de generación confirmada y el cierre de pending. Suite del cliente: 82/82; suite del proyecto: 906 Node y 14 Python; runtime: 26/26; build y check:release: correctos. Build conserva el aviso de tamaño de bundle del panel, sin cambios de interfaz. La revisión independiente no encontró bloqueos y su recomendación de ampliar la cobertura de reintento quedó aplicada. La recuperación real se registra en el relevo privado al cerrar, sin incluir credenciales ni identificadores privados en este documento público.
