# Lote revisable de aplicación · 14-nov-2026

Alcance vigente: cerrar **PUB-08**, verificar el aumento del tablero, guardar con commit/push y detenerse, según la última instrucción de Luis. PUB-06/SPR-01 se conservan preparados para otra sesión. La revisión automática rechazó inicialmente aplicar 0048 por falta de autorización explícita. Después de presentar el cambio exacto, Luis respondió «si autorizo» a **solo 0048 en D1 `hampton` y `PUB08_CONTENT_READY=1`**.

## Recurso y cambios exactos

Base D1 existente `hampton`, binding DB de HamptonJersey. Las dos migraciones revisadas tienen estados distintos; no se incluye el resto de la cola pendiente:

- **0048 aplicada:** `migrations/0048_listing_content.sql` · SHA-256 `a1e6e6ee3c0e7341b9d82818e6f40f45afb4b03309aff4ea84410c86b4a3550a`.
- **0052 preparada, no aplicada:** `migrations/0052_listing_economics_history.sql` · SHA-256 `07f5bbc2a52fe6ab7f08533bde31afcef4530c7c7c8f81890144de6582747ec1`.

0048 crea una tabla de contenido vacía y dos validadores cerrados, sin poblar fichas existentes. 0052 añade cinco columnas nullable de condiciones económicas, un marcador y guardas de compatibilidad; reemplaza definiciones verificadas de triggers para registrar esos valores y available_on en el historial. No se reconstruyen tablas de datos ni se ejecutan borrados o backfills. Aun así, son modificaciones de esquema y auditoría de producción.

0048 se aplicó desde un directorio seleccionado que contenía exclusivamente ese archivo, contra el recurso verificado y después de comprobar hash, base remota y un marcador privado Time Travel. Wrangler terminó con salida 0. Tres lecturas separadas confirmaron `listing_content`, los validadores `listing_content_tags_insert`/`listing_content_tags_update`, el registro `0048_listing_content.sql` y cero filas en la tabla nueva. No se ejecutaron las demás migraciones. La primera consulta combinada de comprobación falló; se comprobó el resultado sin repetir la aplicación. Recuperación de código: apagar el gate conservando el esquema y sus datos; restaurar o borrar datos requiere su autorización propia. No se publica el marcador privado.

## Activación exacta autorizada

La configuración fuente añade únicamente:

```toml
PUB08_CONTENT_READY = "1"
```

Se contrastaron las variables públicas y los identificadores de bindings efectivos de Pages: se conserva la configuración anterior. El vídeo sigue requiriendo elección del visitante antes de conectarse al proveedor. `PUB06_STRUCTURED_ECONOMICS_READY` permanece ausente. Después del push `faf43a3`, la exportación nativa de configuración efectiva confirmó PUB08=1 y la misma identidad DB; Pages nativo acredita despliegue exitoso de ese Source y `/` y `/api/listings` responden HTTP 200 tanto en el deployment exacto como en el dominio público. El check GitHub de Pages seguía mostrando Building al contrastarlo; no se presenta como aprobado. [Detalle](../PUB-08/2026-11-14-integracion-activacion.md#publicación-y-cierre).

## Evidencia disponible y controles

- 0048 sobre baseline hasta 0042: preserva registros de fichas, medios, eventos y notificaciones; claves foráneas y catálogo cerrado comprobados. Focales de contenido/privacidad: 18/18.
- 0052 sobre baseline hasta 0042 y 0048: suite focal 110/110 y última D1 poblada 2/2. DDL remoto de ocho objetos coincide exactamente con la reconstrucción hasta 0042. Generador canónico y revisión independiente sin hallazgos pendientes.
- El recorrido nuevo `tests/pub08-integrated.e2e.cjs` pasó en Chromium y WebKit aislados con rutas reales de aplicación y D1/R2 sintéticos. Comprueba 400/409, persistencia, dos sesiones, tour/vídeo separados, privacidad antes del clic, recuperación offline, teclado, 1280/390 y zoom. Solo se intercepta el documento del proveedor externo. Chromium usa viewport efectivo para el reflujo público; WebKit acredita zoom nativo 200 %; el editor usa zoom CSS. No se presenta este fixture como autenticación Firebase ni escritura de producción.
- Revisión independiente final de la prueba y sus dos lanzadores: sin hallazgos pendientes. Las excepciones de consola están restringidas a fuentes offline, DNS exacto de `apis.google.com` en el fixture y aviso exacto de ResizeObserver de WebKit; los errores de aplicación siguen fallando.
- Suite conjunta final: **2.308/2.308 JavaScript y 29/29 Python**. Pasaron build, release estricto, catálogo, paquetes, generador del contrato canónico y `git diff --check`. No se presentan fixtures como comprobaciones de producción.

La primera batería conjunta detectó ocho fallos de fixtures PUB-10: cargaban todas las migraciones contra una propuesta que declara y exige baseline exacto hasta 0051. Se limita únicamente ese fixture a la base declarada y se añade una comprobación explícita de que 0052 es rechazada como deriva, conservando esquema, datos y claves foráneas. No se debilitan las guardas ni se afirma compatibilidad de la propuesta PUB-10 con 0052: antes de ejecutarla en una base posterior habrá que regenerarla y revisarla. La recepción PUB-10 continúa cerrada.
- El cierre de cada ficha solo se publicará después de comprobar aplicación, activación y pruebas requeridas; antes continúa parcial.

## Continuidad

**0052 y PUB06_STRUCTURED_ECONOMICS_READY no se aplican ni activan en esta sesión**. Su código revisado, pruebas y decisiones reconciliadas se conservan para retomar PUB-06/SPR-01. Después del cierre real de PUB-08 y de verificar el aumento público, guardar todo con commit/push y detenerse. El cierre y la verificación final se registran en [la evidencia PUB-08](../PUB-08/2026-11-14-integracion-activacion.md).
