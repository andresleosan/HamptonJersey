# PUB-12 · Completitud y publicación de fichas — plan de implementación

> Implementación futura: `superpowers:executing-plans`. Este documento no autoriza publicar código ni migrar producción.

**Objetivo:** mostrar porcentaje y campos recomendados, permitiendo publicar antes del 100 % con información básica y una foto pública. **Arquitectura:** catálogo puro de criterios para el panel; validación de publicación en el servidor para todas las entradas de publicación; mantener requisitos adicionales existentes de la cola Drive. **Stack:** React, Workers, D1 y pruebas Node. **Base observada:** `064aa7f3725ee3f8b13a39b3443778e2cf60da56`; verificar y reconciliar con main al construir.

## Decisiones y alcance

Luis confirmó el 9-nov que se puede publicar sin todos los campos recomendados si hay datos básicos y una foto pública, y que el precio puede ser privado. Para este plan, los datos básicos son título no vacío y operación válida (`sale`, `rent` o `business`), ya requeridos en el alta; una foto pública es `kind='photo' AND public=1 AND origin<>'external' AND r2_key IS NOT NULL`. No exigir importe ni `price_text`: puede ser privado. Estos mínimos son distintos de las recomendaciones; no impedir Publish por porcentaje inferior a 100. La cola Drive tiene reglas adicionales ya implementadas; no reducirlas ni cambiar su contrato, y respetar que la conexión Drive se dejó para más adelante.

La web ya oculta fichas sin foto incluso si `published=1`. La nueva validación se aplica al acto de publicar, no cambia automáticamente fichas existentes ni elimina fotos; si luego se quita su última foto, mantener el comportamiento actual de ocultación y aviso. Aclararlo al equipo. No relajar la restricción de cola en revisión, concurrencia `updated_at` ni `afterSave`.

Diseño: usar panel actual `#141414` sobre `#fff`, borde `#e2ddd4`, secundario `#6b665e`, error `#a32020`, Montserrat 14px/1.5, Tenor Sans 26px, tarjetas radio 14px. Mantener el bloque existente, enlaces a campos y estados accesibles de foco, error y carga. `impeccable`, `frontend-security-coder`, `security-best-practices`, `web-performance-optimization` y `ponytail` guían UI, seguridad y cambios mínimos; sin dependencias nuevas.

## 1 · Porcentaje y lista coherentes

**Archivos:** crear `admin/src/listing-completeness.js`, modificar `admin/src/ListingEditor.jsx`, crear `tests/listing-completeness.test.js`.

- [ ] Crear `listingCriteria(form, parish, photos, coverId)` que devuelve lista ordenada `{id,label,target,met}` con las reglas actuales de `missing`: precio por operación, parroquia de Jersey, dormitorios para residencial (0 es válido), tenencia para venta, categoría para vivienda residencial Jersey, cinco fotos públicas como un único criterio, portada entre esas fotos y resumen. Usar los mismos IDs y textos actuales; no añadir campos futuros automáticamente. Para precio público ausente pero `price_text` no vacío, tratar el criterio de precio como cumplido y mostrar que puede ser privado; el importe nunca será requisito de publicación. No inferir que un campo oculto contiene un valor.
- [ ] Crear `listingCompleteness(criteria)` que devuelve `{met,total,percentage}`, con porcentaje `Math.round(100*met/total)`; `percentage=null` cuando `total=0`. Los faltantes son exclusivamente elementos `!met` de esa misma lista. Evaluar el formulario en edición y fotos ya guardadas usando el filtro existente `publicPhotos`; no inferir cero si el detalle no pudo cargarse. Al cambiar operación, uso o país recalcular criterios sin borrar datos.
- [ ] En el bloque `Missing from this listing` mostrar porcentaje, leyenda `Based on current edits and saved photos`, enlaces actuales a faltantes y explicación de que no se requiere 100 %. Aclarar que debe guardarse antes de publicar. Mantener Save, Discard, errores, navegación, Queue y el resto del editor.
- [ ] Probar catálogo y aritmética para venta/alquiler/negocio, Jersey y otros países, 0 dormitorios, 0/4/5 fotos, portada que no es pública, resumen, cambio de condiciones, `price_text` privado, precio cero, array vacío, y comprobación de que faltantes y porcentaje usan una sola fuente. Ejecutar `node --test tests/listing-completeness.test.js`.

## 2 · Mínimos al publicar

**Archivos:** `server/routes/listings.js`, `server/routes/queue.js` si la integración lo exige, pruebas existentes de listing/queue en `tests/server/`.

- [ ] Extender pruebas API existentes para publicación desde editor y switch (ambos usan `setState`): sin título válido, sin operación válida o sin foto elegible → error 400 descriptivo; con título, operación y foto elegible → éxito aunque falten recomendaciones y aunque no haya importe. Cubrir foto externa, documento, foto privada y sin R2. Cubrir que la cola conserva sus requisitos adicionales y que un draft en revisión no pasa por el endpoint genérico.
- [ ] En `setState` aplicar comprobación solo a `action==='publish'`: validar título/operación de la fila y existencia de foto pública. La condición de foto debe repetirse en el propio `UPDATE` mediante `EXISTS`, además del `updated_at` y condiciones existentes, para evitar que una eliminación concurrente permita publicar sin foto en ese instante. Si no cambia fila, distinguir carencia de foto, dato básico inválido y conflicto de versión mediante nueva lectura; devolver error recuperable sin afirmar que se publicaron cambios. Mantener `listingBatch`, eventos, `afterSave` y las condiciones de archivo/cola vigentes. No cambiar la publicación posterior de fichas ya existentes automáticamente.
- [ ] Probar versión obsoleta, foto retirada entre lectura y UPDATE, caída del batch, intentos de editor/switch, publish de Queue, ficha ya publicada y eliminación posterior de la última foto. Asegurar que ninguna condición requiere 100 %, precio ni datos de nueva familia. Correr las pruebas de rutas afectadas y las pruebas de eventos de fichas.

## 3 · Cierre de construcción

- [ ] Con datos de prueba comprobar en navegador escritorio 1280 y móvil 390: mínimos ausentes, ficha válida con recomendaciones pendientes, precio privado, error, 409, teclado/foco y zoom 200 %. La lista debe anunciar claramente si está publicada pero no se ve por falta de foto.
- [ ] Ejecutar `npm test`, `npm run build`, `npm run check:release` y e2e aplicable; registrar resultados, revisión y restricciones. Actualizar PUB-12 al finalizar; PUB-01 y los trámites externos no se cierran por este cambio. No ejecutar migraciones ni publicación en esta planificación.
