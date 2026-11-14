# Lo construido frente al plan maestro vigente · 14-nov-2026

Luis pidió comprobar si lo ya construido contradice el [plan maestro](../../2026-11-10-plan-maestro-vigente.md). Revisión de solo lectura del código de `main` (`8f52104`) regla por regla, con cada contradicción comprobada después en el código. El plan no borra código ni datos existentes: solo cuenta como contradicción lo que hoy se comporta distinto a una regla.

## Resultado

En los tres puntos que dependían de Luis respondió «lo que diga el plan maestro», y así se aplicó.

| Regla del plan | Resultado | Qué se hizo |
| --- | --- | --- |
| Visitas: 30 min, 15 de margen, 15 más entre parroquias, máximo 8 al día | **Contradecía**: sin reglas guardadas no había margen entre parroquias ni máximo diario, y en producción nadie las tenía guardadas | Arreglado y publicado (`5a9917e`, VIS-09) |
| Actividad solo interna, sin informes a propietarios (VIS-16) | **Contradecía**: el botón «Owner report» seguía activo | Arreglado: la ficha ya no lo enlaza; el código se conserva |
| Drive aplazado; datos sensibles nunca a Hermes (PUB-21) | **Contradecía en parte**: la cola seguía en uso y no filtra por clase de dato | Arreglado: pausada tras `PUB21_DRIVE_READY`; lo ya importado se puede revisar |
| Un despacho incierto no se repite a ciegas | **Contradice**: un trabajo sin respuesta se reentrega hasta 3 veces | Anotado en AUT-13; se corrige con el contrato de despacho |
| Plazos legales validados antes de usarse | **Contradice en parte**: se muestran como hechos sin rotular | Anotado en ADM-17; se corrige con las reglas versionadas |
| Tours 3D descartados por ahora | La web mostraba el tour de muestra publicado | Arreglado: despublicado (reversible en Settings → 3D tours) |
| Rechazo y bajada de precio (BUS-17) | Sin construir: un rechazo no se reabre | Anotado en BUS-17 |
| Publicación con mínimos, sin exigir el 100 % | Cumple | — |
| Estadísticas sin seguimiento individual | Cumple | — |
| Demanda pública con umbral 5 y revisión | Cumple (apagada) | — |
| QR de póster con conteo agregado | Cumple lo escrito (apagado, sin terminar) | — |
| Mascotas imprescindibles y parking | Cumple | — |
| Disponibilidad sin caducidad a 7 o 30 días | Cumple | — |
| Mercado: una pasada al día, error no es «0 anuncios» | Cumple lo construido (apagado) | — |
| Papelera: solo fotos | Cumple (solo existe la política) | — |
| Fuentes: Homely nunca, Places y Properties después | Cumple | — |
| Documentos y comisiones retirados (ADM-05, OFE-08) | Cumple | — |
| Firma fuera de Hampton | Cumple | — |
| Seguimiento de ventas interno (OFE-06) | Cumple | — |
| Dinero: sin cobros desde la app ni cifras inventadas | Cumple | — |
| Correo con revisión humana por mensaje | Cumple (correo apagado) | — |
| Mensajes sin buzón entero; sin Meta ni portales | Cumple o sin construir | — |
| Telegram sin datos de clientes | Cumple | — |

## Observaciones menores, sin acción

- Los contadores públicos por ficha («N people interested», visitas confirmadas de la semana) usan umbral 2; el umbral 5 del plan es de la demanda por parroquia.
- Insights conserva el embudo antiguo, rotulado como heredado e inferido.
- El aviso «Confirm property availability» (al mes en alquiler, a los 3 meses en venta) crea una tarea, no cambia la disponibilidad.
- Un empleado puede preseleccionar un match con política de mascotas desconocida; sigue marcado pendiente.
- Los destinatarios del resumen diario no se cotejan con la lista de admins (correo apagado).

No verificable desde el código: el contenido de los documentos importados, ajustes hechos solo en el panel de Cloudflare y validaciones del abogado fuera de la app.
