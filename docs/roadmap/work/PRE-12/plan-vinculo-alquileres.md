# PRE-12 · Plan: vínculo de alquileres con contactos (16-nov-2026, solo planificación)

**Objetivo.** Que una solicitud de privacidad encuentre los alquileres de una persona y que la conservación sepa de ellos, mediante un vínculo inquilino→contacto confirmado por una persona del equipo, nunca deducido. Cierra «vínculo de alquileres con contactos» de la ficha (`docs/roadmap/tasks/PRE-12.json:10`). Hoy la supresión dice `{ item: "rentals", count: null }` (`server/privacy-requests.js:218`) y la copia solo nombra la sección `rentals` como revisada aparte (`server/privacy-requests.js:274`), porque «Rentals are not linked to contacts» (`server/privacy-requests.js:144-145`; `docs/roadmap/work/PRE-12/plan.md:9`).

## Datos actuales con datos de personas (de las migraciones)

- `tenancies` (`migrations/0013_rentals.sql:36-39`): `tenant_name` (obligatorio), `tenant_email`, `tenant_phone`, `occupants` (texto libre, otras personas); además `notes`, `notice_by`, fechas, `rent`, `deposit*` y `opening_balance`. 0073 añade `agreement_on` y `law_scope` (sin datos de personas).
- Datos económicos ligados por `tenancy_id`: `rent_changes`, `charges`, `payments.description`, `arrears_steps.note` (0013), `tenancy_deposit_proposals/outcomes` (0059).
- Texto libre y referencias por `tenancy_id`: `tenancy_signed_contracts`, `tenancy_entry_inventories` (0056), `tenancy_exit_inventories` (0059), `rental_inspections` (0060), `tenancy_signature_evidence` (roles, nunca nombres: `0103:5`), `repairs.detail` (0013).
- Ya relacionan alquiler y persona: `tenancy_origins.applicant_id` (id plano elegido a mano, sin FK: `migrations/0056_tenancy_origins.sql:3-5`; el borrador copia nombre, email y teléfono del contacto: `server/tenancy-origins.js:76`) y `case_grants.source_revision` = hash de `tenant_email` (`migrations/0110_case_access.sql:3-4`).
- Otras personas en alquileres, fuera de este plan: `landlords.name/email/phone` (0013:4-6), `suppliers` (0089), `repairs.contractor`.

## Vínculo propuesto

Vínculo explícito tenancy→contact que confirma un admin, uno a uno, como las visitas de 0111 (fuente: diseño «visitas con vínculo explícito», `docs/superpowers/specs/2026-11-08-l1b-privacy-requests-design.md:41`; prueba prevista `no_select_star_or_inferred_rental_link`, `docs/superpowers/plans/2026-11-08-l1b-privacy-requests.md:49`). Nunca automático por email o teléfono, aunque la arquitectura trate el mismo email o móvil como el mismo contacto (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md:220`): aquí solo propone candidatos. Los candidatos son inquilinos con el mismo email, o el mismo teléfono normalizado como en `matchedViewings`, más el contacto del solicitante de origen ADM-06 si existe. La confirmación guarda el hash SHA-256 de `tenant_name|tenant_email|tenant_phone` leído en ese momento. Si esos campos cambian, el vínculo deja de valer hasta confirmarlo de nuevo (precedente `source_revision`, 0110). Cambiar un vínculo borra la revisión de la copia de las solicitudes abiertas de ese contacto (como `decideViewing`).

**Migración aditiva `0113_tenancy_contact_links.sql` (boceto):**
```sql
CREATE TABLE tenancy_contact_links (id INTEGER PRIMARY KEY,
  tenancy_id INTEGER NOT NULL REFERENCES tenancies(id), -- las tenancies no se borran (R19)
  contact_id INTEGER NOT NULL,                          -- sin FK: no bloquea el Delete de un contacto (como 0111)
  linked INTEGER NOT NULL CHECK (linked IN (0, 1)), tenant_revision TEXT NOT NULL CHECK (length(tenant_revision) = 64),
  actor TEXT NOT NULL, at TEXT NOT NULL);                -- solo ids; cuenta la última fila por (tenancy, contact)
CREATE INDEX tenancy_contact_links_contact ON tenancy_contact_links (contact_id, tenancy_id, id);
CREATE INDEX tenancy_contact_links_tenancy ON tenancy_contact_links (tenancy_id, contact_id, id);
```

## Uso en la copia, la supresión y la conservación

- **Copia de acceso y portabilidad:** sección `tenancies`, solo con vínculos vigentes y columnas explícitas: `id`, `rentals.address`, `parish`, `kind`, `start_on`, `end_on`, `ended_on`, `notice_given_on`, `notice_by`, `agreement_on`, `tenant_name`, `tenant_email`, `tenant_phone`. Quedan en `not_included`, con su motivo: `occupants` (terceros o menores), `notes`, datos del propietario y de la gestión (`landlord_id`, `service`, `fee_percent`), económicos (renta, depósito, cargos, pagos, atrasos, propuestas de depósito) y contratos, firmas, inventarios, inspecciones y reparaciones (spec:41; plan maestro `docs/roadmap/2026-11-10-plan-maestro-vigente.md:24`). Sin vínculos, la copia y su huella no cambian: se mantiene la entrada `rentals` actual, como pasó con las visitas.
- **Plan de supresión:** `by_hand` pasa a `{ item: "tenancies", count: n vinculadas }`, más los candidatos sin decidir. Nunca borra ni anonimiza una tenancy: «Contratos, pagos y alquileres conservan su política propia» (spec:7) y «política sectorial pendiente no activa nueva purga de ventas/alquileres» (spec:57).
- **Conservación:** no se añade ningún plazo nuevo. El tramo tras terminar el alquiler lo fija el abogado (PRE-33: `docs/roadmap/tasks/PRE-33.json:10`; evidencia de PRE-12, «solo ese tramo»). Lo único que se propone es un hold (D4) que reutiliza las excepciones de `server/retention.js:16-35`. Con el interruptor apagado o sin 0113, el SQL de la limpieza queda idéntico byte a byte.

## Puntos de interfaz

- `admin/src/RentalDetail.jsx`, tarjeta de la tenancy: «Contact», con los candidatos, Confirm / Remove y quién y cuándo.
- `admin/src/PrivacyRequests.jsx`: tarjeta «Tenancies to check» junto a «Viewing requests to check» (línea 242), con el mismo endpoint. Solo admins (401/403); con la solicitud cerrada, 409.

## Pruebas a escribir

`tests/server/tenancy-contact-links.test.mjs` cubre:
- Apagado o sin 0113: 404, misma copia y misma huella, `rentals: null` y SQL de limpieza idéntico.
- Una coincidencia de email o teléfono no escribe ningún vínculo.
- Append-only: cuenta la última decisión.
- Cambiar nombre, email o teléfono invalida el vínculo.
- Columnas explícitas y `not_included` completo.
- La supresión no borra tenancies.
- El hold solo aplica a tenancies en curso.
- El Delete del contacto no queda bloqueado.
- Permisos y estado de la solicitud.

Además se ajustan las tres aserciones `['rentals', null]` de `tests/server/privacy-requests.test.mjs:158,168,359` (siguen así con el interruptor apagado) y se añade un e2e aislado `tests/pre12-tenancy-link.e2e.cjs` (1280/390).

**Interruptor:** `PRE12_TENANCY_LINK_READY`, `"0"` en los dos `wrangler.toml` y apagado por defecto en código.

## Decisiones abiertas para Luis (cada una con recomendación)

- **D1 · Alcance:** (a) vínculo duradero tenancy→contact, reutilizado por cualquier solicitud y por la limpieza, o (b) confirmación por solicitud, como 0111. **Recomendado (a)**: la conservación necesita un vínculo que exista fuera de una solicitud (ficha `PRE-12.json:10`, spec:41).
- **D2 · Origen ADM-06:** el contacto del solicitante de origen se ofrece como candidato y hace falta un clic, o se vincula solo. **Recomendado: candidato y clic**, porque el inquilino del contrato puede ser otra persona del hogar (`server/tenancy-origins.js:2`, `0056:3`).
- **D3 · Contenido de la copia:** **recomendado** dar identidad, dirección y fechas, y dejar fuera lo económico, `occupants`, las notas y los contratos, hasta que haya política validada (plan maestro:24, spec:41).
- **D4 · Hold:** **recomendado** que una tenancy vinculada y en curso (`ended_on` nulo o futuro) retenga al contacto en la limpieza y en el Delete manual, y que una terminada no retenga nada ni tenga plazo hasta PRE-33 (spec:7, spec:57). Alternativa: ningún hold hasta PRE-33.
- **D5 · Propietarios:** `landlords` sigue sin vincularse a contactos. **Recomendado: tarea aparte después**; 0090:27 ya los mantiene borrables.
- **D6 · Trigger append-only:** el encargo limita 0113 a CREATE TABLE/INDEX. **Recomendado** añadir el `BEFORE UPDATE` como 0111:20-21. Si no, el append-only queda solo en código y pruebas.
