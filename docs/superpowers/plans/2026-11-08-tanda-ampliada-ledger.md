> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# Tanda ampliada · Registro de planificación

8-nov-2026 · Copia `[copia local de planificación]`, GitHub main verificado en `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`. Solo planes, sin reservas, cambios de infraestructura o despliegue.

| Tarea | Documento | Estado |
|---|---|---|
| PUB-03 | `2026-11-08-pub-03-redes.md` | Preliminar: PRE-02, cuentas y contenido. |
| PUB-15 | `2026-11-08-pub-15-portales.md` | Preliminar: portales y contratos. |
| PUB-16 | `2026-11-08-pub-16-estados-canales.md` | Preliminar: EST-17 y reglas de canales. |
| PRE-14 | `2026-11-08-pre-14-respaldo.md` | Preliminar: destino, claves y recuperación. |
| PRE-16 | `2026-11-08-pre-16-fotos-equipo.md` | Listo para construir el traslado de fotos; descarga, validación de imágenes y pruebas son pasos de ejecución; no cierra el resto de PRE-16. |

Spec compartida `docs/superpowers/specs/2026-11-08-tanda-ampliada-design.md`. Time Travel y límites contrastados con documentación oficial, no con la cuenta de Hampton. Revisión independiente completada: confirmó las dependencias, la necesidad de proteger medios no públicos y comprobar coherencia D1/R2, y que las fotos se usan también en reservas; incorporado en los planes; no se ejecutaron pruebas de producto. Planes no publicados. Tours 3D más adelante.

Decisiones de Luis: publicaciones en redes requieren aprobación humana y quedan fuera del plan vigente (alcance exacto por aclarar); no hay portales inmobiliarios por ahora y se añadirán más adelante; los respaldos irán a almacenamiento privado en Cloudflare. No se confunde Facebook con un portal inmobiliario.

Luis confirma: Facebook también queda para más adelante. Respaldo: una copia semanal durante 12 semanas; clave de recuperación bajo su control. PUB-03 y PUB-15 quedan aplazadas, y PUB-16 conserva la parte web con propagación a redes aplazada; no presentarlas como tareas sociales vigentes listas para construir.

Luis confirma que el respaldo debe incluir datos de la aplicación y fotos/demás archivos de propiedades; autoriza en nombre de Hampton la reutilización en la nueva web de las fotos del equipo ya publicadas en Wix.

Luis confirma copias domingo 02:00 Jersey y tarea de inbox ante fallo. PRE-16: plan de traslado de fotos revisado independientemente y listo para construir; obtener y verificar los dos archivos autorizados forma parte de su ejecución.

Luis acepta la posible interrupción breve durante el respaldo de D1, condicionada a medir su duración primero en pruebas; activación y uso de datos reales siguen sin ejecutarse.

Luis publicará manualmente en Facebook e Instagram, con foto y descripción y precio privado cuando corresponda; portales más adelante sin infraestructura anticipada. Alquiler cerrado se retira de la web; aclarar Let agreed. Aprobó restaurar al estado de copia con revisión y autorización, y custodiar clave en gestor más copia de emergencia.

Luis informa que Hermes ya prepara publicaciones manuales y que funciona en GitHub; evitar duplicación. Tras fetch HamptonJersey main c26cc8e muestra borradores de ficha, sin evidencia identificada aún de preparación social: pendiente localizar la implementación concreta. Let agreed sigue ambiguo entre retirar y mostrar hasta cierre; no asumir.

Luis confirma que la preparación de publicaciones funciona correctamente y pide no preocuparse por localizarla; no duplicar ni planificar reconstrucción. El dato es confirmación de Luis, no prueba técnica independiente ni evidencia de que otro agente haya leído este ledger local.

Luis decide que la ficha permanece en la web hasta estar alquilada, sin etiqueta Let agreed; al alquilarse se retira de la web. Reconciliar con EST-17 y definir evento, reversión y concurrencia antes de construir.

Luis confirma: al marcar alquiler completado en Staff retirar automáticamente de las propiedades publicadas. No supone borrar ficha ni historial. El disparador y vínculo de datos deben diseñarse: Rentals actual no exhibe una acción inequívoca de cierre vinculada a listing.

Decisión posterior de Luis sustituye retirada inmediata/sin etiqueta: al completar alquiler, la ficha sigue publicada un día con «Let agreed»; después se retira si no se corrigió. Pendiente aclarar duración exacta de un día y estado tras corrección.

Luis confirma que el plazo de PUB-16 es de 24 horas exactas desde la marca del cierre. El plan propone visibilidad con fecha límite independiente del cron y corrección con control de concurrencia.

Luis confirma que se desactivan las solicitudes de visita cuando la propiedad está en Let agreed. Queda pendiente el tratamiento de visitas ya reservadas.

Luis indica: al alquilarse o venderse la propiedad, cancelar automáticamente las otras visitas y enviar correo a las personas afectadas; precisar momento respecto al periodo de corrección y coordinar AUT-17. No se ha enviado correo ni modificado visitas.

Luis confirma corrección de PUB-16 al estado y disponibilidad previos; reafirma retirada automática (se mantiene plazo previo de 24 h). Acepta pausa de cambios durante respaldo, almacenamiento Cloudflare separado con revisión de costes y reintentos con aviso si persiste el fallo. Pregunta pendiente: momento de cancelación y correos frente al plazo de 24 h.

Luis confirma para alquiler: tras 24 horas sin corrección cancelar otras visitas y avisar por correo; fallo de retirada genera tarea urgente en inbox. En ventas el momento y alcance del plazo de corrección deben concretarse, sin extrapolar.

Luis confirma aplicar también a ventas la espera de 24 horas antes de cancelar otras visitas y enviar correos; evitar preguntas cuyas respuestas se puedan resolver mediante código y decisiones previas.
