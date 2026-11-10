# Paquetes para avanzar Hampton

9-nov-2026 · Agrupación de las250tareas en23paquetes, con códigos/listas/estados conservados. Fuente: [paquetes.json](paquetes.json).

Los planes revisados de las nueve tandas de Lista 4 están enlazados por código en [Planes por paquete](PLANES-POR-PAQUETE.md) y en `planReferences` del manifiesto. Leer también los complementos obligatorios; las etapas no reactivan alcances aplazados.

Usa `/avanzar` para retomar o elegir el siguiente tramo viable, `/avanzar PAQ-01` para un paquete o `$avanzar PAQ-01` en Codex. Un código real explícito mantiene alcance. Las etapas comparten diseño y pruebas cuando es posible; conservan dependencias y reservas individuales. Planificar no reserva.

Orden inicial: Inbox/tareas compartidas, BUS-14 sobre inventario actual y fuentes por tandas independientes; correo operativo se resuelve por su autorización sin reconstruirlo. Las tres investigaciones siguen siendo secuenciales. El orden del manifiesto es preferencia, no evidencia de disponibilidad.

Hermes programa con GPT Sol en Codex; al perder acceso GPT usa DeepSeek v4 max en OpenCode. Entorno/dificultad orientativos: cada tarea tiene motivo/requisitos en el tablero y en el comando local de consulta.

## PAQ-01 · Inbox y trabajo compartido

Una gestión por asunto, con responsable, plazo, historial y avisos conectados.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Base de eventos y tareas: `EST-18`, `NOT-11`.
2. Novedades y categorías: `NOT-01`, `NOT-08`.
3. Acciones y cobros según productores: `NOT-09`, `NOT-05`.
4. Avisos existentes e historial: `NOT-02`, `NOT-03`, `NOT-04`, `NOT-06`, `NOT-07`, `SPR-02`.

## PAQ-02 · Requisitos y registro

Completar los datos del aplicante reutilizando el registro existente.

Entorno orientativo: **VS Code** · Dificultad: **Media**.

1. Comprobar lo integrado: `REG-08`, `REG-11`, `REG-17`.
2. Campos y confirmación de alta: `REG-01`, `REG-02`, `REG-03`, `REG-04`, `REG-05`, `REG-06`, `REG-07`, `REG-09`, `REG-10`, `REG-12`, `REG-14`.

## PAQ-03 · Matching y revisión humana

Conservar candidatas válidas y explicar su evaluación sin perder decisiones humanas.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Orden sobre inventario actual: `BUS-14`.
2. Evaluación y aprobación: `BUS-12`, `BUS-13`, `BUS-15`, `BUS-16`.
3. Estados y ficha: `EST-13`, `EST-05`, `EST-06`, `EST-07`, `EST-08`, `SAP-02`, `SAP-03`, `SAP-04`, `SAP-05`, `SAP-06`, `SAP-07`.

## PAQ-04 · Fuentes y anunciantes

Consolidar fuentes y contactos con procedencia y restricciones visibles.

Entorno orientativo: **Hermes** · Dificultad: **Media**.

1. Directorio y fuentes permitidas: `AGE-04`, `BUS-19`, `PRE-01`.
2. Primera investigación: `BUS-21`.
3. Segunda tras aceptar la primera: `BUS-22`.
4. Tercera tras aceptar la segunda: `BUS-23`.
5. Casos especiales y supresión: `BUS-11`, `BUS-20`, `AGE-14`.

## PAQ-05 · Inventario único de mercado

Una propiedad común con anuncios, precios, fuentes y disponibilidad separada.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Carga por tandas tras investigaciones: `BUS-06`.
2. Normalización e identidad común: `BUS-09`, `BUS-10`, `BUS-07`.
3. Estados y filtros de procedencia: `EST-16`, `SPR-07`.

## PAQ-06 · Búsqueda diaria

Mantener resultados actualizados sin duplicar propiedades.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Barrido y comparación: `BUS-08`.
2. Disparo inicial y repetición: `BUS-01`, `BUS-04`.
3. Resultados y estados: `BUS-03`, `EST-01`, `EST-02`, `EST-03`, `SAP-01`.
4. Decisiones históricas sustituidas: `BUS-02`, `BUS-05`.

## PAQ-07 · Continuidad y disponibilidad

Separar seguimiento, indisponibilidad y cierre humano.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Ciclo y colas: `EST-09`, `EST-04`, `EST-10`, `EST-11`, `EST-12`.
2. Indisponibilidad acreditada: `EST-15`.
3. Revisión interna y seguimiento: `BUS-17`, `BUS-18`, `SAP-10`, `EST-14`.
4. Purga con política validada: `EST-19`.

## PAQ-08 · Consultas y respuestas de agencias

Consulta compartida, respuesta y llamada pendiente sin envíos duplicados.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Consulta aprobada y guardas: `AGE-03`, `AUT-11`.
2. Envío con canal operativo: `AGE-05`.
3. Respuesta y llamada: `AGE-06`, `AGE-08`, `AGE-09`.
4. Reglas históricas sustituidas: `AGE-01`, `AGE-02`.

## PAQ-09 · Ficha privada y presentación

Preparar la propiedad confirmada y una presentación revisada por el empleado.

Entorno orientativo: **VS Code** · Dificultad: **Alta**.

1. Captura y archivos privados: `SPR-03`, `SPR-04`, `SPR-05`, `SPR-08`, `AGE-10`.
2. Respuesta y presentación humana: `AGE-12`, `AGE-11`, `AGE-13`.
3. Acciones de la ficha: `SAP-08`, `SAP-09`.

## PAQ-10 · Visitas y agenda

Coordinar horarios y confirmaciones conservando reservas existentes.

Entorno orientativo: **VS Code** · Dificultad: **Alta**.

1. Base existente y reglas de agenda: `VIS-01`, `VIS-02`, `VIS-03`, `VIS-05`, `VIS-06`, `VIS-07`, `VIS-09`, `VIS-11`, `VIS-18`.
2. Restricciones y coordinación: `VIS-10`, `VIS-17`, `VIS-08`, `VIS-14`.
3. Resultados recordatorios e informes: `VIS-04`, `VIS-13`, `VIS-16`.
4. Calendario externo con acceso propio: `VIS-12`.

## PAQ-11 · Privacidad y decisiones de cumplimiento

Conectar permisos y solicitudes con decisiones y parámetros validados.

Entorno orientativo: **Hermes** · Dificultad: **Alta**.

1. Decisiones y contratos: `PRE-03`, `PRE-28`, `PRE-29`, `PRE-13`, `PRE-33`.
2. Avisos y permisos: `PRE-09`, `PRE-10`, `PRE-11`.
3. Solicitudes y conservación: `PRE-12`.
4. Cumplimiento de alquiler y compraventa: `ADM-17`, `ADM-20`, `OFE-07`.

## PAQ-12 · Captación y alertas consentidas

Captar propietarios y búsquedas con consentimiento y origen trazables.

Entorno orientativo: **VS Code** · Dificultad: **Media**.

1. Captación y origen: `PUB-10`, `ANA-10`.
2. Alertas y valoraciones: `REG-15`, `REG-16`.
3. Demanda y campañas: `PUB-19`, `PUB-20`.

## PAQ-13 · Correo y conversaciones

Activar correo existente y ampliar conversaciones por canales verificables.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Correo y resumen existentes: `AUT-17`, `NOT-10`, `PRE-23`.
2. Chat humano y alta desde conversación: `MSG-02`, `MSG-05`.
3. Meta y WhatsApp con permisos: `PRE-02`, `PRE-08`, `PRE-24`, `MSG-01`, `MSG-03`.
4. Bot tras decisiones de activación: `PRE-34`, `MSG-04`.

## PAQ-14 · Control de automatizaciones y criterios

Compartir modos, pruebas y revisión de cambios por el equipo.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Control y pruebas: `AUT-01`, `AUT-03`, `AUT-07`, `AUT-09`, `AUT-10`.
2. Propuestas con revisión humana: `AUT-19`, `REG-13`.
3. Decisión histórica de modelos: `AUT-02`.

## PAQ-15 · Hermes e integraciones privadas

Preparar capacidades del agente sin ampliar accesos por inferencia.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Decisiones y capacidades: `PRE-30`, `PRE-31`, `PRE-32`, `AUT-05`, `AUT-06`, `AUT-08`, `AUT-12`.
2. Agente y comunicaciones: `AUT-13`, `AUT-14`, `AUT-15`, `AUT-16`, `AUT-18`, `AUT-04`.
3. Notas de voz privadas: `VIS-15`.

## PAQ-16 · Gestión completa del alquiler

Un expediente de alquiler para cobros, incidencias, renovación y salida.

Entorno orientativo: **VS Code** · Dificultad: **Alta**.

1. Ficha solicitud y contrato: `ADM-01`, `ADM-02`, `ADM-05`, `ADM-18`, `ADM-06`, `ADM-19`.
2. Cobros avisos y cumplimiento: `ADM-03`, `ADM-07`, `ADM-08`, `ADM-09`, `ADM-10`, `ADM-11`.
3. Mantenimiento e inspección: `ADM-12`, `ADM-13`.
4. Renovación salida y exportación: `ADM-14`, `ADM-15`, `ADM-16`, `ADM-21`.

## PAQ-17 · Ofertas y comisiones

Conectar oferta, cierre y cobro con las gestiones humanas.

Entorno orientativo: **VS Code** · Dificultad: **Alta**.

1. Oferta y expediente: `OFE-01`, `OFE-02`, `OFE-03`, `OFE-04`, `OFE-05`.
2. Seguimiento y cobro: `OFE-06`, `OFE-08`, `PRE-22`.

## PAQ-18 · Editor y catálogo propio

Completar datos, medios y validaciones en el mismo editor.

Entorno orientativo: **VS Code** · Dificultad: **Media**.

1. Datos y ficha: `PUB-01`, `PUB-04`, `PUB-05`, `PUB-06`, `PUB-07`, `PUB-08`, `PUB-09`, `SPR-01`, `SPR-06`.
2. Medios y validación: `PUB-11`, `PUB-12`.
3. Publicación y estados: `PUB-02`, `PUB-14`, `PUB-16`, `PUB-22`, `EST-17`, `ADM-04`.
4. Decisión descartada: `PUB-18`.

## PAQ-19 · Distribución e importación de propiedades

Reutilizar el editor para conectores y canales autorizados.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Importación desde Drive: `PUB-21`.
2. Asistencia de contenido: `PUB-13`.
3. Redes y portales: `PUB-03`, `PUB-15`.

## PAQ-20 · Analítica útil

Medir demanda, respuesta y conversión con fuentes disponibles.

Entorno orientativo: **VS Code** · Dificultad: **Media**.

1. Actividad y demanda: `ANA-01`, `ANA-02`, `ANA-03`, `ANA-04`, `ANA-05`, `ANA-06`, `ANA-07`.
2. Informes y salud de fichas: `ANA-08`, `PUB-17`.
3. Datos de referencia del negocio: `PRE-04`, `PRE-25`.

## PAQ-21 · Puesta en marcha y operación

Revisar dominio, límites, acceso y copias con autorización específica.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Acceso límites y copias: `PRE-06`, `ANA-09`, `PRE-14`.
2. Dominio y decisiones existentes: `PRE-16`, `PRE-17`, `PRE-18`, `PRE-19`, `PRE-20`, `PRE-21`, `PRE-26`.
3. Decisiones descartadas: `PRE-05`, `PRE-15`.

## PAQ-22 · Aceptación del recorrido completo

Comprobar de extremo a extremo el recorrido de búsqueda.

Entorno orientativo: **VPS** · Dificultad: **Alta**.

1. Aceptación integral: `AUT-20`.

## PAQ-23 · Tours 3D aplazados

Conservar el alcance histórico sin reactivar trabajo aplazado.

Entorno orientativo: **VS Code** · Dificultad: **Alta**.

1. Alcance aplazado: `T3D-01`, `T3D-02`, `T3D-03`, `T3D-04`, `T3D-05`, `T3D-06`, `T3D-07`, `T3D-08`, `T3D-09`, `T3D-10`, `T3D-11`, `T3D-12`, `PRE-27`.

## Reglas para ahorrar trabajo

Reconciliar planes existentes con main; revisar entregas locales antes de rehacerlas; resolver decisiones ya dadas leyendo; preparar una matriz de aceptación por tramo; reutilizar fixtures y ejecutar pruebas comunes una vez por entrega coherente. No inventar estados completos ni omitir controles para aparentar avance. Si un gate externo bloquea una parte, conservarla y avanzar únicamente en partes independientes autorizadas.

El tablero cuenta solo tareas con estado Hecho sobre el alcance vigente. No estima días ni suma medias tareas por estar parciales. Los detalles de etapas no prometen ejecución conjunta si el coordinador requiere tramos integrados primero.
