# Autorizaciones permanentes de Luis para `/avanzar`

Aquí está lo que Luis ya autorizó y lo que no. `/avanzar` lo aplica sin volver a preguntar. El procedimiento está en la [skill](../../.agents/skills/avanzar/SKILL.md).

**Meta:** terminar las tareas aplicables lo antes posible. Hito intermedio: 111 de las 221 tareas originales. El porcentaje solo sube cuando una tarea cumple su criterio de hecho.

## Autorizado sin preguntar

| Qué | Desde | Condiciones |
| --- | --- | --- |
| Commits y push a `main` | 13-nov-2026 | Solo archivos propios, pruebas del lote pasadas, remoto comprobado, sin forzar ni reescribir historial. |
| Trabajar sin parar entre tareas y lotes | 13 y 14-nov-2026 | Decidir con los planes y la documentación. Un bloqueo localizado no detiene lo demás. |
| Repartir el trabajo entre subagentes | 14-nov-2026 | Un escritor por archivo. |
| Lecturas de producción: estado de migraciones D1, despliegues de Pages, peticiones GET | 14-nov-2026 | Sin escribir datos ni imprimir secretos. |
| **Migraciones aditivas** en D1 `hampton` | 14-nov-2026 | Regla y pasos abajo. |
| **Encender el interruptor** (`*_READY`) de una tarea ya migrada y verificada | 14-nov-2026 | Excepto los de la lista «No autorizado». |
| Cerrar tareas por **aceptación propia** | 14-nov-2026 | Criterio de la sección 3 de la skill, con evidencia en la ficha. |
| **Decisiones de producto abiertas**: tomarlas según lo recomendado y documentado | 14-nov-2026 | Fuente anotada en la ficha; Luis puede cambiarlas después. Ejemplo: los modos de AUT-10 los cambia cualquier admin. |

### Qué es una migración aditiva

Solo añade: `CREATE TABLE`, `CREATE INDEX`, `CREATE VIEW`, `CREATE TRIGGER`, `ALTER TABLE … ADD COLUMN`, sustituir un trigger o una vista por su versión nueva, e insertar filas fijas de configuración en tablas que crea la propia migración. Las sentencias dentro del cuerpo de un trigger no cuentan como escritura de la migración.

**No es aditiva** y va a la [cola de Luis](COLA-LUIS.md): `DROP TABLE`, renombrar o reconstruir una tabla que ya tiene datos, `DELETE` o `UPDATE` directos sobre filas existentes, y cualquier cambio que borre, reescriba o caduque datos de personas.

Pasos obligatorios: archivo publicado en `main` y leído entero, ensayo en D1 local, marcador de Time Travel guardado antes, aplicar solo los archivos revisados y en orden, comprobar después con `migrations list`. Un resultado incierto se investiga antes de repetir.

## No autorizado: va a la cola de Luis

- Migraciones no aditivas y restauraciones de datos.
- Interruptores que empiezan a **enviar mensajes** (correo, WhatsApp, Meta, Telegram al equipo) o a **recoger datos personales del público** con un formulario nuevo: `EMAIL_SERVICE_READY`, `OWNER_REQUESTS_READY`, `PUBLIC_DEMAND_READY` y los equivalentes que aparezcan. También `PUB21_DRIVE_READY`, que envía documentos de Drive a Hermes: pausado por el plan maestro hasta verificar PRE-32.
- Credenciales, tokens, permisos, DNS, WAF, Cloudflare Access y configuración del VPS o de Hermes.
- Cuentas y trámites externos (Meta, Google, JFSC, JOIC, abogado) y cualquier gasto.
- Escrituras de prueba en producción y borrado de datos reales.
- Publicar otras ramas: sus previews usan la base de producción.

Si algo no está en ninguna de las dos listas y es difícil de revertir o sale del repositorio, se trata como no autorizado.

## Alcance según el plan maestro · adaptación del 14-nov-2026

Luis pidió adaptar las tareas pendientes al [plan maestro vigente](2026-11-10-plan-maestro-vigente.md), que prevalece sobre el catálogo antiguo:

- **Retiradas** (pasan a `descartado`, el tablero baja de 215 a 211 aplicables): MSG-01, PUB-03, PRE-02 y PRE-08, todo lo de Meta.
- **Aplazadas a una fase posterior** (siguen contando, pero ni se construyen ni bloquean): VIS-15, AUT-06, AUT-08, PUB-20, PUB-21, PRE-01 y PRE-24.
- **Dependencias por componente**: la ruta ya no esconde una tarea porque otra esté sin cerrar; ver la sección 2 de la skill.
- **Decisiones de producto**: el plan maestro las da por resueltas. Las fichas que anotaban una decisión pendiente llevan ahora la regla del plan.
- **Tareas con código por construir que estaban en la cola** vuelven a `desarrollo`; lo externo es condición de activación: BUS-19, PUB-16, MSG-03, ADM-10, ADM-17, ADM-19, PRE-06 y VIS-12.

## Estado de partida · 14-nov-2026

- Tablero: **69 de 215 (32,09 %)**. Última tarea cerrada: PUB-08 (`9f4f884`), con `0048` aplicada y `PUB08_CONTENT_READY=1`.
- Migraciones publicadas en `main` y **pendientes en producción**: `0043`, `0044`, `0045`, `0046`, `0047`, `0049`, `0050`, `0051`, `0052`. Varias tareas construidas esperan solo esto y su interruptor.
- Las decisiones anteriores de pedir un sí por cada migración (`0048`, `0052`) y de detenerse tras un cierre quedan sustituidas por este documento.
