# REG-16 valuation email consent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Solo documentación ahora; sin campaña, envío, configuración remota o producto.

**Goal:** Registrar evidencia específica para ofertas de valoración por email de Hampton Estates LTD y conceder/revocar permiso mediante PRE-10 con CAS.

**Architecture:** Configuración manual pequeña, captura/revisión interna con currentAdmin y prueba versionada; confirmación+grant+evento+recibo en un DB.batch. Consulta de elegibilidad separada del transporte, sin grant o cuenta de cliente ni segundo ledger.

**Tech Stack:** ESM/JSDoc, D1, React actual y node:test.

**Spec:** [diseño](../specs/2026-11-08-l1b-valuation-consent-design.md).

## Global Constraints

- Solo channel=email, purpose=valuation_offer y RecipientRef contact/email. Nombre confirmado Hampton Estates LTD. No extender canales desde el enum genérico PRE-10.
- Datos/textos existentes se introducen manualmente; validación estructural/versiones/hash antes de activar servicio, sin dossier o circuito nuevo de aprobación. Faltantes⇒no permiso/no envío, no bloqueo de construcción.
- Consentimiento real específico indispensable: news, needs_to_sell, landlord, aviso leído o solicitud privacidad no bastan. No backfill positivo ni fecha de revisión convertida en fecha de declaración.
- Captura y revisión únicamente currentAdmin/SameOrigin, prueba privada verificada, sin IDs públicos o auth de cliente. Retirada, cambio de destinatario y supresión posteriores prevalecen.
- PRE-10 usa CommunicationPolicyConfigV1 manual y readCommunicationPolicyConfig, sin aprobación jurídica como campo/gate; encabezado único app_settings.communication_policy y versiones inmutables. La configuración específica referencia esa policy_version; copy_hash es hash de configuración de texto y proof_hash corresponde a la declaración individual.
- PRE-10 conserva EvidenceRef/PermissionSourceRef/builders/guard/fence; no duplicar preferencias o abreviar firmas. AUT-17 no se activa ni se envían ofertas en este plan.
- CSS real #151515/#fff/#f4f3f0/#e3e0da/#6b665e/#a56b3d/#86542d/#2f6b4f/#a32020/field-line #8f8a82; Montserrat 14/1.5, Tenor 26/19px 400, card 14/padding 24, input 10/padding 9px 12px, botón 999/10px 20px, gaps 8–24, page 1240/24px 16px 120px, corte 760/editor 900, foco 2 offset 2 y disabled .45; YAML antiguo no prevalece. Spec incluye valores completos y reglas web si se muestran textos compartidos.
- Inglés, labels/errores/status/alert/foco/teclado/zoom 200%/1280/390/reduced motion, texto 4.5:1/foco 3:1. Sin nuevos paquetes/fuentes/HTML libre/PII en storage/logs/URL. No página comercial nueva.

## Review Focus

1. News o contexto comercial sin prueba específica: denied, cero grant/envío (Task 1).
2. Configuración incompleta, canal distinto o evidencia de otro contacto: rechazo antes de elevar permiso (Task 1).
3. Prueba positiva antigua revisada tras retirada o email cambiado: CAS/guard mantienen denegado (Task 2).
4. Fallo de prueba/evento/ledger o revisión concurrente: rollback completo, no recorded parcial (Task 2).
5. Supresión ABA/destino/notice cambian tras revisión y antes del envío futuro: guard completo/fence lo detectan (Task 2/3).

## File map

Crear `server/valuation-consent-config.js`, `server/valuation-consent.js`, `server/routes/valuation-consent.js`, `admin/src/ValuationConsent.jsx`, `tests/server/valuation-consent.test.mjs`, `tests/valuation-consent.e2e.cjs`. Modificar `server/api.js`, `admin/src/ApplicantDetail.jsx`, `admin/src/styles.css`. Consumir `server/communication-permissions.js` PRE-10 y lector manual notice de PRE-09 cuando integrados; no repetir esos módulos. No cambios a registro anónimo/site/apply.js ni adaptador de privacidad. Migración lógica futura `l1b_valuation_consent`: requests/operations y campos de prueba descritos en spec; asignar próximo prefijo libre al construir, no crear archivoSQL ahora.

### Task 1: Configuración email y captura privada de prueba

**Files:** crear config/productor/rutas y tests/server/valuation-consent.test.mjs; modificar server/api.js; migración lógica de prueba.

**Interfaces:** ValuationConsentConfigV1/Command/Receipt exactos de spec; `valuationConsentConfigHash(value):Promise<string>`, `validateValuationConsentConfig(value:unknown):Promise<{value}|{errors}>`, `loadValuationConsentConfig(env):Promise<ValuationConsentConfigV1>`, `createValuationConsent(env,command,actor):Promise<ValuationConsentReceipt>`. Actor currentAdmin, contacto/destino versionados, evidence_id privado.

- [ ] RED `email_only_other_channels_rejected`, `controller_name_is_exact`, `manual_config_hash_is_canonical_and_awaited`, `missing_manual_text_never_invents_copy_or_allows_send`, `news_and_needs_to_sell_are_not_specific_consent`, `evidence_belongs_to_contact_and_current_destination`, `no_session_401_cross_origin_403`, `future_occurrence_or_stale_contact_rejected`, `creation_is_pending_not_allowed`.
- [ ] Ejecutar `node --test tests/server/valuation-consent.test.mjs`; esperar FAIL por módulos/tablas nuevos.
- [ ] Implementar configuración manual y validación await/crypto única sin metadata jurídica requerida. Captura admin con evidencia real, versión de contacto/destino/texto/notice; state pending_human_review y operación idempotente. Evidencia se verifica por permiso/ownership, no por email coincidente ni clic del operador. Config inválida muestra campos al equipo y deniega uso que requiere ese texto; la implementación puede revisarse antes con fixtures explícitos.
- [ ] GREEN repetir comando con400/401/403/404/409/503 previstos; no mutar marketingnews/búsqueda/visita, no SQL/actor desde body, no envío a proveedor.
- [ ] Revisar diff y commit futuro autorizado; no ejecutar ahora.

### Task 2: Confirmación humana y permiso PRE-10 atómicos

**Files:** productor/rutas y tests Task 1, integración del builder PRE-10 ya definido por su dueño.

**Interfaces:** `reviewValuationConsent(env,{id,expected_revision,decision:'confirm_evidence'|'reject',evidence_id,expected_permission_revision},actor)`; `valuationOfferEligibility(env,{contactId,at})`; `recordCommunicationGrantStatements(env,input,actor):D1PreparedStatement[]` sin batch propio. Input exacto spec con expectedRevision:numérico del permiso y evidence_guard interno SQL/args; EvidenceRef{id,version,sha256} y source_ref contact_request misma prueba/revisión.

- [ ] RED `typed_evidence_ref_uses_proof_hash_not_copy_hash`, `two_reviewers_one_revision`, `same_request_replay_one_receipt_and_event`, `same_id_different_payload_409`, `failed_evidence_guard_rolls_back_proof_grant_and_event`, `ledger_or_event_failure_never_leaves_recorded`, `late_positive_cannot_override_later_withdrawal`, `destination_revision_changed_blocks_confirmation`, `notice_or_config_changed_409_preserves_draft`.
- [ ] Ejecutar `node --test tests/server/valuation-consent.test.mjs` y focales PRE-10 indicados por su implementación; esperar FAIL de integración hasta builder real, no simular cumplimiento con booleano UI.
- [ ] Calcular proof_hash del snapshot exacto spec, evidence_ref objeto tipado y source_ref. evidence_guard de código autenticado verifica request/revisión/estado/proof/contacto/destino/notice/config. Un DB.batch confirma prueba+builder+evento+recibo, con guardas de abort de CAS. Resolver recibo tras commit; caller no manda SQL. Mantener occurred_at separado y rechazo si retirada/supresión posterior invalida prueba.
- [ ] GREEN repetir pruebas, rollback si cualquier guard pierde y receta replay sin regrant. Registrar rechazo sin grant. Consulta eligibility solo read actual con canal email, no prepara ni envía.
- [ ] Revisar diff/contratos y commit futuro; no afirmar consentimiento real a partir del fixture ni modificar estado publicado por haber plan.

### Task 3: Retirada, UI y verificación del guard completo

**Files:** crear ValuationConsent.jsx y tests/valuation-consent.e2e.cjs; modificar ApplicantDetail.jsx/styles.css; rutas privadas de retirada y pruebas focales.

**Interfaces:** `ValuationConsent({contact,onChange})`; PRE-10 `revokeCommunicationPermission(env,{recipient,channel:'email',purpose:'valuation_offer',expectedRevision,source,idempotencyKey},actor)`. Guard completo `communicationPermissionGuard({recipient,channel,purpose,expectedPolicyVersion,expectedPreferenceRevision,expectedRequestRevision,expectedSuppressionRevision,expectedDestinationRevision,expectedNoticeVersion,at})`; fence `authorizeCommunicationForSend(env,{outboundId,claimToken,at})` de futuro emisor, sin transporte nuevo.

- [ ] RED `withdrawal_invalidates_queued_authorization`, `suppression_aba_destination_and_notice_invalidate_guard`, `withdrawal_before_fence_blocks_provider_after_fence_no_false_recall`, `withdrawal_keeps_search_news_and_other_contacts`, `ui_pending_recorded_and_config_missing_are_distinct`, `expired_session_and_409_preserve_safe_draft`.
- [ ] Ejecutar focal node y futuro `node tests/valuation-consent.e2e.cjs` bajo harness local; esperar FAIL de UI/retirada antes de implementación.
- [ ] UI compacta en ficha, texto manual vigente/canal email/evidencia/fecha y acción confirmar; retirada usa CAS y dominio PRE-10, no borra evidencia. Falta de configuración informa qué completar, sin preguntas de negocio nuevas ni texto legal ficticio. Readiness de email se informa separada del permiso específico; no botón campaña/envío ni promesa de envío por registrar proof.
- [ ] GREEN focal/e2e y composiciónguard/fence sin llamada real. Playwright 1280/390/zoom 200%, teclado/foco/cancel/status/alert/carga/vacío/error, consola/red y no PII en storage. `npm test`, `npm run build`, `npm run check:release` y e2e general futuros según repo, resultados reales/bloqueos en ledger.
- [ ] Preparar revisión de implementación y catálogo por coordinación, distinguiendo configuración manual/canal/evidencia real de pruebas locales. Activación/publicación se autorizan aparte; plan listo para construir sin nuevo proceso jurídico.

## Self-review

R1/R4→Task 1, R2/R3/R5→Tasks 2–3. Cinco focos con casos nombrados; DTO EvidenceRef y guard completo conservados, actor actual y email only, sin estados cliente o permiso duplicado. Implementación, consentimiento real y servicio activo siguen hechos futuros, no se atribuyen por este documento.
