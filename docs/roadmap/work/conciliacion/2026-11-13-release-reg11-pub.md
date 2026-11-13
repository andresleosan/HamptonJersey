# REG-11, PUB-09 y PUB-16 · Conciliación de despliegues

13 de noviembre de 2026. Consulta de solo lectura a los checks de GitHub y contraste de la historia Git local. Los checks acreditan el resultado de esos despliegues, no el uso funcional de la aplicación en producción.

## REG-11

La corrección de validación de fechas `841f8be` es antecesora de `3e6191b`. Para este último SHA, [Cloudflare Pages](https://github.com/andresleosan/HamptonJersey/runs/131753368131) y [Workers Builds: hampton-jobs](https://github.com/andresleosan/HamptonJersey/runs/131753425448) terminaron en `completed/success`. La aplicación de la migración 0025 y la entrega original se documentan en la [conciliación anterior](2026-11-13-reg-est-not.md).

La corrección pasó pruebas locales de API pública y panel con fechas imposibles, años bisiestos, fechas válidas y conservación de fechas históricas. No se repitieron el flujo autenticado ni un envío en producción. Con la integración y los checks del despliegue acreditados queda cumplido el pendiente que conservaba REG-11; el matching comercial corresponde a M04 y no se declara construido.

## PUB-09

El código integrado en `9054dd1` obtuvo checks `completed/success` de [Cloudflare Pages](https://github.com/andresleosan/HamptonJersey/runs/131741025140) y [Workers Builds: hampton-jobs](https://github.com/andresleosan/HamptonJersey/runs/131740834910). La [evidencia local](../PUB-09/avance-publicable.md) describe las pruebas de retirada e historial. La migración 0044 solo se ensayó con datos ficticios y el flujo permanece desactivado por defecto; esta consulta no verifica aplicación remota, activación ni uso de la funcionalidad. Continúan pendientes la migración, la activación, el recorrido real y la supresión de notas conforme a PRE-12.

## PUB-16

El SHA `1813b01` obtuvo checks `completed/success` de [Cloudflare Pages](https://github.com/andresleosan/HamptonJersey/runs/131747729756) y [Workers Builds: hampton-jobs](https://github.com/andresleosan/HamptonJersey/runs/131747660634). Las pruebas de estados y reservas con datos ficticios se describen en su [avance](../PUB-16/avance-publicable.md). No se ha hecho un smoke funcional de producción. La tarea sigue parcial por las restricciones de VIS-10 y la comprobación del recorrido real.

El cierre de REG-11 cambia el catálogo local de 65/217 (29,95 %) a 66/217 (30,41 %). Pasaron 68 pruebas locales de registro, catálogo y tablero, `team:check`, el test DOM y el navegador aislado del tablero a 1280, 390 y ancho efectivo de 640 píxeles con respuestas ficticias. El tablero público no se ha comprobado en esta conciliación.
