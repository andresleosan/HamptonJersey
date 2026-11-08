# Lista1 · Plan maestro vigente y planes listos para construir

8-nov-2026 · Cierre de entrevista con Luis. Base GitHub main c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1, comprobada21:40:00UTC. Esta versión incorpora las respuestas posteriores a las dos tandas y prevalece en sus decisiones sobre propuestas históricas. **Solo planificación: no se ha construido ni publicado código.**

## Decisiones cerradas

- **Presentaciones SAP09/AGE11/AUT20:** email sencillo, texto explicativo breve y fotos adjuntas descargables. Hermes prepara; un empleado revisa y pulsa Enviar cada vez. Sin fotos inline, PDF/ZIP, portal para verlas o envío autónomo. Respuesta ordinaria al email y revisión del equipo adoptadas por el planificador para mantener sencillez.
- **Privacidad PRE12:** solicitudes de copia/borrado por email, verificación de identidad y tramitación del equipo; portal para más adelante. Recibir solicitud no borra ni confirma identidad. Un aviso previo fallido/incierto detiene el borrado de ese contacto y crea una tarea de revisión. No reinicia actividad ni cierra búsquedas.
- **REG15:** dirección confirmada, un resumen diario solo con viviendas nuevas, cancelación; servicio seis mesescalendarioJersey, un único correo de renovación al final y, si no renueva, se detienen alertas. Datos tras baja/no renovación y evidencia tienen plazos configurables: deben estar completos y validados para activar el servicio; no se inventan números.
- **REG16:** ofrecer valoraciones inicialmente solo por email y con consentimiento específico registrado/revisado. Opt-in de noticias no sustituye ese permiso.
- **Identidad mostrada:** Hampton Estates LTD.
- **BUS13:** Qualified/Registered se aplica solo a Lettings residencial de Jersey. Compra, comercial e internacional no requieren ese dato en este producto. Desconocido en un caso realmente aplicable sigue pendiente de confirmación; la ausencia de este check fuera del alcance no declara aptitud general ni borra otras restricciones explícitas independientes.
- **Contenido y parámetros:** Luis confirma que dispone de los datos y textos necesarios y los añadirá manualmente. El desarrollo contempla entrada, versión y validación técnica, sin incluir su obtención en el trabajo de esta tanda.
- **AUT19/REG13:** flujo del panel con revisión antes/después y puerto IA desactivado, como ya se había aprobado. El plan no elige ni activa un proveedor.
- Se conservan D02 (48h alquiler/7d compra configurable y contradicción→reconfirmación), D03/D04/D09 (reloj conservado, una tarea por episodio, diferencias sin sumar unidades) y D10 (purga solo archivos sin uso activo con mínimos/evidencia/historial preservados). D06 desactivada y pausa D12 fuera del alcance inicial.

## Planes cerrados de la segunda tanda

Todos son de Lista1. «Listo» significa diseño, decisiones, contratos y pruebas futuras concretos para el alcance indicado; no significa producto ya implementado o permiso para comenzar sin dependencias/reserva de construcción. Los datos de configuración se cargarán al activar, no se sustituyen por defaults inventados.

| Tarea | Plan | Alcance listo |
|---|---|---|
| AUT-19 | [Propuestas de criterios y confirmación](2026-11-08-l1b-criteria-proposals.md) | Listo para construir el núcleo del panel; IA/voz desactivadas. |
| REG-13 | [Requisitos libres revisables](2026-11-08-l1b-free-text-requirements.md) | Listo para construir el consumidor y puerto desactivado; extensión/proveedor fuera del primer alcance. |
| EST-18 | [Conformidad de eventos y proyecciones](2026-11-08-l1b-event-producer-contract.md) | Listo para integración por productor; sin vista de historial nueva. |
| BUS-13 | [Qualified/Registered solo en Lettings](2026-11-08-l1b-residency-adoption.md) | Listo en el alcance de categorías Lettings residencialJersey, sin imponerlo a compra/comercial/internacional. |
| PRE-09 | [Aviso con datos manuales de Hampton](2026-11-08-l1b-privacy-notice-coverage.md) | Listo: Hampton Estates LTD y textos introducidos manualmente; sin portal en esta entrega. |
| PRE-10 | [Permisos, avisos y bajas](2026-11-08-l1b-communication-permissions.md) | Listo: configuración manual, consentimiento por finalidad y control antes de enviar. |
| PRE-12 | [Solicitudes de privacidad por email y equipo](2026-11-08-l1b-privacy-requests.md) | Listo: verificación/revisión interna; aviso fallido/incierto bloquea borrado del contacto y crea tarea. |
| REG-16 | [Consentimiento específico para valoraciones por email](2026-11-08-l1b-valuation-consent.md) | Listo: solo email, consentimiento específico y revisión del equipo. |
| REG-15 | [Alertas y renovación](2026-11-08-l1b-search-alert-readiness.md) | Plan ampliado listo: seis meses, una renovación y conservación configurable validada antes de activar. |

SAP09 y AUT20 también quedan actualizados con las decisiones de email/fotos/revisión. La [guía REG05/07/08/11/17](2026-11-08-l1b-existing-deliveries-verification.md) comprueba entregas existentes, no crea cinco funciones nuevas. Los demás planes anteriores se conservan en el índice de la primera tanda.

## Orden de construcción y condiciones de activación

1. Comprobar main, conservar el trabajo local, revisar alcance exacto y satisfacer dependencias técnicas antes de una reserva build. Este cierre no crea reservas ni modifica estados del catálogo.
2. Integrar productores: inventario BUS10, evaluación BUS12/BUS13, decisiones BUS15, disponibilidad EST16, proyección EST13 y consumidores SAP. No confundir adaptadores propuestos con módulos construidos.
3. PRE10 es dueño único del permiso por finalidad, las revisiones y el fence del envío; REG16 aporta la prueba específica, REG15 su solicitud confirmada y cada item del digest, PRE12 el trámite humano. Ningún permiso se hereda por igualdad de email.
4. Antes de habilitar una función real, cargar textos/parámetros manuales y verificar sus campos/versiones, canal integrado y permisos correspondientes. Para alertas, la retención incompleta o no validada mantiene el servicio desactivado. Esto es configuración de puesta en marcha, no una pregunta pendiente de diseño.
5. Ejecutar pruebas de producto, build/release y e2e/MCP que correspondan al construir. Publicación, migraciones y activación requieren su encargo/autorización aparte. Ninguna se ha ejecutado al cerrar los planes.

## Evidencia y entrega

[Matriz de respuestas cerrada](2026-11-08-lista1-decision-closure.md), [índice completo59códigos](2026-11-08-lista1-tanda2-index.md) y [ledger](2026-11-08-lista1-tanda2-ledger.md). El paquete final sustituye los ZIP de las tandas anteriores para estas respuestas. Los documentos históricos mantienen contexto; esta versión y los diseños finales gobiernan el alcance vigente.

**Preguntas pendientes de esta tanda: ninguna.** Las integraciones no construidas y los valores manuales por introducir están identificados como trabajo de ejecución/configuración, sin presentarlos como producto terminado.

Siguiente trabajo recomendado al encargar construcción: BUS14 sobre inventario actual, conservando el orden de dependencias de REG08. Modelo Codex gpt-6.1-terra, esfuerzo high, por selección/paginación y conservación de decisiones humanas. No cambia el modelo actual ni autoriza construir durante esta sesión de planes.
