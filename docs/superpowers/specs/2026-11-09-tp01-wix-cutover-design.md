# TP-01 · PRE-16, fotos y cierre verificable de la transición desde Wix

## Alcance y evidencia

Sólo planificación solicitada por Luis para TP-01,9-nov-2026. Base main fdc9e657f58ca05f17ba80e439aace13aabedb84 verificada20:51:33UTC; actividad sin verificar (activity_unavailable). No crear recursos, activar controles, leer secretos, exportar datos, descargar fotos, ejecutar copias/restauraciones, migrar, construir o publicar por estos documentos. La publicación anterior estaba acotada a los33 planes de Lista2, no se presupone permiso de publicar esta nueva tanda.

Decisiones conservadas: Hampton titular y Optimyze operador; Hermes gestiona los acuerdos con sus instrucciones existentes; no buscarlos ni transmitir instrucciones nuevas. Pro/Hermes central, datos C3 fuera de modelos/Hermes/Telegram, Meta fuera y WhatsApp/Places/Properties/modelos locales posteriores. Decisiones registradas en los planes publicados de Lista4 se reutilizan y no se vuelven a preguntar.

Las decisiones técnicas siguientes son propuestas del autor para cerrar el contrato, no citas de aprobación de Luis. Una puerta de activación no es una pregunta de producto ni una autorización para hacer configuración. Las casillas de pruebas futuras no son evidencia de ejecución.

## Intención y opciones

Conservar el tramo ya listo [fotos del equipo](../plans/2026-11-09-pre-16-fotos-equipo.md) y añadir un plan de cierre de PRE-16. El dominio ya apunta a la app según la evidencia existente; no rehacer migración DNS. Opción elegida por continuidad técnica: fotos locales estáticas permitidas, sin proxy de Wix ni nuevo servicio de imágenes. Luis ya autorizó reutilizar las dos fotos actuales del equipo; obtenerlas es trabajo futuro de construcción.

## Contrato del tramo de código

Archivos: site/lib.js, site/data/team.json, site/index.html, tests/lib.test.js y los dos JPEG site/assets/team/gilberto-franco.jpg y site/assets/team/joshua-franco.jpg. safeTeamPhoto(value) devuelve sólo una de esas dos rutas exactas o null. No URL externa, query, fragmento, traversal, esquemas peligrosos ni entradas no string. Conservar esc(), safeMedia/safeUrl, nombres y textos alternativos. Sustituir wix() en las tres superficies actuales: equipo, negociador al reservar y agente de ficha. Eliminar helper sólo al no tener consumidores.

Validar HTTP, MIME real, decodificación y correspondencia visual con las dos fotos autorizadas al construir. JPEG con dimensión mayor hasta1600px y presupuesto propuesto256KiB por archivo; si no conserva calidad, revisar presupuesto con evidencia sin sustituir la foto. Mismas imágenes para tres recortes, dimensiones/aspect-ratio actuales y CLS<0.1. Fallo de carga oculta sólo la imagen, mantiene nombre/rol/selección; listener JS sin onerror inline. Sin librería nueva si herramientas existentes permiten validar/optimizar. No descargar durante planificación.

DESIGN.md web: ink#151515,paper#ffffff,mist#f4f3f0,line#e3e0da,stone#77736c,bronze#a56b3d/bronze-dk#86542d; Montserrat15px/1.65 y TenorSans para titulares. Mantener recortes y responsive existentes, foco2px offset2, teclado/zoom200/reduced-motion; no aplicar un restyle a secciones no afectadas. Frontend-security-coder mantiene allowlist y escaping; impeccable/antislop conserva nombres, estados y legibilidad; performance limita peso/CLS; ponytail usa recursos estáticos.

## Cierre operativo de PRE-16

Tras fotos construidas, demostrar ausencia de solicitudes Wix para esas imágenes en las tres vistas. Conservar301/308/canonical/JSON-LD existentes y verificar los redireccionamientos de Wix publicados, login, registro y reserva con autorización y datos de prueba apropiados. PUB-14 es dueño Search Console/sitemap; ANA-09 es dueño WAF. No añadir tareas Meta retiradas. Registrar fechas, muestra de URLs, resultados y pendientes sin afirmar que una prueba local equivale a prueba real autorizada.

Dar de baja Wix es una decisión/acción posterior del titular, sólo cuando recursos/dependencias propios y cualquier servicio todavía contratado estén identificados y aceptados. No cancelar correo, dominio o suscripción asociada por inferencia; no tocar MX. El plan completo puede estar preparado aunque las gestiones no hayan ocurrido. Fotos listas en su alcance no significan PRE-16 finalizada.
