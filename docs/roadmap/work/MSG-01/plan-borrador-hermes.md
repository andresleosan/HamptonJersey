# MSG-01 · Borrador de Hermes para las respuestas de Facebook (plan de una página)

**Qué:** en Messages › Facebook, una persona pulsa **Draft with Hermes** en una conversación. Hermes, en el VPS, escribe una propuesta de respuesta y la propuesta rellena la caja de respuesta. Una persona la revisa, la cambia si quiere y la envía con el botón de siempre. Hermes nunca envía. Todo se construye apagado.

**Por qué ahora, si `plan.md` decía «tras PRE-32»:** PRE-32 está hecha (17-nov: ChatGPT Pro por Codex, DeepSeek de reserva, C3 fuera). Además, el 25-nov Luis dio su sí al «borrador de Hermes para Facebook (una persona aprueba cada respuesta)» ([CONTINUIDAD](../../CONTINUIDAD-AVANZAR.md), síes del 25-nov).

## Decisiones

| Decisión | Fuente |
| --- | --- |
| Lo pide una persona, conversación a conversación (nunca se pide solo al llegar un mensaje). | Spec 2026-11-08 §6: «Suggested reply requiere Use/Edit/Discard y envío humano explícito»; mínimo gasto del plan de Luis. |
| Solo pueden pedirlo los de `hermes_drafters` (AUT-15), como los textos de fichas. | AUT-15: gastar el plan de Luis. |
| Tabla nueva y aditiva `channel_reply_drafts` (id, conversation_id → channel_conversations ON DELETE CASCADE, last_message_id, status queued/working/draft/used/discarded/failed, attempts, text, requested_by, timestamps). Una abierta por conversación (índice único parcial). | La CHECK de `jobs` no se puede ampliar de forma aditiva (regla de migraciones de CONTINUIDAD). |
| Interruptor propio `MSG01_HERMES_DRAFTS_READY = "0"` en los dos `wrangler.toml`. Apagado: no hay ruta, no hay botón y la puerta responde 404. | Patrón de los demás interruptores. |
| La puerta tiene su propia llave (`/hermes/replies/*`, `HERMES_REPLY_KEY`), como el correo y el mercado. Sin llave, o si coincide con otra, responde 401. No se crea ningún secreto. | Contrato de `HERMES_KEY`: solo datos públicos y recuentos (H6, H7). |
| Lo que recibe Hermes: solo el texto de los últimos mensajes (máximo 10 y 4.000 caracteres en total), marcados in/out, con su hora. Nunca el nombre, los ids de Facebook, el contacto vinculado ni datos de otras tablas. | Datos mínimos; C3 fuera de Hermes (PRE-32). |
| La propuesta caduca si después llega otro mensaje del cliente (`last_message_id`), si la conversación se marca como atendida o si se borra (cascade). Una propuesta caducada no se muestra para usar. | Spec §6: revalidar la última versión antes de usar. |
| El reloj no reintenta a ciegas: lo tomado y sin propuesta en 10 minutos vuelve a la cola, y al tercer intento queda como `failed`. Igual que `jobs`. | `nextJob` de `server/routes/hermes.js`. |
| El lado de Hermes es un script del repositorio (`hermes/respuestas.mjs` + `hermes/skills/hampton-respuestas/`) con un tono fijo: inglés, breve, de Hampton Estates, sin inventar precios, disponibilidad ni citas, y sin pedir datos sensibles. No se instala. | El sí de instalación del 25-nov no lo cubre. |

## Pruebas (primero las que fallan)

`tests/server/msg-01-hermes-drafts.test.mjs`:
- Apagado o sin migración: 404, sin botón (`facebook.drafts` ausente en la respuesta del panel).
- Sin la llave propia, o con `HERMES_KEY`: 401.
- Lo que sale por la puerta lleva solo el texto, con tope, y ningún nombre ni id.
- Uno abierto por conversación.
- Caduca con un mensaje nuevo, al marcar la conversación como atendida y al borrarla.
- Solo `hermes_drafters`.
- Los dos `wrangler.toml` llevan el mismo interruptor, apagado.

Además, una prueba de la migración (solo añade) y la profundidad D1 (≤ 90).

## Encender (no en esta construcción) → COLA-LUIS

1. Pregunta a Luis: el texto del cliente va al modelo de Hermes (ChatGPT Pro; DeepSeek de reserva). ¿Se acepta, o solo con el proveedor principal? ¿Qué dice el aviso de privacidad («Messages on Facebook»)? Depende también de PRE-13 (acuerdos de tratamiento).
2. Luis crea `HERMES_REPLY_KEY` (Cloudflare Pages + custodio del VPS) y da el sí para instalar el script en Hermes.
3. Se enciende `MSG01_HERMES_DRAFTS_READY` y se prueba con su mensaje de prueba.
