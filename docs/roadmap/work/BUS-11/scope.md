# BUS-11 · Alcance de los casos especiales

Fecha de corte: 13 de noviembre de 2026. Investigación **parcial** y exclusivamente documental; no constituye una aceptación de BUS-11, autorización por fuente ni inventario de anuncios.

## Base y trazabilidad

La cadena de aceptación local BUS-21 → BUS-22 → BUS-23 consta en sus resúmenes publicables ([BUS-21](../BUS-21/resumen-aceptacion-publicable.md), [BUS-22](../BUS-22/resumen-aceptacion-publicable.md), [BUS-23](../BUS-23/resumen-aceptacion-publicable.md)). Se cotejaron los tres registros locales: sus SHA-256 coinciden con los resúmenes y las 5, 11 y 14 referencias respectivas coinciden con sus huellas. Estos registros de detalle y los CSV aceptados se conservan en el espacio local y no se incorporan a este commit.

| Insumo local aceptado | SHA-256 | Alcance observado |
| --- | --- | --- |
| `BUS-23/registro-aceptacion-BUS-23.json` | `43b04fdf2c5e6f836f9b4493a63e7c742df8812c81fbfdc4f09191c58a84d49b` | `accepted_locally`; no es aceptación de esta investigación. |
| `BUS-23/property-directory-inventory-handoff.csv` | `6b510a0f8d8fa2a333e7360e959206590596731c238554fb2bceea392de2c36c` | 141 IDs y 237 rutas, incluidas propuestas no integradas. |
| `BUS-23/property-directory-final-pending.csv` | `13a1c8ea89251c1b9c6a85599fb624a790f97d77afef997a579faeb45232e393` | 373 requisitos pendientes, no 373 fuentes adicionales. |
| `BUS-23/pendientes-complementarios.csv` | `e1a7cb896d600ff3a12812dc482eecdbf320daa46d7b2886977900fc1c740f90` | Siete dudas que pueden solaparse con la cola; no se suman automáticamente a sus requisitos. |

Las referencias `accepted_local` de [cases.json](cases.json) y [findings.json](findings.json) se resuelven en la raíz del espacio local que conserva la aceptación, no en una base de datos ni necesariamente en una copia pública del repositorio. `record_id` identifica la fila correspondiente; la huella protege el archivo completo. Las referencias locales anteriores de BUS-21/BUS-22 se mantienen en su origen y no se trasladan sus contactos o inventarios.

## Selección y límites

Los siete casos pendientes proceden uno a uno de las siete dudas complementarias aceptadas: cobertura de Seeker, identidad de un grupo social, relación Quemard, continuidad de Francis James y Brennan, relación de dos aplicaciones de nombre parecido y posible alias de The Accommodation Centre. No son siete altas. Se añade una comprobación **cubierta**, separada de la duda de alias: la última propuesta ya tiene un ID en el relevo y no debe volver a darse de alta por la misma mención. Por tanto el registro contiene ocho preguntas: siete `manual_pending` y una `covered`. No se asignan prioridades ficticias.

La coincidencia de nombre o dominio no acredita identidad jurídica. La fuente propuesta no está integrada en la SQLite original. El contraste del catálogo histórico completo sigue pendiente: el informe BUS-23 deja constancia de que una lectura anterior del CSV histórico fue rechazada por revisión automática; aquí no se reintentó esa lectura. No se localizó un antecedente documental de `Hampton_Database` por nombre dentro del material local examinado; esto no prueba su inexistencia ni sustituye las investigaciones aceptadas.

La política heredada por los 237 registros no contiene canales declarados automáticamente habilitados: conserva `solo_referencia`, términos y robots pendientes, revisiones específicas o manuales, exclusiones, claves y permisos escritos. Homely continúa excluido; Properties.je requiere permiso escrito y Places.je queda aplazado como conector. Los grupos y particulares conservan su revisión propia, y BUS-20 no se ejecuta desde este trabajo. No se ha usado una cuenta ni un canal privado, ni se ha contactado a terceros, consultado producción o modificado base/servicio alguno. No se interpretan ausencias de evidencia como ausencia de anuncios.

El [registro de accesos](access-log.md) documenta una secuencia de consultas puntuales realizada antes de completar el cotejo de condiciones y el cese posterior de aperturas no autorizadas. No se reutiliza el contenido de las páginas problemáticas ni se infiere permiso. Los [hallazgos](findings.md) solo se basan en evidencia previamente aceptada y en la comparación local; fechas originales y límites se conservan.
