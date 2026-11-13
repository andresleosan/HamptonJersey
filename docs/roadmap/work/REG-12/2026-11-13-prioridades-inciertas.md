# REG-12: corrección de prioridades no confirmadas

Pasada correctiva sobre `103ecc44f9f8f0a397b9e461349227eb5c2d9f5d`, a raíz de revisión independiente. REG-12 sigue parcial; el acuse, la API, el matching y el almacenamiento no cambian.

Una prioridad explícita `unknown` se señala para revisión aunque falte la respuesta. Una respuesta incluida en `unknown` sin prioridad guardada también genera revisión de prioridad, sin inferir que es opcional. Si los metadatos declaran simultáneamente respuesta desconocida y respuesta presente, se pide confirmar la respuesta; si además su prioridad está sin confirmar, se muestran ambas acciones con claves distintas. Un must-have incompatible con una respuesta que lo hace inaplicable queda pendiente de revisión de prioridad. Una respuesta realmente opcional y aún desconocida no se convierte en imprescindible.

Las reglas de operación compradora y los campos realmente inaplicables siguen aplicándose. La proyección es de solo lectura y no modifica prioridades. Quedan las limitaciones documentadas en la entrega anterior: editor con interruptor Off para prioridad desconocida, metadatos históricos incompatibles que pueden impedir abrir la ficha, falta de progreso de EST-01 e inventario/clasificación pendientes. Ningún resultado vacío certifica que los datos estén completos.

Pruebas: antes de la corrección fallaron las dos pruebas nuevas de prioridad sin respuesta y metadatos contradictorios; tras ella pasaron 16 focales puras de proyección, foco y presentación. Se amplió el fixture E2E para guardar prioridades no confirmadas sin modificarlas, pero esa ampliación aún no se ha ejecutado. El E2E previo sigue fallido por el reflujo público ya documentado. No se hizo despliegue ni migración remota.
