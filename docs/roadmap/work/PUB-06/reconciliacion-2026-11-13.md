# PUB-06 · Conciliación de los datos económicos

La entrega `2ba135bdf8bd8593c5e619d5e8ed3d00c724b5ae` y la migración 0042 constan publicadas el 12-nov-2026 en el [registro de integración](../../../superpowers/plans/2026-11-12-pub-06-economics.md). Incluían la edición de renta y premium juntos para negocios. Ese hecho histórico se conserva.

El cambio publicado posterior `041188ebae37b2d3eec5993cf6c0ced0a3acf28f` selecciona el precio del negocio según su tenencia y retira premium del editor, de los campos editables y de la proyección pública. El [criterio A3](../../../superpowers/specs/2026-11-08-pub-06-financial-fields-design.md) sigue exigiendo editar y mostrar premium y renta juntos. Las pruebas actuales del cambio comprueban que el campo no aparezca; no acreditan A3.

No se ha encontrado en los planes, el maestro o el historial local una decisión explícita que retire ese criterio. PUB-06 pasa a **parcial** hasta conciliar expresamente el alcance, registrar la decisión y verificar el resultado. Esta conciliación no decide si debe restaurarse el campo, no modifica el producto y no afirma que haya datos reales afectados o borrados; no se consultaron cuentas, base de datos ni producción.

En la base local había 68 tareas hechas de 215 aplicables (31,63 %); después hay 67 de 215 (31,16 %). El denominador permanece igual y la reducción refleja esta discrepancia, no la anulación de la entrega histórica. La unidad de trabajo se reactiva para conciliar el alcance; no se emite evidencia al coordinador ni se comprueba el tablero público.

## Decisión de Luis · 13-nov-2026

Luis confirma seguir la recomendación y el diseño aprobado D7–D9: premium y renta de negocios se editan y muestran como conceptos separados; el premium es la base de filtros y comparables, sin sumar renta. La ausencia del premium no equivale a cero. La decisión revierte el criterio de precio de negocio de 041188e: un precio de venta freehold existente se conserva, pero no sustituye al premium en comparaciones ni en la guarda de precio de Queue. Si solo hay precio de venta, la etiqueta de negocio vuelve al estado de precio no publicado; si solo hay renta se identifica que el premium no está publicado. No se infieren ni migran datos. Este cambio puede afectar la presentación y elegibilidad de fichas existentes; no se han consultado datos reales.

El ratio de venta freehold permanece como información adicional de compatibilidad cuando existe `sale_price` y superficie interior; no reemplaza los ratios separados de premium y renta ni se usa como base de comparación de negocios. Los ratios de renta usan los sufijos pcm y p.a. de D6.
