# REG-11 · Registro por modalidad

7-nov-2026. Construido localmente; la validación completa está limitada por DNS de Turnstile. No acredita publicación ni activación.

## Decisiones de Luis

- D08, opción 1: inmueble comercial, negocio o ambos; operación, uso, zonas y exclusiones, superficie mínima y máxima con unidad, fecha y, según proceda, compra, alquiler con periodo, traspaso y gastos como importes independientes. «No lo sé» deja el dato pendiente.
- Por operación y contacto puede existir una búsqueda residencial activa y una comercial activa. La comercial especifica inmueble, negocio o ambos. Un registro repetido del mismo tipo y operación se deriva a revisión humana.
- Compra y alquiler simultáneos son búsquedas relacionadas, con presupuestos separados. Los componentes desconocidos del hogar no se convierten en cero ni en un total confirmado.

## Contrato

El contacto identifica las búsquedas relacionadas; cada operación conserva su identidad, estado, historial y condiciones. La creación simultánea debe ser atómica y no revelar en el formulario público si el contacto ya existe. Una repetición pública conserva las respuestas para revisión; no sobrescribe las búsquedas guardadas. El panel muestra y edita los datos nuevos y sus estados pendientes. Los registros anteriores residenciales se conservan sin inventar respuestas.

El cruce actual solo contempla inventario residencial; las búsquedas comerciales no deben generar coincidencias residenciales ni presentarse como evaluadas. El cruce comercial pertenece a M04. La resolución de una búsqueda no resuelve otra. No se modifican los plazos de conservación ni se habilita el envío a terceros.

La aplicación debe distinguir compra, alquiler y traspaso, incluidos renta y premium simultáneos cuando procedan, sin comparar cantidades con periodos distintos. Valores desconocidos no significan cero, ausencia ni cualquier opción. Los importes, unidades, rangos y fechas se validan en el servidor y la interfaz; la fecha anterior ya guardada sigue siendo editable sin obligar a sustituirla. La elección expresa de no tener niños es distinta de no conocer la respuesta.

## Verificación

Probar migración con datos anteriores, unicidad y carreras, alta web y panel, duplicados, ambas operaciones con presupuestos independientes, importes comerciales, respuestas desconocidas, total del hogar y aislamiento del matching. Comprobar el recorrido completo local a 1280 y 390, validaciones, estados vacíos y de error, teclado, foco, zoom y consola/red. Aplicar `npm test`, `npm run build`, `npm run check:release` y e2e. La migración y publicación requieren aprobación posterior del SHA final.
