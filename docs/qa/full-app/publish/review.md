# Revisión independiente · preparación F

Estado: revisión independiente de preparación completada; sin hallazgos materiales abiertos en los archivos revisados. No autoriza publicación, cambios remotos ni lectura de credenciales reales. El manifiesto final debe sellarse después de esta revisión y verificarse antes de pedir el permiso específico.

Fuente revisada: `80ad03df7e095750f455aa4aa668573e9aac5db4`. Se recalculó el árbol completo del artefacto y coincide con `build-manifest.json`: `d4b2a57bd3036efc1718396d68edfb3912d59f8e35a2cd4dae765e8c6d43c30b`.

## Hallazgo corregido

El runner asignaba la ruta del secreto antes de crearla mediante `wx`; si ya existía, el `finally` podía borrar un archivo ajeno a esa invocación. La versión revisada adquiere propiedad tras `fs.open(..., 'wx')` y comprueba dispositivo/inodo y ausencia de enlace antes de borrar. El hallazgo queda resuelto por lectura del cambio; no se introdujeron secretos ni se ejecutó el runner real.

El timeout del proceso host podía terminar solamente el CLI `docker exec`, dejando el proceso Node ejecutándose dentro del contenedor. El launcher corregido detiene únicamente el ID sellado del runner ante ejecución/resumen incierto, confirma el ID, `Running=false` y PID 0, y conserva el sentinel de incertidumbre. Esta acción de fallo figura expresamente en la propuesta y necesita autorización junto con F; no se ejecutó durante la revisión.

La identidad de imagen se contrasta ahora con el ID conservado en E1 y, por separado, con la referencia exacta fijada por digest. Se evita asumir que un ID local y un digest de manifiesto son intercambiables. Los locks y el sentinel también comprueban propiedad de dispositivo/inodo antes de borrarse.

## Fronteras revisadas

- El wrapper exige origen QA exacto, marcador/versionado de D1 y bindings necesarios antes de servir páginas, API, recursos y medios. Rechaza mutaciones sin Origin QA, login de proveedor y puertas History/Hermes anteriores.
- El entorno derivado entrega únicamente DB/MEDIA/ASSETS y el secreto de sesión a la app; los proveedores se sustituyen o deshabilitan. No se encontró transporte de producción en el artefacto revisado.
- El cliente valida destino antes de leer cabeceras Access y no sigue redirects. El browser intercepta peticiones por origen; no configura credenciales globales de navegador. La sesión se firma para la identidad ficticia fija.
- La limpieza de listing/media/usuario verifica propiedad y vuelve a comprobarla antes de borrar. Ante propiedad incierta conserva datos y devuelve fallo; no hace reset general.
- El prerequisite SQL condiciona también el INSERT al marcador QA, además de su comprobación anterior.
- El launcher verifica la huella de aprobación, inventarios completos, ausencia de reparse points/hardlinks y configuración E1 antes de preparar o ejecutar. El staging añade solamente el paquete aprobado bajo `/work/qa-f`; no prepara el entorno mediante npm ni amplía montajes.
- La carga de identidad exige primero ACL Windows privadas y sin herencia para directorios y tres archivos fijos. Los valores viajan únicamente por stdin; no por argv, variables de entorno ni montajes. La salida host acepta solamente un resumen con campos y tipos fijos; no imprime stderr ni errores con valores.
- El sellador comprueba fuente y ambos árboles completos, enlaza SQL/destinos y alcance de parada ante fallo, y se niega a sustituir una propuesta existente. No hace publicación, staging activo, lectura de identidad ni operación Docker.

## Verificación independiente

Se ejecutaron 19 pruebas offline de boundary, entrada, transporte y propiedad/limpieza de CRUD, y 13 del launcher con procesos/credenciales simulados: 32 pasaron, ninguna omitida. Se verificaron todos los hashes y tamaños del artefacto y del paquete runner de 123 archivos; este último coincide con `81e70f0b63844dd9a0bbd36efc1cdf3af7e02a2722ce1516117a667e4324f1f0`. Sus cinco módulos byte-match con los fuentes revisados. No se ejecutaron Chromium, Docker, Cloudflare, publicación ni solicitudes al origen QA en esta revisión. La auditoría Docker real de solo lectura fue comunicada por el implementador; no se repitió aquí.

## Límites de la evidencia

- Los 71 checks API y 66 UI locales comunicados por el implementador corresponden a smoke. Las UI comprueban rutas, renderizado y layout a dos anchos; no acreditan todos los workflows ni accesibilidad completa.
- El runner inicial hace CRUD de listing/media/usuario; el resto de módulos recibe lectura. La simulación Drive consultada entrega descriptores sintéticos; no acredita una importación completa por la UI. Hermes se omite en ese runner porque su borrado normal no está dentro de la limpieza propuesta.
- El endpoint de jobs reutiliza el handler original, que captura ciertos fallos internos de retención/notificaciones/insights. Un HTTP 200 del simulador acredita la invocación, no el éxito de cada subproceso. Los efectos de mantenimiento sobre fixtures y filas operativas/auditoría permanecen para inspección.
- Las integraciones son simuladas. La identidad Access, bindings remotos, funcionamiento del router ASSETS nativo y resultados desde el contenedor aislado requieren comprobación posterior autorizada.

No se encontró otro hallazgo material en los archivos disponibles. La aprobación y la ejecución remota continúan pendientes; estos resultados locales no acreditan despliegue ni cobertura publicada.
