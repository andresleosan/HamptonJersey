# Integración PUB-16, BUS-10 y ANA-10

13-nov-2026. Integración sobre `a4de2a0417e9befcf04ee9af117c06a333ee9f01`, con datos ficticios. Las tres tareas siguen **parciales**. El cierre temporizado y la ruta QR están apagados por defecto; la fachada de identidad devuelve 503. Los tres esquemas nuevos permanecen como propuestas fuera de la cola de migraciones.

## Revisión y correcciones

- La revisión de PUB-16 detectó que el tratamiento de una ficha ya despublicada no contrastaba todos sus estados y podía pasar por alto una contradicción. Se corrigió en una pasada, con comprobación dentro del `UPDATE`, casos de deriva y tarea urgente. La carrera entre lectura y escritura se reprodujo en SQLite; la focal Miniflare comprobó la contradicción y el caso coherente.
- La revisión de BUS-10 contrastó las candidaturas con el núcleo existente: son señales pendientes, no decisiones ni permiso de fusión. Persisten las limitaciones de autorización, retención, ciclo de candidaturas y ausencia de vínculo fiable a matches descritas en su evidencia.
- La revisión de ANA-10 pidió verificar el identificador completo antes de generar un destino. Se añadió esa comprobación y se ensayaron terminadores de línea y separadores Unicode. Node ya rechazaba los ejemplos antes del refuerzo; no se atribuye un fallo previo reproducido.

## Verificación integrada

- **1.972/1.972 pruebas JavaScript y 25/25 Python**, compilación y `check:release` correctos. `team:catalog`, `team:check`, `check:packages` y `git diff --check` también pasaron.
- `tests/pub16-timed-closure.e2e.cjs` pasó en Chromium aislado a **1280 y 390 px**, con teclado y datos ficticios. Comprobó el estado Let agreed, corrección a disponibilidad anterior, ausencia de reservas nuevas y ocultación pública de una ventana vencida. El vencimiento se preparó en la base efímera; no se esperaron 24 horas reales. La primera versión del recorrido falló porque no volvió a rellenar fecha y evidencia al reiniciarse el formulario; se corrigió la prueba y se repitió.
- Las pruebas focales D1 usaron Miniflare y bases efímeras; no miden coste remoto. No se ha consultado el esquema remoto, probado producción, activado interruptores, enviado avisos ni aplicado migraciones.

Los requisitos pendientes se mantienen en [PUB-16](../PUB-16/base-cierre-temporal-2026-11-13.md), [BUS-10](../BUS-10/candidaturas-internas-2026-11-13.md) y [ANA-10](../ANA-10/qr-nucleo-2026-11-13.md).
