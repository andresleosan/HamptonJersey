# Ledger REG-16 · Valoración solo email

8-nov-2026. Cierre final solo documental desde versiones actuales de `/tmp/hampton-lista1-tanda2-20261108`, base c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1 verificada por coordinación. Destino exclusivo `/tmp/hampton-l1-final-privacy`; sin cambios al clon o a otros documentos.

Decisiones incorporadas: valoración solo por email y consentimiento específico; controlador Hampton Estates LTD; textos/datos existentes añadidos manualmente por Luis/equipo, configuración versionada y validación antes de activar servicio. Se elimina la dependencia auxiliar de identidad/grants del cliente y el nuevo circuito de dossier/aprobación jurídica. El plan queda listo para construir; texto todavía no cargado o canal no operativo impiden el envío real, no la construcción. No afirmamos haber revisado textos/documentos que no se han mostrado.

Captura y confirmación solo currentAdmin/SameOrigin sobre evidencia privada real del titular, contacto y destinatario actuales. News, propietario, needs_to_sell, aviso leído o email de solicitud de privacidad no conceden permiso de valoración. Revisión tardía no vence retirada/supresión posterior; ningún destino nuevo hereda consentimiento automáticamente.

Contrato PRE-10 preservado: RecipientRef contact/email, EvidenceRef{id,version,sha256} derivado del snapshot de prueba y PermissionSourceRef contact_request de la misma revisión; recordCommunicationGrantStatements sin batch propio recibe expectedRevision y evidence_guard interno. Prueba+builder+evento+recibo en un DB.batch, rollback íntegro de CAS/error. communicationPermissionGuard conserva todas las revisiones incluidas supresión/destino/notice y fence final separado del transporte. Sin segundo ledger, campaña o envío ciego.

Entregado: spec/plan de tres tareas con firmas, archivos, casos de prueba, errores, concurrencia, retirada y UI compacta/CSS vigente. Estado de producto no completado por el documento; cambios futuros de catálogo a cargo de coordinación al construir. Pendientes normales: implementar/probar, cargar configuración manual real, verificar evidencia individual y readiness del email antes de uso, revisión/activación/publicación autorizadas. No nuevo gate de negocio/jurídico en el plan maestro.

Comprobaciones realizadas ahora: lectura/contraste contractual y autorrevisión estática, no tests de producto. Pruebas node/npm/build/release/e2e/Playwright son futuras, checkboxes sin marcar. Sin código/servicios/config remota/secretos/claims/migraciones ejecutadas/commits/publicación. No asesoramiento legal ni comprobación de aprobación no vista.

Alineación final PRE-10 confirmada por coordinación: CommunicationPolicyConfigV1 manual/readCommunicationPolicyConfig, cabecera única app_settings.communication_policy y cuerpo inmutable versionado; entradas faltantes no envían. policy_version referencia esa política; config de consentimiento mantiene versión/hash del texto separadas del proof_hash individual. Ninguna metadata de aprobación jurídica añadida.

Comprobación final ejecutada: seis documentos propios presentes, fences Markdown balanceados, cabeceras writing-plans y vínculos spec válidos; pasos futuros sin marcar. Revisadas ausencia de APIs/tipos de cliente, CMS, campos registrales y referencias de aprobación retiradas. Comprobaciones solo documentales, sin ejecutar producto.


## Cierre documental común posterior a la entrevista

Rige el [maestro final](2026-11-08-lista1-build-ready.md) y sus respuestas; cualquier condición histórica sustituida debe leerse con ese cierre. Revisión independiente final conforme, sin P1/P2 pendientes. Solo planificación: casillas de construcción y pruebas de producto siguen para ejecución futura. La comprobación final de enlaces, cobertura y paquete está en el [ledger de tanda](2026-11-08-lista1-tanda2-ledger.md).
