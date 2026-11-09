# BUS-08 · One daily Jersey sweep Implementation Plan

> Entrega documental para construcción: leer primero el [índice vigente](2026-11-09-list2-build-ready-github.md) y el complemento indicado para este código. Las bases, estados de publicación y preguntas de la redacción original son históricos; las decisiones confirmadas del índice y del complemento gobiernan. Construcción, integración y activación se acreditan por separado.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Sólo planificación aquí; otra sesión construye.

**Goal:** Concretar Run diario01:00Europe/Jersey, una vez por fecha local.

**Architecture:** Complemento del plan anterior: ambos se leen juntos. El original define la funcionalidad completa; este cierre fija contratos compartidos, etapas y casos que no pueden suponerse. Reutilizar el servicio dueño sin otro motor.

**Tech Stack:** JavaScript ESM, D1/R2 y React existentes; módulos de repo para runtime sólo cuando se indique, sin instalar servicios en este encargo.

**Spec:** [Diseño de cierre](../specs/2026-11-09-list2-market-contracts-design.md); [plan anterior](2026-11-08-bus-08-daily-market-sweep.md); [tanda](2026-11-09-list2-build-ready-github.md).

**Estado del plan:** specified. Diseño de código no equivale a activación real ni a terminar el original entero.

**Integrar antes:** BUS-06:runner, BUS-19:persisted-policy, BUS-09:normalization, BUS-10:identity

**Decisiones pendientes:** Ninguna nueva elección de producto de esta tanda.

## Global Constraints

- Sólo documentos. No código, cuenta, inferencia, envíos, scraping, migración o publicación desde esta sesión. Base4858fdbf7a537990ac63559be8a6ead39884c563; al construir revisar main/contratos/ordinal libre despuésde0036. Protocolo antiguo de reservas retirado; la regla posterior de progreso compartido requiere activity cuando esté disponible. Esta copia devuelve activity_unavailable: planificación local permitida, sin afirmar visibilidad en vivo. Un escritor por copia y turnos para construcción compartida.
- Maestro vigente: Hermes/Pro central y propósitos verificados; C3 nunca Hermes/Pro/Telegram. Meta/WhatsApp/Places-Properties/modeloslocales fuera de esta fase. Ninguna API pagada alternativa automática. Acuerdos los gestiona Hermes con instrucciones existentes; no pedirlos ni buscarlos aquí. L2C01 yL2C02 están resueltas: respuestas de la app y reenvíos seleccionados desde Gmail; derivación humana con un aviso por incidencia si la IA no puede actuar. La dirección concreta se configura por canal privado, no en Git.
- 01:00Jersey para mercado; fotos/permisos/identidad y disponibilidad separados; mascotas MUST cuando existen, parking flexible nuevo sin rebajar MUST confirmado. Presentación exige revisión extra y enlace hasta revocación; no heredar ese enlace para otros datos. Código, dependencia integrada, cobertura y activación son estados distintos.
- Seguridad: staff/same-origin/no-store, CAS/revisión, operation_id, actor/origen por servidor, enums y pertenencia. Sin PII/prompts en logs/storage/Telegram/jobs90días. Contenido conserva retención de origen. Límites JSON128KiB/listas50, polling30s sólo visible, sin URL/fetch/SQL arbitrarios del modelo.
- Panel: ink#141414,paper#ffffff,mist#f2efe9,line#e2ddd4,stone#6b665e,bronze#8a6a3b,ok#1f6b3a,err#a32020,warn#fff6e5. TenorSans26/19px,Montserrat14px/1.5,label12px,1240/gutter16,card24/r14,inputr10,button10x20/r999,celdas10x12,reflujo760,foco2offset2,contraste4.5/3,zoom200/reducedmotion.44pxmóvil propuesta local. Inglés/labels/status/alert y carga/vacío/parcial/error/conflicto. Widget conserva CSS de chat; documentación sin UI no requiere prueba visual.
- Ponytail reutiliza reloj/correo/NOT11; impeccable/antislop mantiene feedback y controles concretos. Seguridad valida fronteras/PII; rendimiento usa SQL/cursor/stream sin librerías nuevas. Taste/redesign no aplican a continuidad de estas pantallas. Ninguna prueba de un fake acredita canal o proveedor real.

## Review Focus

1. Versión, caso o canal equivocados: rechazar sin efectos ni datos de otro sujeto.
2. Respuesta tardía, borrado o revocación: no restaurar datos o permisos antiguos.
3. Duplicado y resultado incierto: no repetir efectos ni llamadas al modelo.
4. Ausencia de datos o evidencia: unknown/pending, nunca éxito, permiso o mercado vacío.
5. Activación real: pruebas locales y diseño no demuestran cuenta, cobertura, recepción o latencia.

## Task 1: Elegibilidad y cursores de cada fuente

**Files:**
- Create: `server/market-daily.js`.
- Create: `server/market-inventory-runner.js`.
- Create: `server/market-store.js`.

**Interfaces:** dailyRunDue(settings,now,lastRun)->{due,local_date,due_at}; startDailyInventory(env,ts)->{run_id,status,local_date}; dailyInventoryTick(env,ts,{fetchImpl})->{processed,pending,failed}.

**Test:** `tests/server/bus-08-closure-1.test.mjs`.

- [ ] Escribir casos de comportamiento con estas aserciones:
  - `dst_repeated_hour_one_local_day_run`.
  - `manifest_change_not_second_daily_run`.
  - `partial_sweep_not_all_sources_done`.
  - `late_tick_not_24h_utc_rule`.
- [ ] Ejecutar `node --test tests/server/bus-08-closure-1.test.mjs` y verificar fallo por comportamiento ausente, no por el entorno.
- [ ] Implementar la interfaz del servicio dueño: Una ejecución daily por fecha local de Jersey. El manifiesto queda congelado en el run; cambiarlo no crea otra pasada automática ese día. Guardar seen, cursores y generaciones enD1. Mantener la hora01:00Europe/Jersey.
- [ ] Ejecutar `node --test tests/server/bus-08-closure-1.test.mjs` y regresiones del módulo; todos los casos deben pasar con fixtures locales sintéticos.
- [ ] Revisar diff y registrar commit de archivos concretos tras validación; nunca añadir secretos, datos reales o relevo privado.

## Task 2: Cambios y habilitación con evidencia

**Files:**
- Create: `server/market-changes.js`.
- Modify: `server/jobs.js`.
- Create: `server/routes/market-inventory.js`.
- Create: `admin/src/MarketInventory.jsx`.

**Interfaces:** canEnableDailyInventory(env)->{allowed,missing}; outbox MarketChange={source_revision,property_id,operation,material_fields,episode_key}.

**Test:** `tests/server/bus-08-closure-2.test.mjs`.

- [ ] Escribir casos de comportamiento con estas aserciones:
  - `failed_fetch_not_not_available`.
  - `missing_once_not_commercial_unavailability`.
  - `price_drop_creates_new_human_review_episode`.
  - `changed_title_not_material_rematch`.
  - `outbox_replay_no_duplicate_match`.
- [ ] Ejecutar `node --test tests/server/bus-08-closure-2.test.mjs` y verificar fallo por comportamiento ausente, no por el entorno.
- [ ] Implementar la interfaz del servicio dueño: Guardar cambio material y observación en el mismo batch. Integrar los consumidores BUS-01/04 antes de entregarles cambios. La ausencia es evidencia para EST-15, no baja comercial automática. Auto no sustituye las guardas de contacto o revisión humana.
- [ ] Ejecutar `node --test tests/server/bus-08-closure-2.test.mjs` y regresiones del módulo; todos los casos deben pasar con fixtures locales sintéticos.
- [ ] Revisar diff y registrar commit de archivos concretos tras validación; nunca añadir secretos, datos reales o relevo privado.

## Cierre de construcción futuro

**Aceptación completa:** Run diario youtbox; activación espera consumidores reales de cambios/disponibilidad.

- [ ] Reconciliar este complemento, plan anterior y main real. Entregar la funcionalidad pendiente completa; no limitarse a añadir un test o una interfaz vacía. Las verificaciones externas permanecen identificadas hasta acreditarse.
- [ ] Código: `npm test`, `npm run build`, `npm run check:release`. UI: e2e y MCP1280/390, teclado/foco/zoom200%, éxito/validación/vacío/error/conflicto, consola/red. Sólo documentación: revisar estructura/enlaces/evidencias, sin tests de producto.
- [ ] Registrar evidencia de tarea/ledger y actualizar estado sólo con lo construido, integrado y activado realmente. Borrador no es envío; inferencia propuesta no es decisión humana; recepción técnica no es respuesta útil.
- [ ] Revisión independiente antes de publicación; autorizar SHA y migraciones aplicables. Esta entrega no autoriza construir, instalar o publicar nada.
