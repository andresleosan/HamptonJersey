# listing_text · borrador de texto de ficha

- **Estado:** definición inicial; existe el tipo de trabajo en `server/routes/hermes.js`, sin acreditar conexión de un modelo.
- **Objetivo y disparador:** preparar una propuesta de texto para una ficha a petición del equipo o de Hermes, con los datos públicos permitidos por el servicio propietario.
- **Entrada y clase:** solo el DTO público permitido por la ruta existente; clasificación prevista C0. La clasificación y la revisión de la versión concreta deben comprobarse antes de cualquier ejecución futura.
- **Pasos, modo y salida:** preparar un borrador para revisión. Draft/Approve/Auto no publican ni aprueban un texto por sí mismos; su política real pertenece a AUT-10 y no se implementa aquí.
- **Puertas humanas:** revisión del borrador y decisión de publicación por el equipo. Una propuesta no aprueba un match, una consulta con imprescindibles desconocidos, el cierre de una búsqueda ni una presentación.
- **Fallo y coste:** sin vía autorizada, cuota o datos suficientes, parar y derivar a revisión humana. Tope y moneda pendientes (`null`); no se autoriza gasto. Al alcanzar el tope configurado, el modo futuro deberá pasar a Draft; coste desconocido requiere revisión.
- **Aceptación:** pendiente de casos reales/adversarios, umbral específico y evidencia. Los fixtures de este repositorio no demuestran conexión, calidad ni recepción real.
- **Servicio dueño:** AUT-13, con autorización del modelo en AUT-05 y modo en AUT-10. Esta ficha no cambia sus rutas.
