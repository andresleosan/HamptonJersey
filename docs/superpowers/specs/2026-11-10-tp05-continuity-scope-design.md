# TP-05 · Continuidad sin tareas retiradas

Este contrato prevalece en los consumidores antiguos que nombran ADM-05/OFE-08/PUB-15 o decisiones R01–R06 abiertas. [Maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md) y [contrato de capacidades y referencias](2026-11-10-tp03-case-evidence-design.md). No nuevas funciones ni infraestructura por esta revisión.

## Evidencia y casos de alquiler conservados

ADM-06/11/13/16 conservan sus módulos, casos, versiones, salas/items/lecturas, estados y tareas NOT-11. Retirar dependencia ADM-05, file_id/file_ids/evidence_file_ids y nuevas subidas/descargas/custodia de llaves. No sustituirlos por otro catálogo de documentos. Sus evidencias son referencias manuales externas opacas, nunca URL de autofetch ni ruta/clave R2: `ExternalEvidence={evidence_ref:string<=120,reviewed_at:serverTimestamp,reviewed_by:serverActor,revision:positiveInteger}`. El empleado declara la revisión por el canal externo; un ref no certifica un documento/firma/conformidad. No descargar, subir, resolver, copiar o firmar desde esta aplicación. Comprobar pertenencia al caso y autorización de dato estructurado mediante ADM-18-capabilities, independiente de la tarea completa/formulario ADM-18. Unknown se conserva como desconocido; revocación/inaccesibilidad explícita invalida la declaración, sin comprobación remota automática. No incluir referencia privada en eventos generales, URLs públicas o logs.

ADM-06 `saveEntryInventory(env,{tenancy_id,expectedRevision,rooms,meter_readings,evidence_refs},actor)` conserva vínculo y cobros actuales. evidence_refs<=20 referencias revisadas; los 20 no son archivos ni cuota de subida. Contrato firmado fuera: referencia revisada, nunca afirmar que la app recibió el PDF. No cambio a collect_from/opening_balance/HE-T ni cobros FIFO por retirar ADM-05.

ADM-11 `applyObligationEvidence(env,{id,expectedRevision,evidence_ref,performed_on,delivered_on,reason},actor)` conserva regla/alcance/fechas y capacidad. Los29riesgos solo con versión/validación competente; no certificar cumplimiento por un check. Ref de otro caso/revisión antigua falla sin modificar obligación.

ADM-13 inspecciones internas: checklist, habitaciones, lecturas y fechas propias; añadir `evidence_refs` a saveInspection con la misma forma si se documentan fotos revisadas fuera. No subir fotos por un nuevo repositorio de casos ni enviar informes al propietario. En createRepairFromInspection solo relación/observación estructurada; ADM-12 conserva su finalidad acotada.

ADM-16 `saveExitInventory(env,{id,expectedRevision,items,meter_readings,evidence_refs},actor)` compara estructura/fechas y referencias externas por revisión humana. No nueva custodia/registro de llaves, archivos o bancos. Campos/datos anteriores no se borran. Depósito sigue propuesta/respuesta/resultado manual, sin mover fondos ni API del esquema de depósitos por inferencia.

Pruebas futuras de los cuatro módulos: wrong_case_denied, ref_over120_rejected, server_actor_and_time, stale_revision409_no_write, revoked_ref_no_completion, no_upload_download_endpoint, no_owner_report. Mantener también los casos específicos de cada plan; D1 local para atomicidad y e2e1280/390/teclado/zoom200. No tests de producto para esta documentación.

## Missing payments y exportación sin comisiones

NOT-05 conserva solo renta/deuda real y su única proyección, grace_days0..30/default3, categoría/filtros/counts coherentes, tenancy validada y tareas Done/Snooze humanas. Eliminar unidad de facturas/deuda de otras agencias; no crear comisión pendiente ni exponerla como proveedor futuro. Su aceptación no espera OFE-08.

ADM-21 conserva CSV manual de rentas/ajustes/pagos/liquidaciones del propietario. Tipos cerrados `rent_charges|rent_payments|rent_adjustments|landlord_statement_lines`, sin comisión interagencia. `prepareAccountingExport(env,{from,to,type},actor)` captura fecha/versión real del servidor, no acepta asOf histórico para derivar filas desde datos actuales. Para líneas de liquidación usa snapshot cerrado ADM-10; para los otros tipos usa revisión financiera de ADM-09 y snapshot materializado/CAS de reloj de fuentes de ADM-10, de modo que no mezcle páginas concurrentes. from/to son filtros de fechas del origen, no viaje temporal. Rango máximo366días,50000filas/bloques500, rechazo sin truncar, GBP/peniques, RFC4180/UTF-8 y protección de fórmulas; capacidad financiera y descarga no-store. La ausencia de snapshot/guardas reales bloquea exportación, no genera CSV ficticio.

PRE-22 pasa a gestión humana fuera de aplicación. No construir advertiser-agreements, formulario de acuerdos, registro de tarifas ni rutas nuevas por este plan. Campos/notas existentes se conservan; no se convierten en permisos de fotos, disponibilidad, derecho a comisión ni bloqueo de búsqueda. La gestión de acuerdos/privacidad de PRE-13/33 por Hermes es distinta y conserva su responsabilidad ya asignada.

## Publicación, fuentes y controles

PUB-15 está excluida, sin selección de portal, feed/IDs o investigación pendiente. PUB-09 es propia e independiente del manifiesto de mercado; BUS-06/09 conservan núcleo y contratos nominales externos pendientes de aceptación. Property Directory se reutiliza, no se reinvestiga por planificar. Drive/PUB-21 posterior; Meta/tours excluidos, WhatsApp/Outlook/localmodels posteriores. PRE-06 incluye Access; decisión resuelta, implementación y activación aparte.

Los planes nuevos/copias conservan política visual actual del panel: ink#151515/paper#fff/mist#f4f3f0/line#e3e0da/stone#6b665e/bronze#a56b3d/bronze-dk#86542d/ok#2f6b4f/err#a32020; Montserrat14/1.5 y Tenor26/19, gutter16/card24-r14/button10x20-r999, foco2-offset2, contraste4.5/3, 390/1280/zoom200/teclado/reducedmotion. No restyle global. Protocolo avanzar actual/activity prevalece sobre reservas históricas; activity_unavailable permite solo planificación sin afirmar exclusividad. Antes de construir, verificar main y actividad, ordinal de migración libre y dueño único por módulo. No publicar o activar por haber preparado un plan.
