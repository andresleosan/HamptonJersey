# AGE-14 · Mapa de copias de datos personales de anunciantes

Datos personales en alcance (spec AGE-04): nombre de un particular (`kind = individual`) y, de cada contacto, nombre, correo y teléfonos. No se amplía a otros datos.

| Lugar | Cómo se detecta en la vista previa | Qué hace la supresión |
|---|---|---|
| `advertisers.name` (particular) y `details.contacts` | Rutas de campo, sin valores | Nombre → «Personal data removed»; contactos vaciados; `suppressed_at` + trigger permanente |
| `advertisers.details` resto (tipo, canales, fuentes, listings, notas) | `kept_fields` | Se conserva; la UI pide editar notas/canales antes si contienen datos personales |
| `advertiser_reviews` (decisión 11/12 meses) | `kept_fields: reviews` | Se conserva sin cambios; la supresión no simula actividad |
| `outbound` en `draft`/`queued` al correo del contacto | Recuento | Se cancela en la misma transacción |
| `outbound` enviado/fallido/cancelado | Recuento | Se conserva bajo la retención de correo; bloquea «supresión completa» |
| `email_inbound` (remitente, destinatario o `From`) | Recuento | Se conserva bajo la retención de correo; bloquea «supresión completa» |
| `research_sources.agent_or_site` de fuentes vinculadas igual a un nombre | Recuento | Se conserva con la fuente; bloquea «supresión completa» |
| `market_observations.raw_json` con correo o teléfono | Recuento; sin tabla (0043 no aplicada) = `not_installed` | Se conserva con la fuente; bloquea «supresión completa» |
| Cualquier comprobación que falle | `could_not_check` | Bloquea «supresión completa» |

Fuera de la app y no acreditado: copias de seguridad de D1, buzones/proveedor de correo y pestañas suspendidas que ya leyeron el dato. La detección es por texto exacto (correo en minúsculas, teléfono tal como se escribió, mínimo 6 caracteres): variantes de formato no se detectan.
