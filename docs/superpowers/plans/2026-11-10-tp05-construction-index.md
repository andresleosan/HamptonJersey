> **Actualización 10-nov posterior:** ANA-10 se limita a [QR de pósteres por propiedad](2026-11-10-ana-10-qr-agregado.md); PUB-20 folletos aplazada. Estos estados prevalecen sobre conteos históricos y archivos de readiness anteriores.

# TP-05 · Índice consolidado para construcción

10-nov-2026. Revisión transversal de las cuatro listas y de TP-01–04. Solo planificación local, sin commit/push ni producto. [Matriz completa](2026-11-10-tp05-construction-readiness.json) · [Registro de revisión](2026-11-10-tp05-review-ledger.md) · [Orden y contratos](2026-11-10-tp05-construction-order.md) · [Maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md).

## Alcance conciliado

250 códigos localizados una sola vez en la matriz: **154 en alcance actual**, 21 excluidos expresamente, 6 posteriores, 2 sustituidos por Hermes central y 67 entradas históricas inactivas. Los154 incluyen construcción, investigación, gestión, verificación externa y continuidad de entregas; no son154 tareas nuevas de código ni154 listas para activar. El catálogo original se conserva sin regenerarlo ni alterar estados por redactar planes.

La cifra155 anterior incluía Drive/PUB-21, ahora posterior por decisión ya tomada; los13 códigos de tours/PRE-27 antes inactivos se identifican explícitamente como excluidos, sin descontarlos otra vez del alcance activo. ADM-05/OFE-08/PUB-15 están excluidas, nunca aplazadas. PRE-22 conserva solo gestión fuera de aplicación, no registro de comisiones. Cero nuevas preguntas abiertas: Luis incluye Access en PRE-06; configuración y 2FA real siguen por comprobar.

Las cuatro tandas de preparación quedan revisadas: **26 planes activos y58 unidades futuras de código** en TP-01–04, más Drive posterior. Estas cifras no suman de nuevo los128 planes anteriores conservados. La revisión TP-05 no añade códigos de producto ni ejecuta las investigaciones/gestiones. No queda otra tanda de organización programada; permanecen entregables y gates reales descritos por tarea.

## Lectura de estados

- **Contrato definido**: el constructor dispone de comportamiento, archivos/interfaces y aceptación futura; debe verificar/integrar las dependencias antes del tramo que las consume.
- **Tramo definido**: no certifica el alcance completo. En BUS-06/09 faltan contratos nominales externos reales; en IA/correo/calendario faltan sus verificaciones de uso/recepción cuando se indique.
- **Código existente**: conservar y comprobar la entrega registrada; no volver a construirla desde un plan antiguo. BUS-14 está cerrado en main para su alcance aprobado; BUS-12/17 son otros trabajos.
- **Investigación/gestión/activación**: plan disponible no equivale a construir software ni a haber ejecutado el trabajo externo. Toda afirmación de producción requiere evidencia nueva de esa superficie.

Los planes copiados desde la otra carpeta de esta sesión se conservan allí intactos, con hashes y redirecciones de referencias documentados. Aquí se corrigen consumidores de tareas retiradas y se respetan las versiones ya publicadas. El maestro y los contratos TP-03/04/05 prevalecen sobre propuestas antiguas incompatibles. Este índice es local y no se presenta como publicado o visible en el tablero; activity_unavailable.

## Inventario del alcance actual

### Lista 1 · 39 códigos

| Código | Plan vigente | Estado del alcance |
|---|---|---|
| AUT-19 | [Plan](2026-11-08-aut-19-versioned-criteria-proposals.md) | Tramo definido; integración/evidencia pendiente |
| AUT-20 | [Plan](2026-11-08-aut-20-integrated-search-acceptance.md) | Tramo definido; integración/evidencia pendiente |
| BUS-12 | [Plan](2026-11-08-bus-12-canonical-search-evaluation.md) | Contrato definido; verificar dependencias |
| BUS-13 | [Plan](2026-11-08-bus-13-versioned-housing-eligibility.md) | Tramo definido; integración/evidencia pendiente |
| BUS-14 | [Plan](2026-11-08-bus-14-match-ranking.md) | Entrega aprobada cerrada; no reconstruir |
| BUS-15 | [Plan](2026-11-08-bus-15-versioned-human-review.md) | Contrato definido; verificar dependencias |
| BUS-17 | [Plan](2026-11-08-bus-17-internal-21-day-review.md) | Contrato definido; verificar dependencias |
| BUS-18 | [Plan](2026-11-08-bus-18-property-search-followup.md) | Contrato definido; verificar dependencias |
| EST-01 | [Plan](2026-11-08-est-01-search-progress-projection.md) | Contrato definido; verificar dependencias |
| EST-04 | [Plan](2026-11-08-est-04-derived-in-process-state.md) | Contrato definido; verificar dependencias |
| EST-10 | [Plan](2026-11-08-est-10-concurrent-search-work-labels.md) | Contrato definido; verificar dependencias |
| EST-13 | [Plan](2026-11-08-est-13-orthogonal-candidate-state.md) | Contrato definido; verificar dependencias |
| EST-14 | [Plan](2026-11-08-est-14-match-journey-evidence.md) | Contrato definido; verificar dependencias |
| EST-15 | [Plan](2026-11-08-est-15-scoped-unavailability.md) | Contrato definido; verificar dependencias |
| EST-16 | [Plan](2026-11-08-est-16-commercial-facts-authority.md) | Contrato definido; verificar dependencias |
| EST-17 | [Plan](2026-11-08-est-17-own-listing-state-completion.md) | Código existente; verificar continuidad y pendientes |
| EST-18 | [Plan](2026-11-08-l1b-event-producer-contract.md) | Código existente; verificar continuidad y pendientes |
| EST-19 | [Plan](2026-11-08-est-19-photo-only-trash-purge.md) | Contrato definido; verificar dependencias |
| PRE-09 | [Plan](2026-11-08-pre-09-purpose-versioned-privacy-notices.md) | Tramo definido; integración/evidencia pendiente |
| PRE-10 | [Plan](2026-11-08-pre-10-purpose-scoped-marketing-objections.md) | Contrato definido; verificar dependencias |
| PRE-11 | [Plan](2026-11-08-pre-11-third-party-media-privacy.md) | Contrato definido; verificar dependencias |
| PRE-12 | [Plan](2026-11-08-l1b-privacy-requests.md) | Contrato definido; verificar dependencias |
| REG-04 | [Plan](2026-11-08-reg-04-budget-terms-completion.md) | Contrato definido; verificar dependencias |
| REG-05 | [Plan](2026-11-08-reg-05-existing-room-range-verification.md) | Código existente; verificar continuidad y pendientes |
| REG-06 | [Plan](2026-11-08-reg-06-explicit-area-answer.md) | Contrato definido; verificar dependencias |
| REG-07 | [Plan](2026-11-08-reg-07-nonnegotiable-household-pets.md) | Contrato definido; verificar dependencias |
| REG-08 | [Plan](2026-11-08-l1b-existing-deliveries-verification.md) | Código existente; verificar continuidad y pendientes |
| REG-11 | [Plan](2026-11-08-l1b-existing-deliveries-verification.md) | Código existente; verificar continuidad y pendientes |
| REG-12 | [Plan](2026-11-08-reg-12-search-registration-acknowledgement.md) | Contrato definido; verificar dependencias |
| REG-13 | [Plan](2026-11-08-reg-13-reviewed-requirements-extraction.md) | Tramo definido; integración/evidencia pendiente |
| REG-15 | [Plan](2026-11-08-reg-15-reviewed-saved-search-alerts.md) | Tramo definido; integración/evidencia pendiente |
| REG-16 | [Plan](2026-11-08-reg-16-permissioned-valuation-offers.md) | Tramo definido; integración/evidencia pendiente |
| REG-17 | [Plan](2026-11-10-reg-17-reconciliation.md) | Captura publicada; parcial hasta integración VIS-17 |
| SAP-01 | [Plan](2026-11-08-sap-01-applicant-search-progress-ui.md) | Contrato definido; verificar dependencias |
| SAP-02 | [Plan](2026-11-08-sap-02-canonical-match-counts.md) | Contrato definido; verificar dependencias |
| SAP-03 | [Plan](2026-11-08-sap-03-applicant-confirmed-match-groups.md) | Contrato definido; verificar dependencias |
| SAP-08 | [Plan](2026-11-08-sap-08-applicant-messages-viewings-tabs.md) | Contrato definido; verificar dependencias |
| SAP-09 | [Plan](2026-11-08-sap-09-applicant-presentation-viewing-actions.md) | Contrato definido; verificar dependencias |
| SAP-10 | [Plan](2026-11-08-sap-10-confirmed-criteria-changes-ui.md) | Contrato definido; verificar dependencias |

### Lista 2 · 42 códigos

| Código | Plan vigente | Estado del alcance |
|---|---|---|
| AGE-03 | [Plan](2026-11-08-age-03-shared-consultations.md) | Contrato definido; verificar dependencias |
| AGE-04 | [Plan](2026-11-09-age-04-directory-links-and-call-contacts-closure.md) | Contrato definido; verificar dependencias |
| AGE-05 | [Plan](2026-11-08-age-05-consultation-delivery.md) | Contrato definido; verificar dependencias |
| AGE-06 | [Plan](2026-11-08-age-06-responses-and-calls.md) | Contrato definido; verificar dependencias |
| AGE-08 | [Plan](2026-11-08-age-08-business-day-call-tasks.md) | Contrato definido; verificar dependencias |
| AGE-09 | [Plan](2026-11-08-age-09-consultation-evidence.md) | Contrato definido; verificar dependencias |
| AGE-10 | [Plan](2026-11-08-age-10-private-image-permissions.md) | Contrato definido; verificar dependencias |
| AGE-11 | [Plan](2026-11-08-age-11-reviewed-private-presentations.md) | Contrato definido; verificar dependencias |
| AGE-12 | [Plan](2026-11-08-age-12-private-presentation-access.md) | Contrato definido; verificar dependencias |
| AGE-14 | [Plan](2026-11-09-age-14-suppression-across-linked-copies-closure.md) | Contrato definido; verificar dependencias |
| AUT-01 | [Plan](2026-11-09-aut-01-automation-controls-and-actual-usage-closure.md) | Contrato definido; verificar dependencias |
| AUT-04 | [Plan](2026-11-09-aut-04-readiness-from-actual-evidence-closure.md) | Contrato definido; verificar dependencias |
| AUT-05 | [Plan](2026-11-09-aut-05-central-model-authorization-and-quota-closure.md) | Contrato definido; verificar dependencias |
| AUT-09 | [Plan](2026-11-09-aut-09-automation-definition-registry-closure.md) | Contrato definido; verificar dependencias |
| AUT-10 | [Plan](2026-11-09-aut-10-versioned-operation-modes-closure.md) | Contrato definido; verificar dependencias |
| AUT-11 | [Plan](2026-11-09-aut-11-one-outbound-guard-closure.md) | Contrato definido; verificar dependencias |
| AUT-13 | [Plan](2026-11-09-aut-13-hermes-dispatch-and-isolated-payloads-closure.md) | Contrato definido; verificar dependencias |
| AUT-14 | [Plan](2026-11-09-aut-14-notifier-package-and-receipts-closure.md) | Contrato definido; verificar dependencias |
| AUT-16 | [Plan](2026-11-09-aut-16-luis-public-search-and-command-guard-closure.md) | Contrato definido; verificar dependencias |
| AUT-17 | [Plan](2026-11-09-aut-17-email-activation-scope-and-proof-closure.md) | Verificación/activación externa; plan definido |
| AUT-18 | [Plan](2026-11-09-aut-18-human-ready-marker-and-summary-count-closure.md) | Contrato definido; verificar dependencias |
| BUS-01 | [Plan](2026-11-08-bus-01-inventory-matching.md) | Contrato definido; verificar dependencias |
| BUS-03 | [Plan](2026-11-09-bus-03-inventory-evidence-browser-closure.md) | Contrato definido; verificar dependencias |
| BUS-04 | [Plan](2026-11-08-bus-04-material-changes-rematching.md) | Contrato definido; verificar dependencias |
| BUS-06 | [Plan](2026-11-10-tp04-bus-06-plan.md) | Núcleo definido; aceptación externa pendiente |
| BUS-07 | [Plan](2026-11-08-bus-07-legacy-agency-links.md) | Contrato definido; verificar dependencias |
| BUS-08 | [Plan](2026-11-09-bus-08-one-daily-jersey-sweep-closure.md) | Contrato definido; verificar dependencias |
| BUS-09 | [Plan](2026-11-10-tp04-bus-09-plan.md) | Propio/manual definidos; lectores externos pendientes |
| BUS-10 | [Plan](2026-11-09-bus-10-physical-identity-and-reversible-aliases-closure.md) | Contrato definido; verificar dependencias |
| BUS-11 | [Plan](2026-11-08-bus-11-special-cases-research.md) | Investigación planificada; ejecución pendiente |
| BUS-19 | [Plan](2026-11-09-bus-19-per-source-access-decisions-closure.md) | Contrato definido; verificar dependencias |
| BUS-20 | [Plan](2026-11-09-bus-20-reviewed-company-candidates-closure.md) | Contrato definido; verificar dependencias |
| BUS-21 | [Plan](2026-11-08-bus-21-property-directory-gaps.md) | Investigación planificada; ejecución pendiente |
| BUS-22 | [Plan](2026-11-08-bus-22-property-directory-gaps.md) | Investigación planificada; ejecución pendiente |
| BUS-23 | [Plan](2026-11-08-bus-23-property-directory-gaps.md) | Investigación planificada; ejecución pendiente |
| MSG-02 | [Plan](2026-11-09-msg-02-shared-conversation-revision-guard-closure.md) | Contrato definido; verificar dependencias |
| MSG-03 | [Plan](2026-11-09-msg-03-channel-typed-unified-messages-closure.md) | Contrato definido; verificar dependencias |
| MSG-04 | [Plan](2026-11-09-msg-04-intent-adapter-and-safe-model-handoff-closure.md) | Contrato definido; verificar dependencias |
| MSG-05 | [Plan](2026-11-09-msg-05-chat-applicant-prefill-with-explicit-save-closure.md) | Contrato definido; verificar dependencias |
| PRE-22 | [Plan](2026-11-10-tp05-pre-22-manual-management.md) | Gestión definida; sin construcción de producto |
| PRE-32 | [Plan](2026-11-09-pre-32-pro-route-verification-closure.md) | Verificación/activación externa; plan definido |
| PRE-34 | [Plan](2026-11-09-pre-34-web-chat-activation-evidence-closure.md) | Verificación/activación externa; plan definido |

### Lista 3 · 37 códigos

| Código | Plan vigente | Estado del alcance |
|---|---|---|
| ADM-03 | [Plan](2026-11-09-adm-03-rental-notices-on-the-shared-clock.md) | Contrato definido; verificar dependencias |
| ADM-06 | [Plan](2026-11-09-adm-06-tenancy-from-an-agreed-property.md) | Contrato definido; verificar dependencias |
| ADM-09 | [Plan](2026-11-10-tp03-adm-09-plan.md) | Contrato definido; dependencias por integrar |
| ADM-10 | [Plan](2026-11-10-tp03-adm-10-plan.md) | Contrato definido; dependencias por integrar |
| ADM-11 | [Plan](2026-11-09-adm-11-rental-obligations-and-evidence.md) | Contrato definido; verificar dependencias |
| ADM-12 | [Plan](2026-11-10-tp03-adm-12-plan.md) | Contrato definido; dependencias por integrar |
| ADM-13 | [Plan](2026-11-09-adm-13-internal-six-month-inspections.md) | Contrato definido; verificar dependencias |
| ADM-14 | [Plan](2026-11-10-tp03-adm-14-plan.md) | Contrato definido; dependencias por integrar |
| ADM-15 | [Plan](2026-11-10-tp03-adm-15-plan.md) | Contrato definido; activación por comprobar |
| ADM-16 | [Plan](2026-11-09-adm-16-move-out-inventory-and-deposit-tracking.md) | Contrato definido; verificar dependencias |
| ADM-17 | [Plan](2026-11-09-adm-17-versioned-tenancy-rules.md) | Contrato definido; verificar dependencias |
| ADM-18 | [Plan](2026-11-10-tp03-adm-18-plan.md) | Contrato definido; dependencias por integrar |
| ADM-19 | [Plan](2026-11-10-tp03-adm-19-plan.md) | Contrato definido; dependencias por integrar |
| ADM-20 | [Plan](2026-11-10-tp03-adm-20-plan.md) | Contrato definido; activación por comprobar |
| ADM-21 | [Plan](2026-11-09-adm-21-rental-accounting-csv-exports.md) | Contrato definido; verificar dependencias |
| NOT-01 | [Plan](2026-11-09-not-01-event-inbox-build.md) | Código existente; verificar continuidad y pendientes |
| NOT-05 | [Plan](2026-11-09-not-05-missing-payments-from-real-balances.md) | Contrato definido; verificar dependencias |
| NOT-08 | [Plan](2026-11-08-not-08-inbox-category-integration.md) | Contrato definido; verificar dependencias |
| NOT-09 | [Plan](2026-11-08-not-09-typed-inbox-domain-actions.md) | Contrato definido; verificar dependencias |
| NOT-10 | [Plan](2026-11-08-not-10-daily-digest-existing-activation.md) | Verificación/activación externa; plan definido |
| NOT-11 | [Plan](2026-11-08-not-11-shared-task-integration.md) | Código existente; verificar continuidad y pendientes |
| OFE-02 | [Plan](2026-11-10-tp03-ofe-02-plan.md) | Contrato definido; dependencias por integrar |
| OFE-06 | [Plan](2026-11-10-tp03-ofe-06-plan.md) | Contrato definido; dependencias por integrar |
| OFE-07 | [Plan](2026-11-10-tp03-ofe-07-plan.md) | Contrato definido; activación por comprobar |
| PRE-03 | [Plan](2026-11-09-pre-03-activity-specific-registration-verification.md) | Gestión definida; sin construcción de producto |
| PRE-04 | [Plan](2026-11-09-pre-04-honest-historical-team-baseline.md) | Gestión definida; sin construcción de producto |
| PRE-25 | [Plan](2026-11-09-pre-25-measured-volume-and-capacity-assumptions.md) | Gestión definida; sin construcción de producto |
| PRE-29 | [Plan](2026-11-09-pre-29-client-funds-and-tax-readiness.md) | Gestión definida; sin construcción de producto |
| VIS-04 | [Plan](2026-11-08-vis-04-reviewed-post-viewing-feedback.md) | Tramo definido; integración/evidencia pendiente |
| VIS-06 | [Plan](2026-11-08-vis-06-private-public-viewing-summary.md) | Contrato definido; verificar dependencias |
| VIS-08 | [Plan](2026-11-08-vis-08-viewing-lifecycle-milestones.md) | Contrato definido; verificar dependencias |
| VIS-09 | [Plan](2026-11-08-vis-09-viewing-duration-travel-policy.md) | Contrato definido; verificar dependencias |
| VIS-10 | [Plan](2026-11-08-vis-10-property-access-restrictions.md) | Contrato definido; verificar dependencias |
| VIS-12 | [Plan](2026-11-08-vis-12-google-calendar-viewings.md) | Tramo definido; integración/evidencia pendiente |
| VIS-13 | [Plan](2026-11-08-vis-13-viewing-reminders-actions.md) | Tramo definido; integración/evidencia pendiente |
| VIS-14 | [Plan](2026-11-08-vis-14-open-consecutive-viewing-groups.md) | Contrato definido; verificar dependencias |
| VIS-17 | [Plan](2026-11-08-vis-17-multipart-viewing-coordination.md) | Contrato definido; verificar dependencias |

### Lista 4 · 36 códigos

| Código | Plan vigente | Estado del alcance |
|---|---|---|
| ANA-01 | [Plan](2026-11-10-tp02-ana-01-plan.md) | Contrato definido |
| ANA-03 | [Plan](2026-11-08-ana-03-web-analytics-source-activation.md) | Verificación/activación externa; plan definido |
| ANA-04 | [Plan](2026-11-08-ana-04-aggregate-search-demand-series.md) | Contrato definido; verificar dependencias |
| ANA-05 | [Plan](2026-11-10-tp02-ana-05-plan.md) | Contrato definido; dependencias por integrar |
| ANA-06 | [Plan](2026-11-08-ana-06-agency-and-presentation-response-metrics.md) | Contrato definido; verificar dependencias |
| ANA-08 | [Plan](2026-11-09-ana-08-resumen-inbox.md) | Código existente; verificar continuidad y pendientes |
| ANA-09 | [Plan](2026-11-08-ana-09-scoped-public-rate-limit.md) | Verificación/activación externa; plan definido |
| ANA-10 | [Plan vigente de QR por propiedad](2026-11-10-ana-10-qr-agregado.md) | Alcance actualizado: conteo agregado de QR de pósteres; sin origen por contacto; dependencia PUB-16/caché antes de activar |
| PRE-06 | [Plan](2026-11-09-tp01-pre-06-plan.md) | Contrato definido; activación por comprobar |
| PRE-13 | [Plan](2026-11-09-tp01-pre-13-plan.md) | Gestión definida; sin construcción de producto |
| PRE-14 | [Plan](2026-11-09-tp01-pre-14-plan.md) | Contrato definido; activación por comprobar |
| PRE-16 | [Plan](2026-11-09-tp01-pre-16-plan.md) | Código definido; gestión por comprobar |
| PRE-28 | [Plan](2026-11-09-tp01-pre-28-plan.md) | Gestión definida; sin construcción de producto |
| PRE-33 | [Plan](2026-11-08-pre-33-hermes-existing-agreements-handoff.md) | Gestión definida; sin construcción de producto |
| PUB-01 | [Plan](2026-11-10-tp02-pub-01-plan.md) | Contrato definido; dependencias por integrar |
| PUB-02 | [Plan](2026-11-10-tp02-pub-02-plan.md) | Contrato definido |
| PUB-04 | [Plan](2026-11-08-pub-04-listing-address-condition.md) | Contrato definido; verificar dependencias |
| PUB-05 | [Plan](2026-11-08-pub-05-structured-physical-features.md) | Contrato definido; verificar dependencias |
| PUB-06 | [Plan](2026-11-08-pub-06-structured-economic-terms.md) | Contrato definido; verificar dependencias |
| PUB-07 | [Plan](2026-11-08-pub-07-technical-compliance-evidence.md) | Tramo definido; integración/evidencia pendiente |
| PUB-08 | [Plan](2026-11-08-pub-08-web-content-tags-video.md) | Contrato definido; verificar dependencias |
| PUB-09 | [Plan](2026-11-10-tp04-pub-09-plan.md) | Web propia definida; portales excluidos |
| PUB-10 | [Plan](2026-11-08-pub-10-private-valuation-intake.md) | Tramo definido; integración/evidencia pendiente |
| PUB-11 | [Plan](2026-11-08-pub-11-media-quality-private-documents.md) | Contrato definido; verificar dependencias |
| PUB-12 | [Plan](2026-11-10-tp02-pub-12-plan.md) | Contrato definido |
| PUB-13 | [Plan](2026-11-08-pub-13-evidence-backed-web-copy-drafts.md) | Tramo definido; integración/evidencia pendiente |
| PUB-14 | [Plan](2026-11-08-pub-14-existing-seo-search-console-activation.md) | Verificación/activación externa; plan definido |
| PUB-16 | [Plan](2026-11-08-pub-16-website-state-propagation-only.md) | Contrato definido; verificar dependencias |
| PUB-17 | [Plan](2026-11-08-pub-17-internal-listing-performance-review.md) | Contrato definido; verificar dependencias |
| PUB-19 | [Plan](2026-11-10-tp02-pub-19-plan.md) | Contrato definido; activación por comprobar |
| PUB-20 | [Decisión vigente](2026-11-10-pub-20-folleto-qr.md) | Folletos de reparto aplazados; no construir ahora |
| SPR-01 | [Plan](2026-11-08-spr-01-listing-tracking-card-completion.md) | Contrato definido; verificar dependencias |
| SPR-02 | [Plan](2026-11-08-spr-02-property-local-history.md) | Código existente; verificar continuidad y pendientes |
| SPR-03 | [Plan](2026-11-08-spr-03-private-property-capture.md) | Contrato definido; verificar dependencias |
| SPR-07 | [Plan](2026-11-08-spr-07-source-and-verification-filters.md) | Contrato definido; verificar dependencias |
| SPR-08 | [Plan](2026-11-08-spr-08-property-notes-viewings-adverts.md) | Contrato definido; verificar dependencias |

## Fuera del alcance actual

Cada código siguiente tiene su destino único en la matriz; no es una nueva tarea para construir.

| Código | Lista | Destino |
|---|---|---|
| BUS-16 | 1 | Catálogo histórico inactivo |
| EST-02 | 1 | Catálogo histórico inactivo |
| EST-03 | 1 | Catálogo histórico inactivo |
| EST-05 | 1 | Catálogo histórico inactivo |
| EST-06 | 1 | Catálogo histórico inactivo |
| EST-07 | 1 | Catálogo histórico inactivo |
| EST-08 | 1 | Catálogo histórico inactivo |
| EST-09 | 1 | Catálogo histórico inactivo |
| EST-11 | 1 | Catálogo histórico inactivo |
| EST-12 | 1 | Catálogo histórico inactivo |
| REG-01 | 1 | Catálogo histórico inactivo |
| REG-02 | 1 | Catálogo histórico inactivo |
| REG-03 | 1 | Catálogo histórico inactivo |
| REG-09 | 1 | Catálogo histórico inactivo |
| REG-10 | 1 | Catálogo histórico inactivo |
| REG-14 | 1 | Catálogo histórico inactivo |
| SAP-04 | 1 | Catálogo histórico inactivo |
| SAP-05 | 1 | Catálogo histórico inactivo |
| SAP-06 | 1 | Catálogo histórico inactivo |
| SAP-07 | 1 | Catálogo histórico inactivo |
| AGE-01 | 2 | Catálogo histórico inactivo |
| AGE-02 | 2 | Catálogo histórico inactivo |
| AGE-13 | 2 | Catálogo histórico inactivo |
| AUT-02 | 2 | Catálogo histórico inactivo |
| AUT-03 | 2 | Catálogo histórico inactivo |
| AUT-06 | 2 | Fase posterior |
| AUT-07 | 2 | Catálogo histórico inactivo |
| AUT-08 | 2 | Fase posterior |
| AUT-12 | 2 | Sustituida por Hermes central |
| AUT-15 | 2 | Catálogo histórico inactivo |
| BUS-02 | 2 | Catálogo histórico inactivo |
| BUS-05 | 2 | Catálogo histórico inactivo |
| MSG-01 | 2 | Excluida por decisión de usuario |
| PRE-01 | 2 | Fase posterior |
| PRE-02 | 2 | Excluida por decisión de usuario |
| PRE-08 | 2 | Excluida por decisión de usuario |
| PRE-24 | 2 | Fase posterior |
| PRE-30 | 2 | Sustituida por Hermes central |
| PRE-31 | 2 | Catálogo histórico inactivo |
| ADM-01 | 3 | Catálogo histórico inactivo |
| ADM-02 | 3 | Catálogo histórico inactivo |
| ADM-04 | 3 | Catálogo histórico inactivo |
| ADM-05 | 3 | Excluida por decisión de usuario |
| ADM-07 | 3 | Catálogo histórico inactivo |
| ADM-08 | 3 | Catálogo histórico inactivo |
| NOT-02 | 3 | Catálogo histórico inactivo |
| NOT-03 | 3 | Catálogo histórico inactivo |
| NOT-04 | 3 | Catálogo histórico inactivo |
| NOT-06 | 3 | Catálogo histórico inactivo |
| NOT-07 | 3 | Catálogo histórico inactivo |
| OFE-01 | 3 | Catálogo histórico inactivo |
| OFE-03 | 3 | Catálogo histórico inactivo |
| OFE-04 | 3 | Catálogo histórico inactivo |
| OFE-05 | 3 | Catálogo histórico inactivo |
| OFE-08 | 3 | Excluida por decisión de usuario |
| PRE-20 | 3 | Catálogo histórico inactivo |
| PRE-21 | 3 | Catálogo histórico inactivo |
| PRE-26 | 3 | Catálogo histórico inactivo |
| VIS-01 | 3 | Catálogo histórico inactivo |
| VIS-02 | 3 | Catálogo histórico inactivo |
| VIS-03 | 3 | Catálogo histórico inactivo |
| VIS-05 | 3 | Catálogo histórico inactivo |
| VIS-07 | 3 | Catálogo histórico inactivo |
| VIS-11 | 3 | Catálogo histórico inactivo |
| VIS-15 | 3 | Fase posterior |
| VIS-16 | 3 | Excluida por decisión de usuario |
| VIS-18 | 3 | Catálogo histórico inactivo |
| ANA-02 | 4 | Catálogo histórico inactivo |
| ANA-07 | 4 | Catálogo histórico inactivo |
| PRE-05 | 4 | Catálogo histórico inactivo |
| PRE-15 | 4 | Catálogo histórico inactivo |
| PRE-17 | 4 | Catálogo histórico inactivo |
| PRE-18 | 4 | Catálogo histórico inactivo |
| PRE-19 | 4 | Catálogo histórico inactivo |
| PRE-23 | 4 | Catálogo histórico inactivo |
| PRE-27 | 4 | Excluida por decisión de usuario |
| PUB-03 | 4 | Excluida por decisión de usuario |
| PUB-15 | 4 | Excluida por decisión de usuario |
| PUB-18 | 4 | Catálogo histórico inactivo |
| PUB-21 | 4 | Fase posterior |
| PUB-22 | 4 | Catálogo histórico inactivo |
| SPR-04 | 4 | Catálogo histórico inactivo |
| SPR-05 | 4 | Catálogo histórico inactivo |
| SPR-06 | 4 | Catálogo histórico inactivo |
| T3D-01 | 4 | Excluida por decisión de usuario |
| T3D-02 | 4 | Excluida por decisión de usuario |
| T3D-03 | 4 | Excluida por decisión de usuario |
| T3D-04 | 4 | Excluida por decisión de usuario |
| T3D-05 | 4 | Excluida por decisión de usuario |
| T3D-06 | 4 | Excluida por decisión de usuario |
| T3D-07 | 4 | Excluida por decisión de usuario |
| T3D-08 | 4 | Excluida por decisión de usuario |
| T3D-09 | 4 | Excluida por decisión de usuario |
| T3D-10 | 4 | Excluida por decisión de usuario |
| T3D-11 | 4 | Excluida por decisión de usuario |
| T3D-12 | 4 | Excluida por decisión de usuario |

## Evidencia que todavía debe llegar

- **G-SOURCES**: Entrega aceptada del Property Directory con identidades/canales/alcance/evidencia, permiso BUS-19 y fixture/mapping/paginación por lector. Reutilizar trabajo existente; no investigar en TP-05. Núcleo propio/manual y funciones puras según TP-04; no inicial/daily externo sin manifiesto.
- **G-MODEL**: Vía compatible Pro/Hermes, condiciones/tratamiento/propósito/clase, control de mejora del modelo y prueba real. Pro no acredita API ni transporte automático. Código con vía deshabilitada y continuación humana; unknown de despacho no permite reintento ciego. C3 nunca a Pro/Hermes/Telegram.
- **G-CHANNELS**: Recepción real correo app/reenvíos seleccionados, calendario Google, destinatarios, WAF/analítica/Search Console según propósito. Conservar motores ya presentes. No acceso al Gmail entero, no nuevas cuentas ni lectura de mensajes aquí.
- **G-POLICIES**: Cobertura/retención/textos/reglas legales-fiscales/datos estructurados realmente aprobados para su actividad, con fecha y referencia privada. Estados pending/manual y contrato de código; ninguna inferencia de cumplimiento por check o plan. Sin buscar contratos o enviar instrucciones nuevas a Hermes.
- **G-ACCOUNTS**: 2FA/recuperación, Access/IdP/hosts/audiences/clientes, permisos/costes de backup y custodia, pruebas de restauración, aceptación Wix y titularidad por producto. Access decidido dentro de fase. Construcción aislada del código definido; no configuración/corte/baja/restauración reales por este plan.
- **G-BASELINE**: Mediciones reales con fuente/fecha o ausencia declarada. Preparar medición, no cifras inventadas.
- **G-DEMAND**: Identidad/calidad y revisión de inferencias, autorización vinculada al hash/versión, snapshot y destino real, verificación física QR. Umbral5 no certifica anonimato. Construcción privada/deshabilitada, sin publicar demanda o folletos aquí.

Ninguna lista de checks sustituye evidencia real. No contactar proveedores/Hermes ni leer cuentas, correos, bases privadas o contratos desde este cierre. La investigación pendiente se recibe y acepta en su tarea; publicación, activación y configuración se encargan por separado.


## Entrega documental solicitada para GitHub

Luis pide publicar todos estos planes con la cuenta Luismadef45. Se incorporó main47dab2c sin conflicto, conservando los161documentos locales; REG-17 referencia su conciliación vigente: captura publicada y tarea parcial hasta consumo VIS-17, sin reconstruirla ni repetir0026. Los estados `published:false`, actividad y las expresiones «local/sin publicar» de ledgers/specs describen su fecha de preparación; no son indicadores en vivo. La presencia de esta entrega en el commit/rama de GitHub acredita publicación de documentos, nunca construcción o activación del producto. [Registro de entrega](2026-11-10-plans-publication.md).
