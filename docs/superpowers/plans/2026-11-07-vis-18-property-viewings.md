# VIS-18 · Activación y horarios de visitas por propiedad

Solicitud directa de Luis, 7-nov-2026. Base origin/main 5e9c860. Prioridad urgente en el plan maestro vigente de reconciliación del 7-nov.

## Contrato

- Cada propiedad tiene `viewings_enabled` (0/1, inicialmente 1) y `viewing_hours` (null = horario general, array no vacío = franjas semanales propias). Franjas `{day:0..6,start:HH:MM,end:HH:MM}`, Europe/Jersey; máximo 21, sin solapamientos, fin posterior al inicio.
- El editor reutiliza ViewingAvailability de REG-17 (commits d9a48fe,1695920,0e7f4b5). Estado explícito Enabled/Disabled y acciones Deactivate/Activate, siguiendo el inglés de la interfaz. Se guarda con Save, con estado sin guardar visible.
- Horario propio intersecta disponibilidad del negociador y sus excepciones/reservas. La visita completa debe caber en la franja. El canal público conserva sus días y horizonte existentes. Desactivar impide nuevas reservas y reprogramaciones, pero conserva citas previas y su gestión.
- El servidor comprueba las reglas al ofrecer huecos, reservar y reprogramar; vuelve a comprobarlas en la escritura para evitar una reserva con una política modificada entretanto. Consultas generales sin propiedad mantienen su funcionamiento.
- Web y panel recargan horarios al cambiar de propiedad y descartan respuestas antiguas. Horario vacío/malformado no se guarda como horario propio.

## Ejecución

1. Migración 0027, validación y contrato de API; pruebas de reglas y carreras.
2. Editor y reservas del panel con componente existente; validación, guardado, teclado.
3. Formulario público con disponibilidad por propiedad y estados claros.
4. Pruebas unitarias, compilación, release, recorridos locales 1280/390 y revisión independiente.
5. Registrar resultado real en este plan, ESTADO, checklist y plan maestro vigente. Publicar según autorización de la sesión, aplicando antes las migraciones requeridas y verificando despliegue.

## Decisiones

El botón nombra la acción (Deactivate cuando están activadas), acompañado por el estado, para evitar que una etiqueta de estado parezca una acción. Las citas existentes se conservan; este control afecta a nuevas reservas y cambios de horario. No se construye aquí la coordinación multiparte VIS-17.

## Resultado

Construcción y revisión terminadas. Publicación pendiente de ejecutar y verificar.

- 689 pruebas Node y 14 Python aprobadas; build y check:release aprobados.
- Recorrido completo aprobado: public, urls, admin y reg17 (salida 0).
- VIS-18 en navegador a 1280/390: guardar, recargar, desactivar, horario propio, vacío inválido, horarios públicos e internos, respuestas atrasadas y teclado.
- Revisión independiente: sin Critical/Important pendientes. Detectó y corrigió conservación del borrador al alternar modos y bloqueo de controles mientras Save está en curso; ambos verificados con respuesta demorada a 1280/390.
- 19 regresiones del servidor: límites de ventana, intersección, domingo interno, consulta general, visibilidad pública y carreras de reserva/reprogramación sin escrituras de avisos/eventos si se rechazan.
- Migración necesaria: 0027. Antes de esta tarea 0026 ya estaba aplicada en producción. Punto de recuperación previo conservado localmente en /tmp/hampton-vis18-before-migration.json.
- Evidencia local: /tmp/hampton-vis18-tests.log, /tmp/hampton-vis18-full-e2e-final.log, /tmp/hampton-vis18-browser-final.log y /tmp/vis18-review-saved-{1280,390}.png. El primer recorrido general falló en Sales durante compilaciones concurrentes; se reinició con el artefacto estable y pasó completo.

