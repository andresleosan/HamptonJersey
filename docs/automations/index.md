# Fichas de automatización · AUT-09

Cada automatización que existe en el código o que tiene tarea en `docs/roadmap/tasks/` tiene su ficha con la misma [plantilla](TEMPLATE.md): propósito, disparador, entradas y clase de datos, salidas, guardas humanas y modo, interruptor, coste y límite, código, pruebas que la cubren y criterio de hecho. Lo que no se sabe está escrito como desconocido o `null`. `tests/server/automation-cards.test.mjs` falla si falta un campo, si el estado no es activa, apagada o prevista, si la tarea dueña no existe, si una ficha cita una prueba o un archivo que no existe, o si esta tabla no coincide con las fichas.

Inventario hecho el 14-nov-2026 leyendo `server/jobs.js`, `jobs/wrangler.toml`, `wrangler.toml`, `server/routes/hermes.js`, `server/routes/automations.js` y la migración 0054. «Activa» quiere decir que el código corre con la configuración del repositorio; lo que pasa en producción se toma de la ficha de la tarea dueña y no se ha comprobado aquí.

| Ficha | Estado | Tarea dueña | Qué hace |
|---|---|---|---|
| [`clock`](clock.md) | activa | AUT-07 | Reloj cada 10 minutos que lanza las pasadas vencidas |
| [`retention_daily`](retention_daily.md) | activa | PRE-12 | Borrado diario por conservación (contactos, visitas, trabajos, chats, correo) |
| [`demand_retention`](demand_retention.md) | apagada | PUB-19 | Poda diaria de matrices privadas de demanda |
| [`notifications_reconcile`](notifications_reconcile.md) | activa | NOT-01 | Conciliación de avisos y tareas del Inbox |
| [`weekly_insights`](weekly_insights.md) | activa | ANA-08 | Foto semanal de Insights en el Inbox |
| [`sale_followup_weekly`](sale_followup_weekly.md) | activa | OFE-06 | Tarea semanal de revisión por venta, cuando el equipo fija el horario |
| [`rental_closure_withdrawal`](rental_closure_withdrawal.md) | apagada | PUB-16 | Retirada de alquileres a las 24 horas |
| [`email_outbound`](email_outbound.md) | apagada | AUT-17 | Resumen diario por correo al equipo |
| [`email_inbound`](email_inbound.md) | apagada | AUT-17 | Recepción de respuestas por correo |
| [`team_channel_notices`](team_channel_notices.md) | activa | AUT-14 | Avisos y resumen de las 08:00 en el canal de Telegram, sin IA |
| [`listing_text`](listing_text.md) | apagada | AUT-13 | Borrador de texto de ficha por Hermes |
| [`folder_import`](folder_import.md) | apagada | PUB-21 | Propuesta de ficha desde una carpeta de Drive por Hermes |
| [`market_ambiguity_v1`](market_ambiguity_v1.md) | prevista | BUS-09 | Propuesta de IA ante ambigüedad del mercado |
| [`hampton_intent_v1`](hampton_intent_v1.md) | prevista | MSG-04 | Propuesta de IA de intención de chat |
| [`search_review_21d`](search_review_21d.md) | prevista | BUS-17 | Revisión interna a los 21 días sin opción completa |
| [`ready_for_team`](ready_for_team.md) | prevista | AUT-18 | Línea «Ready for the team» en el resumen de las 08:00 |
| [`criteria_dictation`](criteria_dictation.md) | prevista | AUT-19 | Dictado de criterios con confirmación del empleado |
| [`hampton_bot_telegram`](hampton_bot_telegram.md) | prevista | AUT-16 | Asistente de Luis por Telegram |

## Lo que no tiene ficha, y por qué

- **Pause all outbound** (AUT-11) y los **modos Draft/Approve/Auto** (AUT-10): son controles de las automatizaciones, no automatizaciones. Sus pruebas están en `tests/server/hermes.test.mjs`, `tests/server/automations.test.mjs` y `tests/server/aut-10-*.test.mjs`.
- **Salud de fichas** (`LISTING_HEALTH_READY`), **Widen criteria** y el **recálculo de matches**: se calculan al abrir una pantalla o al guardar un cambio, sin reloj ni cola propios.
- **Política de purga de fotos** (`server/property-photo-purge.js`): cálculo sintético sin productor ni tarea dueña identificada; tendrá ficha cuando exista su tarea.
- **Chat web** (MSG-02): respuesta humana desde el panel, sin automatización; su borrado a los 30 días está en `retention_daily`.

## Registro de propósitos de IA

`server/automation-contracts.js` conserva los identificadores, la versión, operaciones, clases previstas y puntos de decisión humana de los tres propósitos de IA (`listing_text`, `market_ambiguity_v1`, `hampton_intent_v1`). Solo cubre propósitos de IA y por eso no se amplía con las automatizaciones sin modelo: sus campos (clases de datos, puerta de modelo, decisiones humanas) no les aplican y `server/operation-policy.js` lo consume para los modos. Su validación solo compara una definición con el registro cerrado: **no autoriza acceso a datos, gasto, modelos, cuentas, envíos ni modos**. Una clase prevista no sustituye la clasificación y autorización del dato concreto; una lista de clases vacía significa que no hay ninguna acreditada. C3 no se habilita a través de este registro.

Los cuatro puntos humanos del diseño permanecen explícitos: aprobar un match, consultar ante un imprescindible desconocido, resolver una búsqueda y revisar una presentación. El registro es declarativo; las barreras reales las aplican los servicios dueños antes de cada efecto.

[acceptance.json](acceptance.json) contiene únicamente estados pendientes y referencias vacías de esos tres propósitos. No contiene casos reales ni demuestra proveedor, modelo, calidad o activación. Para cada propósito de IA faltan los casos reales y adversarios, el umbral decidido para su diseño y la evidencia de su ejecución; ningún umbral universal se deduce aquí. Coste y moneda desconocidos son `null`; alcanzar un límite o no conocer el coste requiere revisión, no una autorización de gasto.

Estas fichas no activan nada ni cambian rutas, migraciones o comportamiento productivo.
