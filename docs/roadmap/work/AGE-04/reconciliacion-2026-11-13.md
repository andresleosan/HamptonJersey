# AGE-04 · Conciliación de despliegue y pendientes

La ficha anterior describía el directorio como exclusivamente local. Los commits `bf30e86` y `9d4429c` son antecesores de `b544c2e`; ese árbol contiene `0030_advertisers.sql`. La [evidencia histórica de REG-05](../REG-05/acceptance.md) registra Pages en `b544c2e` y una consulta sin migraciones pendientes el 11-nov-2026. Esto respalda la publicación y aplicación histórica de 0030; no es una nueva consulta de producción.

El 13-nov `tests/server/advertisers.test.mjs` pasó 7/7 con datos ficticios sobre `0328a89`. La consulta remota de migraciones realizada en esta sesión fue denegada; no se han consultado registros reales del directorio.

AGE-04 sigue parcial: falta conectar las fuentes y publicaciones del inventario común a las tareas de llamada, conservando los teléfonos y titulares de cada anunciante. Supresión, acuerdos y permisos de imágenes conservan sus alcances separados. No se añaden anuncios, contactos ni permisos reales.

La integración futura con BUS-06/BUS-10 se describe como tramo pendiente, sin hacer depender el directorio base de esas tareas: BUS-06 ya requiere el directorio integrado y un bloqueo global introduciría un ciclo.
