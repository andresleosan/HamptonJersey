# SAP-10 · Confirmación manual de criterios

El servidor exige confirmación para cambios materiales y registra los campos confirmados con actor de sesión; el panel muestra el antes/después, incluye cambios derivados y retira la confirmación al modificar el borrador. `Use this` solo rellena el formulario. Las pruebas cubren ediciones parciales y completas de datos heredados. El par de respuesta `operation: rent` y `search_operation: transfer` conserva la cesión al reenviarlo; un cliente que quiera convertirla a alquiler envía `operation: rent` sin `search_operation` y confirma el cambio.

La revisión independiente detectó y ayudó a corregir la operación de transferencia, cambios de campos heredados no solicitados y el resumen incompleto; la revisión final no encontró bypass concreto. La prueba de SAP-10 pasó en Chromium aislado, a 1280 y 390 px con datos ficticios. Una prueba aislada anterior de BUS-14 falló esperando un marcador antes de este recorrido y reprodujo el mismo fallo en la base limpia `49619cd`; no se atribuye a este cambio.

La primera suite integrada terminó 2071/2074: tres fixtures enviaban cambios de criterios sin confirmación. Se añadió la confirmación explícita sin retirar sus aserciones; las 29 pruebas afectadas pasaron y la repetición completa pasó 2074 JavaScript y 25 Python. Build, release, catálogo, paquetes y `git diff --check` pasaron. AUT-19 y la pausa continúan fuera de este tramo; SAP-10 sigue parcial.

La prueba BUS-14 mencionada arriba se reparó después y pasó en el navegador aislado con BUS-12 y SAP-10 integrados; la [evidencia](../BUS-14/validation-closeout.md) describe el ajuste del fixture.
