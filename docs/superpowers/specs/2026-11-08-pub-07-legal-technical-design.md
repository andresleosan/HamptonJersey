> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-07 · Datos legales y técnicos de la ficha

Fecha: 8-nov-2026 · Base examinada: `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` · Estado: propuesta para construir; no implementada.

## Objetivo y límites

Añadir al editor de la ficha licencia de vivienda en alquiler, certificado energético si existe, ocupación y contacto del abogado del vendedor. Conservar los campos existentes de tenencia, categoría y restricción y su comportamiento de matching. Son datos declarados por el equipo, no una evaluación automática de cumplimiento ni una comprobación de autenticidad. Todos los campos nuevos son opcionales y privados; no alteran los requisitos actuales de publicación.

BUS-13 permanece parcialmente bloqueada: Hampton debe aportar la categoría de HE-R001, HE-R003 y HE-R027 y un abogado de Jersey debe validar la tabla de residencia. No inferir categorías, escribir valores en producción, cambiar reglas de matching ni declarar esa dependencia resuelta. Preparar una petición para Hampton con los tres identificadores y el dato `Qualified` o `Registered`; enviarla requiere una instrucción explícita. La información privada de Hampton no está en esta copia; no inventar respuestas.

## Contrato propuesto

Cada campo es nullable; ausencia en PUT conserva el valor guardado, `null` o cadena vacía limpia; una entrada inválida devuelve errores por campo y no guarda nada. Crear y actualizar usan la misma whitelist y validación del servidor. Campos existentes conservan sus significados, especialmente `restriction` vacío = ninguna y `housing_category` vacío = desconocida.

| Campo de listings | Contrato y presentación interna |
|---|---|
| `rental_licence_status` | `null` desconocido, `not_applicable` no aplica según el equipo, `recorded` registrado. No deducirlo de operación ni país. |
| `rental_licence_reference` | Texto opcional, recortado, máximo 200 caracteres. Solo con estado `recorded`. |
| `rental_licence_expires_on` | Fecha opcional `YYYY-MM-DD`, fecha real años 0001–9999 (comprobar año >= 0001 además de `realDate`, que admite 0000), solo con `recorded`. Se permite vencida: es un dato histórico. |
| `energy_certificate_status` | `null` desconocido, `not_available` no disponible, `recorded` registrado. No decidir su obligatoriedad. |
| `energy_certificate_reference` | Texto opcional de máximo 200 caracteres, solo con `recorded`. |
| `energy_certificate_expires_on` | Fecha opcional real, mismo formato, solo con `recorded`; se permite vencida. |
| `occupancy` | `null` desconocida, `vacant` vacía, `tenanted` alquilada; no derivarla de disponibilidad ni sincronizarla con tenancies. |
| `seller_lawyer_firm`, `seller_lawyer_name`, `seller_lawyer_email`, `seller_lawyer_phone` | Datos opcionales de contacto de ficha; texto recortado máximo 120 cada uno, email validado con `EMAIL` existente. No exponer públicamente. |

Las validaciones cruzadas se ejecutan sobre la fila combinada en creación y edición. Si se cambia un estado a desconocido o al estado alternativo, borrar explícitamente referencia y fecha en la misma solicitud; si quedan, responder 400 con errores visibles y conservar todo. El editor ofrece confirmación visual del cambio mediante los campos todavía visibles y sus errores, sin borrado silencioso. `recorded` puede carecer de referencia o fecha: no representa verificación. No crear un estado «vigente», alerta automática, fecha calculada ni insignia de cumplimiento. Mostrar la fecha guardada sin clasificarla. No subir archivos, guardar enlaces ni copiar identificadores de documentos a campos públicos.

## Experiencia y límites de datos

Agrupar «Legal and technical» en `ListingEditor`, manteniendo los controles actuales y sus ID, y los cuatro datos nuevos en el mismo Save/Discard, control de conflictos `updated_at`, errores vinculados y restauración del borrador. Mostrar siempre los controles de licencia y certificado, también vacíos y en cualquier operación; no perderlos cuando cambia la operación. Explicar brevemente «Recorded by the team; not verified» y que fecha vacía significa desconocida. La ocupación es una observación independiente de `availability`. Los controles de referencia/fecha permanecen visibles cuando contienen valores que el usuario debe limpiar.

Los datos nuevos se devuelven en las respuestas autenticadas existentes que incluyen la ficha completa, no a `toPublic`, SEO, JSON-LD, sitemap, mensajes, listados públicos ni logs; tampoco a `specs`, `location`, descripción o importaciones automáticas. La cola comparte `createListing`: para `context.source === "queue"`, rechazar con error por campo cualquier clave nueva de PUB-07 presente, incluso null; no descartarla silenciosamente. El borrador fallido vuelve a ready según el flujo existente. Las importaciones de carpeta conservan su whitelist. El endpoint de edición sigue el modelo de sesión/CSRF actual. Las personas con acceso existente al editor pueden verlos; no se promete un nuevo sistema de permisos. No colocar datos personales en localStorage. Las cadenas se renderizan como texto React, sin HTML y con SQL parametrizado.

El abogado de la ficha y los cuatro campos del abogado en `sales` son datos independientes: crear una venta no los copia ni los sobrescribe, editar cualquiera no cambia el otro; una venta ya abierta o posterior puede tener un contacto distinto. `rentals.compliance_items` pertenece al alquiler gestionado y sus avisos; la ficha no lee, copia, actualiza ni invalida esa información. Los nuevos campos tampoco establecen reglas para publicar, matching o avisos. Guardar conserva el recálculo actual de features y matching y solo los campos que hoy confirman disponibilidad pueden cambiar `confirmed_at`.

## Persistencia y trazabilidad

Migración aditiva usando el siguiente número libre en la base real al construir; no reservar número. Añadir columnas y CHECK para enums, y recrear los triggers de `migrations/0029_listing_events.sql` preservando sus campos existentes y cualquier migración integrada después. En eventos, incluir solo nombres de campos nuevos en `fields`/`changed`; no incluir valores, referencias, fechas ni datos del abogado en `before`/`after`. Mantener creación/actualización atómicas, reloj y control optimista. Los datos heredados quedan `null` y no se realiza backfill. La migración requiere autorización separada para aplicación.

## Comprobación de aceptación

A1. Crear, leer, editar parcialmente, limpiar y descartar cada dato; `null` distingue desconocido de estados explícitos.
A2. Validar enum, tipo, longitud, email y fechas reales; comprobar datos mezclados y 400 atómico al cambiar estado dejando referencia o fecha.
A3. Dos editores: 409 ante `updated_at` obsoleto, sin pérdida de datos; cambios no alteran `confirmed_at` ni introducen una nueva regla de publicación.
A4. Ficha privada y evento sin valores sensibles; API pública, página, SEO, JSON-LD, sitemap y trabajos Hermes no exponen los campos nuevos. Las respuestas autenticadas del detalle y de media que devuelven la ficha completa siguen accesibles según el permiso de panel actual.
A5. Sales y Rentals permanecen independientes al crear/editar ficha y venta; no se generan alertas ni se calcula validez.
A6. Categoría/tenencia/restricción y matching existente mantienen sus pruebas, incluyendo desconocido; BUS-13 sigue pendiente de Hampton y del abogado.
A7. Cola e importaciones no incorporan estos campos implícitamente; entrada no autorizada no elude validaciones y no se cambia el contrato de importación.
A8. Teclado, foco, errores, recuperación, 200 % zoom, 390 y 1280 px; fecha y cambios de estado accesibles, sin pérdida silenciosa.

## Origen

[Catálogo PUB-07](../../roadmap/tasks/PUB-07.json), [BUS-13](../../roadmap/tasks/BUS-13.json), [arquitectura §5.10](../../roadmap/2026-10-23-arquitectura-hampton-app.md), `server/listing.js`, `server/routes/listings.js`, `server/routes/sales.js`, `migrations/0013_rentals.sql` y `migrations/0029_listing_events.sql`. Esta propuesta no establece plazos ni obligaciones legales.
