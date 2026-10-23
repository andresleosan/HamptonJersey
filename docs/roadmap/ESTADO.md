# Estado de Hampton App

Actualizado el 23-oct-2026. Qué incluye cada fase y cuándo se da por hecha: [arquitectura, §9 Hoja de ruta](2026-10-23-arquitectura-hampton-app.md).

| Fase | Estado | Spec | Plan | Pendiente |
|---|---|---|---|---|
| F0 Cimientos · Entrega 1 (panel: Inbox, aplicantes, ficha, alta, borrado, nombres del equipo) | **En producción desde el 23-oct-2026** (commit `ef28568`; Luis comprobó Inbox y Applicants en `/admin/`) | [spec F0](../superpowers/specs/2026-10-23-hampton-app-f0-design.md) | [plan F0](../superpowers/plans/2026-10-23-hampton-app-f0.md), tareas 1–10 | Menores aplazados: ver el [registro de la ejecución](../superpowers/plans/2026-10-23-hampton-app-f0-ledger.md) (líneas «minor (deferred)») |
| F0 Cimientos · Entrega 2 (asistente público «Register your search») | Pendiente de los datos del aviso de privacidad | [spec F0](../superpowers/specs/2026-10-23-hampton-app-f0-design.md) §5 | [plan F0](../superpowers/plans/2026-10-23-hampton-app-f0.md), tareas 11–13 | Hampton debe pasar razón social, dirección, email de privacidad, registro en la JOIC y encargado del tratamiento (Optimyze). La entrega no sale mientras quede algún `TO CONFIRM`: la compilación de Cloudflare Pages falla a propósito, así que **ningún push de `main` posterior a `ef28568` se publica** hasta entonces (incluidas las redirecciones de Wix de `site/_redirects`) |
| F1 Inventario y matching | **F1-A construida** (matching con el inventario propio); sale junto con la Entrega 2; F1-B pendiente de la clave de Places.je | [spec F1-A](../superpowers/specs/2026-10-23-hampton-app-f1a-design.md) | [plan F1-A](../superpowers/plans/2026-10-23-hampton-app-f1a.md), tareas 1–10 | Al desplegar con la Entrega 2: migración `0009_matches.sql` en remoto antes del push y, tras el push, Luis pulsa «Recalculate all» una vez en Review. F1-B: clave de la API de Places.je. Pregunta 1 del §12: destino de las 264 fichas de agencias. El borrado a los 12 meses (G2) debe salir antes de que los primeros contactos cumplan 12 meses (≈ oct-2027) |
| F2 Agencias y portal | Sin empezar | — | — | Depende de F1 |
| F3 Visitas y ofertas | Sin empezar | — | — | — |
| F4 Publicación | Sin empezar | — | — | Trámite de Meta para publicar en redes |
| F5 Alquileres gestionados | Sin empezar | — | — | Puede adelantarse a F3 si los alquileres son hoy el negocio principal |
| F6 Mensajes | Sin empezar | — | — | Trámite de Meta |
| F7 Insights | Sin empezar | — | — | — |
| F8 Tours 3D | Sin empezar | — | — | — |
