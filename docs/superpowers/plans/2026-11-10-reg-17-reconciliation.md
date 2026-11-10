# REG-17 · Plan de conciliación documental

**Objetivo:** reflejar en el checklist la captura de franjas ya integrada y distinguirla del consumo pendiente por VIS-17.
**Spec vigente:** [disponibilidad](../specs/2026-11-07-reg-17-availability-design.md). Es una corrección documental acotada; no se altera producto, interfaz, permisos ni datos.
**Base:** `1b8e41bfebdb788270575375643531032526909b` en `main` y GitHub, verificado el 10-nov-2026.

## Alcance y decisiones

- Mantener REG-17 **parcial**: capturar franjas no demuestra que VIS-17 las reutilice. Nada de lo que se guarde reserva una visita.
- Atribuir 0026 aplicada a la reconciliación y relevo históricos, sin afirmar una consulta nueva de producción. No repetir migración ni publicación previa.
- Actualizar `docs/roadmap/tasks/REG-17.json`, la aceptación en `work-units.json`, sus derivados del generador, `ESTADO.md` y el ledger existente. No cambiar la prioridad ni el alcance de otras tareas.
- DESIGN.md, colores, tipografía y estados visuales: no aplican a esta corrección de datos documentales; conservar el render actual. Seguridad: no copiar datos reales ni credenciales a evidencias. Rendimiento: no añadir solicitudes ni dependencias a la aplicación.
- Brainstorming/grill-me: el spec y los registros previos resuelven el alcance; no se introduce una decisión de producto. Writing-plans/ejecución: lista y evidencia concretas. Verificación: ejecutar pruebas focales y comprobar consistencia de fuentes y derivados. Skills de nueva interfaz/rediseño no aplican.

## Pasos

- [x] Verificar commit, migración, código, pruebas existentes y documentación de publicación.
- [x] Ejecutar pruebas focales de validación, registro, ausencia de reserva y concurrencia.
- [x] Corregir ficha, aceptación, derivados y estado, conservando VIS-17 pendiente.
- [x] Comprobar JSON, catálogo y diff; intentar la comprobación visual y registrar si el navegador local no está disponible.
- [x] Documentar resultados y límites; revisión independiente completada. La comprobación visual y la publicación permanecen pendientes.
