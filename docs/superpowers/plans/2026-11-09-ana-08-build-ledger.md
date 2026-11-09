# ANA-08 · Registro de construcción

2026-11-09. Usuario: «apruebo construir y publicar». Alcance: tramo Inbox del plan, no email ni otros códigos bloqueados.
Base comprobada GitHub:2084cb9ea895b729f8a28e3f2c42ce2057641389. Copia exclusiva:/tmp/hampton-ana08-build-20261109 en main. Se conserva la decisión vigente sin coordinador y el trabajo ajeno de otras carpetas. La aprobación actual cubre construir y publicar; no se solicitará de nuevo por rutina, sin saltar controles técnicos del entorno.

## Interfaces y decisiones

- Task1 → Task2: weeklyInsightsPass y tabla de fotos con el mismo contrato.
- Task2 → Task3: DTO con weekly_insights (fecha validada) para distinguir exactamente este subtipo informativo, sin afectar otros avisos.
- Task1: al implementar, el test de historia detectó que omitir source_version inicial producía una revisión adicional por el trigger existente. Se fija al ID del evento al insertar, manteniendo una sola revisión inicial.
- Plan aprobado: cuatro totales y cinco referencias; no historia de demanda/embudo. Sin fechas inventadas para fuentes eliminadas ni nombres de clientes.

## Progreso

Task1: calendario, tabla aditiva e INSERT SELECT implementados. RED observado por módulo inexistente. GREEN inicial4/4 directos; las pruebas de Task2 están ahora en RED por API/DTO/reloj ausentes.
