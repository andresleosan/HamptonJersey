# Guardar en Hampton un correo seleccionado de Gmail

La persona operadora elige un mensaje recibido en el Gmail de Hampton para incorporarlo a la bandeja de entrada del panel. Esta selección es independiente del proceso que ya recoge las respuestas a los correos de la aplicación. Ambas vías reconocen el mismo mensaje por su identificador original de Gmail.

## Antes de usarlo

La selección manual está apagada por defecto. La primera prueba requiere la autorización de Luis, la versión correspondiente del cartero instalada y el interruptor `MSG03_MANUAL_GMAIL_READY` en `1` en Pages y en el entorno local del operador. El transporte `HERMES_MAIL_READY` debe estar activo. Se usa el permiso de lectura que ya tiene el cartero para respuestas. Las credenciales permanecen en sus archivos privados.

El ensayo local parte de un identificador de mensaje conocido. Queda por comprobar con Luis cómo obtener ese identificador individual en su interfaz de Gmail para el mensaje de prueba. Solo tener acceso al buzón o a un hilo no completa este paso.

## Seleccionar un mensaje

1. Examina el mensaje en el buzón autorizado. Comprueba que pertenece al expediente que quieres registrar y que su texto puede aparecer en la bandeja del equipo.
2. Identifica el valor exacto de `Message.id` de Gmail para ese mensaje. El identificador de una conversación, el encabezado de correo `Message-ID` y el enlace a un hilo son referencias diferentes. Si solo dispones de una de ellas, detén la operación hasta poder identificar el mensaje correcto.
3. Desde el entorno privado del cartero ejecuta el comando una vez. Sustituye el marcador por el identificador original.

   ```sh
   node correo.mjs seleccionar ID_DEL_MENSAJE
   ```

4. Revisa la bandeja de entrada del panel. El comando indica si se registró o ya se procesó. Si el equipo lo borró antes, la huella impide recrearlo. Ante un fallo incierto se puede repetir el mismo identificador.

El comando consulta un solo mensaje. Rechaza los enviados, borradores y mensajes fuera de los últimos 30 días. Exige que el tamaño del mensaje comunicado por Gmail y el tamaño de la respuesta de la API sean de hasta 1 MiB. Conserva hasta 50 000 caracteres de texto, junto con el remitente, asunto, fecha y referencias para enlazar respuestas. Si solo hay HTML, se conserva como texto. Omite los archivos adjuntos y los mensajes adjuntos. La fecha original determina la conservación. El borrado y las huellas utilizan las reglas de la bandeja de Hampton. El operador ejecuta el comando localmente. Las dos operaciones de red del cartero que usa el modelo siguen siendo las de redactar y entregar.
