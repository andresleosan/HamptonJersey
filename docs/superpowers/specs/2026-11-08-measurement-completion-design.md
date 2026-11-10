# Métricas · Demanda, embudo y respuesta interna

> Reconciliación TP-05 · 10-nov-2026: alcance, decisiones y dependencias vigentes en [índice consolidado](../plans/2026-11-10-tp05-construction-index.md) y [maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md). Este plan no acredita construcción, publicación o activación.


Solo planificación: ANA-01/03/04/05/06/08/09/10 y PUB-17. [Maestro](../../roadmap/2026-11-10-plan-maestro-vigente.md); [captación/privacidad](2026-11-08-public-acquisition-privacy-design.md). ANA-02/07 e Insights existentes se conservan. Informes a propietarios fuera: ANA-08 es solo dirección interna, sin convertir a propietario en destinatario.

## P02 pendiente: datos agregados o seguimiento consentido

Pregunta enviada a Luis; sin respuesta no activar ni declarar aprobado seguimiento por persona. Enfoques posibles: agregado sin identificador persistente (recomendado), o historial por persona solo tras consentimiento específico/verificable/revocable. No cookies/IDs/fingerprint/IPhash para «anónimo» por defecto, no backfill retrospectivo de navegación previa al consentimiento. Las decisiones pendientes se resuelven antes del plan definitivo de ANA-01 y la parte web de ANA-05. El resto de medición por eventos de negocio existentes puede diseñarse independientemente.

## 1. Contratos de eventos y fuentes

`server/measurement.js`: `recordAggregateMetric(env,{kind,day,listing_id?,dimensions},context)` admite page_view,listing_view,search,search_no_results,valuation_requested,saved_search_verified y acciones de negocio acreditadas. Enumeraciones, dimensiones cerradas y bins de precio/dormitorios/parroquia/operación; nunca texto libre, URLs completas/querys/referrer path,email, teléfono, dirección, IP cruda o identificador de navegador. Máximo10 eventos sintéticos por petición/16KiB y tope diario existente20000 en stats conservado hasta revisión del dueño. El servidor distingue contador de apertura, no visitantes únicos ni interés/llamadas efectivas. Intentos rechazados/duplicados de alta no aumentan contacto nuevo.

Tablas agregadas con day/type/dimensions_hash/counters y cardinalidad acotada por bins, no fila por visitante. Retención técnica propuesta90d de agregados finos y series por mes hasta24meses sin claves personales, sujeta a política aprobada; no sustituye PRE-12. Si rama consentida elegida, un diseño específico de sujeto/consentimiento/eventos/revocación y plazo aprobado debe añadirse antes de su implementación. No activar por un identificador de applicant que aparezca en URL.

Cloudflare Web Analytics y contadores propios tienen fuentes/metodologías distintas: no sumarlos como personas ni encadenar agregados en un embudo individual. La app SPA usa hash routes en partes: comprobar qué transiciones registra proveedor y qué acciones de catálogo requiere instrumentación propia explícita, sin prometer que History API observa cada hashchange. Fuente oficial [Web Analytics](https://developers.cloudflare.com/web-analytics/about/) y [SPA](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/) consultadas8-nov-2026: se usa beacon; no se asume que aparezca sin configuración o que no haya tráfico a un proveedor.

## 2. ANA-03/04 · Tráfico y búsquedas

ANA-03 prepara activación de Web Analytics en host canónico www bajo propiedad Hampton; operador verifica cuenta/plan/beacon con estado no instalado/activo/no disponible. No activar desde plan. Integración en Insights solo si API/dataset autorizado y disponible: backend server-side, cuota/cache por ventana15min y query de agregados; si no hay API no simular números ni inventar endpoint, ofrecer enlace administrativo y registrar el subtramo pendiente. No cuentas personales/tokens en navegador, no instrumentar /admin ni portales privados ni fragmentos de acceso.

ANA-04 instrumenta búsqueda aplicada (submit/debounce500ms tras acción, no cada tecla), resultado vacío y filtros; bins limitados y valores validados. Unknown/Any/selected de REG-06 no son equivalentes. Series comparan días Jersey completos y cobertura; cero solo si fuente medida, no ausencia de integración. No aceptar matrices cruzadas arbitrarias que exploten filas o identifiquen un hogar. Insights7/30/90 sigue y se añade evolución por día/semana con etiquetas de unidad/cohorte, sin recomendaciones automáticas que cambien criterios.

## 3. ANA-01/05 · Actividad y embudo

ANA-01 preserva Timeline de acciones reales de aplicante (alta, visita, oferta) ya acreditadas; eso no es navegación identificada. Rama agregada no se vincula después a contacto ni pretende reconstruir fichas vistas por cada persona. Si Luis pide rama consentida, el scope privado y la revocación deberán especificarse antes de construir.

ANA-05 separa panel de volúmenes web agregados del embudo por cohortes de búsquedas/contactos registrados. Usar eventos/ref de VIS-17/08 para viewing_requested/confirmed/completed y AGE-11 sent real, oferta/agreed del dueño; no forzar stage ni deducir etapas previas de que alguien saltó a Agreed. Cliente puede ser importado, sin visita; medir hito observado, no inventado. Denominadores y números de búsquedas/personas diferentes se etiquetan, fechas primer hito por episodio, duplicados excluidos y eventos fuera de cohorte explicados. No convertir diferentes métricas agregadas en porcentaje de conversión personal sin un enlace acreditado.

`getSearchFunnel(env,{from,to,operation,category})->{cohort_definition,counts,coverage}` en server/measurement-funnel.js; `getWebVolumes` devuelve agregados sin subject id. Medidas actuales permanecen como legacy con definición para no cambiar silenciosamente la serie. Unknown/no producer se muestra Not tracked; la comparación de cohortes no penaliza búsquedas aún abiertas como fallidas.

## 4. ANA-06/08/PUB-17 · Decisiones internas revisables

ANA-06: `computeResponseMetrics(events,{from,to,scope})` mide segundos reales entre envío acreditado AGE-05 y primera respuesta útil AGE-06, no entre intento fallido y lectura; primera presentación desde búsqueda activa a AGE-11 sent. Excluir/contar como pending envíos unknown o sin respuesta, no duración0. Presentar mediana,n,mínimo/máximo y cobertura, no ranking personal público ni cuerpos de correo. Diferenciar business call deadline2d laborales de tiempo analítico transcurrido. Shared consultation cuenta una comunicación para agencia y enlaces por búsqueda para su recorrido; no replicar agencia lenta por cada cliente.

PUB-17 propone señal técnica inicial configurable: ventana7d completos, mínimo100 aperturas, ratio solicitudes de visita válidas/aperturas<1%, datos completos del mismo scope y fuente, una tarea por listing/episodio con cooldown7d tras cierre si persiste condición. Valores son propuesta técnica para calibrar con equipo antes de activar avisos, no verdad del mercado; si no hay medición válida no emitir alerta. Deduplicar solicitud real del mismo contacto/contexto por métricas existentes y no usar número de clicks tel como consulta. Señal Review listing performance con evidencia/fechas; no cambiar precio/fotos/publicación ni informar a propietario automáticamente.

ANA-08 usa AUT-17/reloj existente para resumen semanal solo a dirección interna seleccionada. Configuración explícita weekday/time Europe/Jersey, defaults disabled/sin destinatarios y muestra antes de activar, sin horario atribuido a Luis. Contadores/medianas con cobertura y enlace al panel, no nombres, datos del hogar, notas o adjuntos; un correo por destinatario/período. Snapshot semanal y versión, unknown sin retry, días atrasados no generan avalancha. No es el resumen diario NOT-10; comparte transporte, no duplica8:00. Cierre exige recepción real autorizada.

## 5. ANA-09/10 · Protección y atribución

ANA-09 es plan de configuración posterior por operador, no editar WAF desde documentos. Registrar plan/reglas vigentes y evaluar disponibilidad antes de proponer creación; nunca borrar regla ajena para liberar cuota. Expresión candidata limitada a host público canónico y path exacto /api/stats o /api/chat y descendientes con frontera /api/chat/; métodoPOST y exclusión explícita admin/auth/otras APIs. No /api/chat* que incluya rutas no pensadas ni protección del panel tras IP compartida. Objetivo20 en10s/IP, block10s cuando plan soporte; cuota/semántica precisas dependen cuenta. Preservar defensas servidor y límite de contador, smoke permitido de rutas propias con carga controlada posterior, rollback de su regla identificado. [Rate limiting](https://developers.cloudflare.com/waf/rate-limiting-rules/) y [parámetros](https://developers.cloudflare.com/waf/rate-limiting-rules/parameters/) oficiales consultados8-nov: límites por plan, no usar documentación legacy como prueba de cuenta. Sin cambio real de control en esta sesión.

ANA-10 `resolveAcquisitionSource(input)->{source_code,campaign_id?,revision}` acepta enum web,sign_qr,leaflet,referral,manual,unknown y campaign_id opaco del catálogo del servidor. Parámetro compartido URL no lleva personas/direcciones ni autoriza redirect libre. Preferir fuente declarada al enviar y conservar source_claim_unverified cuando es etiqueta pública manipulable; no fingir atribución comprobada por un UTM. Captura en alta/valoración/repetición con sourceoriginal separado del último touch; repetir no pisa primer origen ni crea contacto nuevo. Código de recomendación no identifica a quien recomienda sin propósito aprobado. No fingerprint o correlación por IP. Cartel/QR se gestiona manualmente con permiso, sin envío ni reparto desde app.

## 6. Verificación

Pruebas de límites cardinalidad/carga, bins, doble evento, ausencia de IP/PII, coortes sin saltos inferidos, scope/operación/timestamps/DST, envío real vs unknown, guardias de activación. UI compara0/Not tracked y cobertura7/30/90 sin unir personas falsas. Diseño/UI/seguridad exactos del workspace se copian al plan. Ningún cambio WAF, beacon o mensaje se ejecuta al planificar.
