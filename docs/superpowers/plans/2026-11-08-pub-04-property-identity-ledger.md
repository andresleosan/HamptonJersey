> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-04 · Ledger de planificación

Fecha: 8-nov-2026. Lista 4. Luis eligió PUB-04 manteniendo el encargo de solo planes listos para construir.

## Base y conservación

- Copia exclusiva [copia local de planificación]; main/base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Verificador 2026-11-08T13:26:25Z: salida 0, main/HEAD/GitHub iguales y copia limpia al iniciar.
- Planes anteriores conservados íntegros en sus copias. No se copian sesiones, secretos o documentos privados de Luis.
- CLI local `plan --list 4 --task PUB-04`: planning, reserved:false, buildAuthorized:false. Sin init/credenciales/coordinador, reservas, leases, scope/watch/submit/complete.
- [Spec](../specs/2026-11-08-pub-04-property-identity-design.md) y [plan](2026-11-08-pub-04-property-identity.md). Original privado ausente; fuentes públicas suficientes.

## Lecturas y decisiones

| Criterio | Evidencia/decisión | Pruebas futuras |
| --- | --- | --- |
| A1/A2 datos | validateListing/checkPrice/merged row; D1/D2 y tabla tipada. | V1/V2/API1/API2. |
| A3 exposición | toPublic location→place y readLive→pub; D3/D4/D13. | P1/P2/UI1. |
| A4 identidad | createListing idPrefix/nextId y ID bloqueado en whitelist. D8. | ID1/FKs/canonical. |
| A5 estado/promotor | PUB-05 local ya define property_condition con existing separado de good/null. D6/D7. | Enum compartido/UI2. |
| A6 parroquia/confirmación | withFeatures lee textos actuales; confirmed_at solo ante precio/disponibilidad. D9. | L1/API/historial. |
| A7 historia | EST-18 enumera campos estructurados y texto libre por nombre. D11. | EV1–EV4. |
| A8 interfaz/import | field/ctl/Save/Discard, parser y whitelists actuales. D5/D12. | UI1–UI4/import. |

Referencia postal externa consultada el 8-nov-2026: Jersey Post, [addressing standards](https://www.jerseypost.com/letters-and-parcels/resources/addressing-standards/) y [Address Finder](https://www.jerseypost.com/tools/address-finder/). Se usa para separación de componentes, uppercase y lookup manual; regex permisiva es propuesta del plan, no registro oficial de distritos/asignación. No se enviaron direcciones de clientes ni datos locales a esos servicios.

## Skills y límites

Brainstorming/grill-me resuelven exposición, unknown, país, estado compartido e ID estable. Writing-plans estructura ejecución. Impeccable, seguridad, antislop durante trabajo, rendimiento y ponytail concretados en el plan; taste/redesign no aplican al formulario existente. Sin nueva API, geocodificador, assets o infraestructura.

## Comprobaciones y cierre

- [x] GitHub y catálogo local verificados, sin reservas ni credenciales.
- [x] Tarea/checklist/arquitectura/contrato PUB-05, validación, rutas, proyección pública, SEO, importación y eventos revisados por lectura.
- [x] Revisión independiente `pub04_builder_check`: sin contradicciones bloqueantes. Precisados link solo Jersey, hint solo con código no vacío válido y PASS inicial legítimo para regresiones de contratos que ya se conservan. Incorporado proveedor único CONDITION_LABELS para evitar enums duplicados con PUB-05.
- [x] Comprobación final: tres Markdown propios, enlaces válidos, D1–D13/A1–A8 y firmas/rutas existentes verificados; ejemplos de regex/normalización propuesta PASS. No es una prueba de asignación postal real.
- [x] `git diff --cached --check` salida 0 y `node scripts/render-roadmap.mjs --check` salida 0, 250 tareas/250 unidades; ningún archivo de producto o roadmap general modificado.
- Playwright: no aplica a documentos. Pruebas de producto/build/e2e/migraciones: no ejecutadas; Tasks 1–4 son futuras.
- Sin implementación, publicación, despliegue o migración; no marcar PUB-04 construida ni cambiar el tablero por terminar documentos locales.

Siguiente recomendado Codex: /avanzar PUB-07 · gpt-6.1-terra · high · solo planificación. Su pendiente incluye datos/documentos de licencia, energía, ocupación y abogado; conviene fijar clasificación, caducidad y acceso sin convertir datos registrados en cumplimiento certificado. Modelo/esfuerzo comprobados en catálogo local; no cambia la sesión actual.
