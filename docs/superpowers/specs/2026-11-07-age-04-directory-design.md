# AGE-04 · Directorio de anunciantes

## Propósito y límites

El equipo mantiene agencias, entidades y particulares con sus canales, contactos y teléfonos identificados, y puede relacionarlos con fuentes de investigación y publicaciones. Una persona verifica las identidades; una coincidencia de nombre no fusiona registros. La información de comisiones y de uso de imágenes se registra por separado y no impide inventariar ni consultar disponibilidad. El permiso concreto de presentar cada archivo se decidirá y comprobará en M07; una nota general no equivale a autorización para publicar fotos.

Las investigaciones BUS-21 a BUS-23 y su acceso por fuente BUS-19 son entregas separadas; BUS-10 y AGE-08 aún deben consumir las relaciones y los teléfonos. No se envía correo, no se captura ninguna web ni se activan automatizaciones. El personal autenticado usa la misma frontera de autorización que el resto del panel; Hermes no obtiene acceso nuevo.

## Conservación decidida por Luis

Solo para datos personales de anunciantes: revisión humana a los 11 meses sin actividad; a los 12 meses el equipo elimina esos datos o documenta por qué siguen siendo necesarios para una relación o gestión abierta. No hay borrado automático. Mostrar las fechas y el vencimiento visible hasta que se actúe; una revisión documentada indica su motivo y no simula una interacción comercial. No extrapolar esta decisión a contactos de aplicantes, otros datos, mensajes, archivos o investigaciones. Los datos personales incluyen nombre de particular y de contacto, teléfono y correo identificable. La supresión queda pendiente en la tarea separada AGE-14: esta aplicación no ofrece borrado manual ni automático de esos datos. Una razón de conservación debe referirse a una relación o gestión abierta real y quedar atribuida y fechada.

## Condiciones de diseño

Entradas externas se muestran como texto y los enlaces admiten solo HTTP(S); validar datos y autorización en servidor. Conservar todos los teléfonos y su titular, sin sumar ni sustituir números. Mantener la fuente histórica como referencia, no alterar registros importados ni inventar publicaciones BUS-10. El control de versión evita pérdida por ediciones simultáneas; los errores, conflictos y estados vacíos deben ser visibles y recuperables. Solo datos de prueba locales. Migración aditiva local, activación remota y publicación independientes.

La acción de registrar actividad corresponde a una actividad real confirmada por el equipo. Un motivo registrado desde el vencimiento se distingue de una decisión aún pendiente; registrar un motivo no mueve la fecha de actividad ni elimina datos. A los 12 meses se documenta la decisión o la justificación de conservación; la eliminación no está implementada en la aplicación.

## Coordinación de operaciones

App conserva durante su vida un coordinador sin datos de anunciantes, con un token propietario que impide operaciones de ficha simultáneas incluso al navegar y regresar. Solo la operación propietaria libera el bloqueo. Las versiones del servidor impiden que una edición obsoleta sobrescriba cambios confirmados. No existe coordinación entre pestañas para una supresión: la acción y su endpoint se han retirado; AGE-14 deberá resolver y verificar las fronteras entre documentos antes de ofrecerla. No se usa almacenamiento persistente ni se modifica autenticación.
