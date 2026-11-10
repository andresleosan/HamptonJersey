# QA completa · paso C · registro

Estado: paso C completado y verificado a `2026-11-10T04:29:32Z`. D–F no autorizados.

## Autorización y destinos

El dueño autorizó generar y guardar los secretos exclusivos de QA y configurar
los bindings de `hamptonjersey-qa` con `hampton-app-qa` y
`hampton-app-qa-media`, manteniendo Preview sin D1/R2, sin tocar producción
empresarial ni avanzar a D–F.

Configuración mínima prevista, exclusivamente en **Production del proyecto QA**:

- `SESSION_SECRET`: secreto nuevo criptográficamente aleatorio de 256 bits,
  sin reutilizar/exportar secretos empresariales ni la identidad Access de B.
- `DB`: D1 `hampton-app-qa`, UUID `53bc4af9-7250-44fe-8f90-6e415fda1034`.
- `MEDIA`: R2 `hampton-app-qa-media`, privado y separado del bucket empresarial.
- Preview: sin D1/R2 ni `SESSION_SECRET`. Sin activar `QA_HISTORY_ACTIVE`, añadir
  `QA_HISTORY_KEY`, credenciales de proveedores ni `HERMES_KEY` innecesarios.

## Guardias y comprobaciones

- [x] Reconfirmar cuenta, recursos exactos, estado vacío y configuración actual.
- [x] Revalidar Access de raíz, hashes y alias con identidad de B, sin redirecciones.
- [x] Verificar ACL del almacén privado y ausencia de un secreto QA anterior.
- [x] Generar `SESSION_SECRET` fuera de Git y subirlo por stdin solo al entorno QA Production.
- [x] Configurar los dos bindings por interfaz del proyecto QA, sin desplegar.
- [x] Releer configuración efectiva y lista de secretos de Production/Preview.
- [x] Verificar que no hay nuevos despliegues, datos, usuarios ni cambios empresariales.
- [x] Actualizar manifiesto y verificar que los artefactos públicos no contienen el secreto.

El secreto local se conservará en
`%USERPROFILE%\HamptonQA\full-app-access\session-secret.txt`, bajo la ACL exclusiva
del usuario establecida en B. No registrar valor, huella, fragmentos ni capturas
del secreto. Ante timeout o fallo, releer estado antes de cualquier reintento;
no regenerar ni sobrescribir credenciales de forma implícita.

## Límites de lo verificable en C

Se verifica la configuración remota del proyecto. El bootstrap estático existente
no tiene funciones ni usa D1/R2: la aplicación y el uso funcional de los bindings
se comprobarán al autorizar F. No desplegar ni emitir una sesión real para probar
el secreto, porque D–F continúan fuera de alcance. La exclusividad procede de una
generación nueva; no recuperar secretos empresariales para compararlos en claro.

## Ejecución

- Se revisó el código de Wrangler 4.148.0: `pages secret put` admite
  `--env production`/`--env preview` aunque el flag esté oculto en la ayuda;
  actualiza únicamente `deployment_configs[env]`. No aplicar el secreto a ambos.
- La cuenta única y los UUID de D1 empresarial, History y QA completa coinciden.
  La D1 QA sigue separada y R2 reporta cero objetos. Los únicos despliegues son los
  dos bootstraps de B. Configuración inicial y listas de secretos de QA Production
  y Preview vacías, comprobadas antes de generar el secreto.
- El primer sondeo de Access se detuvo: Python urllib con su User-Agent genérico
  recibe 403 incluso con la identidad válida. Se comparó con el perfil de B:
  User-Agent `Hampton-QA-Access-verification` devuelve 200 y marcador exacto.
  La repetición con ese perfil pasó 8/8 (raíz, ambos hashes y alias; anónimo 403,
  identidad correcta 200). No se cambió Access ni se atribuye una causa interna
  a Cloudflare más allá de la diferencia observada de perfil HTTP.
- Se creó localmente un SESSION_SECRET nuevo mediante CSPRNG (256 bits), distinto
  del secreto Access QA. Escritura exclusiva sin sobrescritura, lectura de vuelta
  y ACL de archivo/carpeta verificadas: solo el usuario Windows. No se imprimió el
  valor ni su huella.
- `pages secret put SESSION_SECRET --project-name hamptonjersey-qa --env production`
  recibió el valor por stdin y terminó con salida 0. Se fijó sanitización de logs.
  Lectura posterior: Production QA enumera únicamente SESSION_SECRET; Preview
  no enumera secretos. El panel muestra tipo Secret y `Value encrypted`.
- Se seleccionó DB en Production QA mediante la interfaz, verificando antes de
  guardar el nombre `hampton-app-qa` y UUID exacto. La tabla persistida muestra
  `D1 database | DB | hampton-app-qa`.
- Se seleccionó MEDIA con el bucket `hampton-app-qa-media`, sin tocar
  `hampton-media`. Guardado solicitado; falta lectura final de ambas configuraciones.
- El panel advierte que los cambios de bindings se aplican en el próximo
  despliegue. No se pulsa Create deployment ni se ejecuta un deploy en C.
- Lectura persistida del panel: Production QA muestra únicamente DB y MEDIA con
  los destinos autorizados y SESSION_SECRET cifrado. Preview muestra tabla de
  variables vacía y ningún binding D1/R2; se comprobó la URL `settings/preview`.
- La primera comprobación del TOML descargado se detuvo por interpretar la raíz
  como Production. Se revisó el exportador de Wrangler: serializa Preview en raíz
  y Production en `[env.production]`. La lectura de estructura confirmó DB con
  UUID exacto y MEDIA bajo ese entorno; no hubo un segundo cambio remoto ni
  despliegue para corregirlo. La comprobación final resuelve cada entorno según
  esa semántica. El `database_name` generado puede ser el nombre del binding DB:
  se exige UUID, y se verifica el nombre real mediante `d1 info --env production`.
- Access después de los cambios: **12/12**, cuatro hostnames reales, perfiles
  anónimo/clave incorrecta/identidad válida. Sigue 403/403/200 con marcador exacto
  usando el User-Agent identificado anteriormente. Esto prueba la frontera Access
  del bootstrap, no una sesión de la aplicación ni uso de D1/R2.
- Evidencia visual sin valores de secretos:
  `test-results/qa-production-bindings.png` (ignorado por Git).
- Lectura final por Wrangler, salida 0: Production QA resuelve DB al UUID nuevo
  exacto y MEDIA al bucket QA; Preview no tiene D1/R2 ni variables. Las listas de
  secretos confirman únicamente SESSION_SECRET en Production QA y ninguno en
  Preview. D1 conserva nombre/UUID previstos y cero tablas de usuario; R2 reporta
  cero objetos y URL r2.dev deshabilitada.
- Siguen exactamente los dos IDs de despliegue de B. No hubo deploy, SQL, carga de
  objetos, creación de usuarios ni instalación del runner. HEAD y GitHub siguen
  en `80ad03df7e095750f455aa4aa668573e9aac5db4`, sin push ni modificaciones en
  código/TOML empresariales. No se ejecutó D–F.
- El cierre acredita configuración de proyecto y almacenamiento privado del
  secreto; no acredita uso de D1/R2 por una aplicación desplegada. Los bindings
  se aplicarán al siguiente despliegue autorizado y la prueba funcional pertenece
  a F, después de D/E.
