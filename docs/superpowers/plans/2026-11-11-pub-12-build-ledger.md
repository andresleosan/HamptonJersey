# PUB-12 · Construcción local

Fecha: 11-nov-2026. Base GitHub/producción `a2fab22`, copia aislada `.worktrees/ready-plans`. Encargo: comenzar planes listos sin depender de otras tareas. El índice TP-05 y el diseño TP-02 permiten este tramo sobre los campos y fotos existentes. No hubo cambios en datos reales, migraciones, publicación o servicios.

## Construido

- `listingCriteria` reúne criterios aplicables y `listingCompleteness` calcula desde esa misma lista el porcentaje, sin dar valor si no se conocen fotos. Precio privado y cero dormitorios cuentan; cinco fotos elegibles son una sola recomendación y la portada debe ser elegible.
- El editor muestra porcentaje y faltantes en el mismo panel, distingue ediciones actuales de fotos guardadas y aclara que el 100 % no es requisito. Un conflicto de guardado conserva el borrador.
- `publicationReadiness` es una política pura de título, operación y foto elegible. No cambia permisos, estados, Queue, direcciones ni rutas de publicación. PUB-02 debe integrarla con las guardias transaccionales y requisitos adicionales que le pertenecen.
- Criterio: el fallo de carga de la respuesta del editor no se presenta como cero; la función de cálculo rechaza media desconocida. Datos incompletos no demuestran ausencia de fotos.
- Decisión de planificación: el checklist antiguo aún decía que faltaba la decisión sobre bloquear por 100 %. El maestro TP-05 y el diseño TP-02 posteriores registran la decisión contraria; se corrige ese texto sin activar Publish.

## Pruebas

- RED inicial: módulos ausentes. Focal: 6/6 PASS (criterios, elegibilidad, precio privado, cero, cambio de operación/país, fotos desconocidas y mínimos).
- Navegador Chromium en D1 local aislada: 1280/390, porcentaje en vivo, foco, error 409 y texto conservado, zoom CSS 200 % y consola PASS. No acredita zoom nativo ni lector de pantalla.
- `npm run build` y `npm run check:release` PASS. `npm test`: 1.186 JavaScript y 14 Python PASS antes de la última corrección acotada del tratamiento de respuesta incompleta; después pasaron las pruebas focales y E2E reforzado. `npm run team:check`, `npm run check:packages` y `git diff --check` PASS.

## Revisión final

Revisión independiente de la rama: dos hallazgos corregidos. El test de zoom compara ahora contra el ancho efectivo de `documentElement.clientWidth`; la lectura del editor rechaza una respuesta sin array de media y presenta un error en lugar de construir un porcentaje o lanzar en render. El E2E reprodujo primero el fallo de interfaz y después pasó en 1280/390 con respuesta de media nula, 409 y zoom CSS 200 %. No se repitió una segunda revisión independiente; se verificó la corrección con el recorrido afectado.

## Restante

- Revisión del cambio local y eventual integración de PUB-12; PUB-02 conecta la política a las rutas con sus propias guardias. Ninguna ruta de publicación se modificó en este tramo.
- La API actual falla la lectura completa ante error de D1; una respuesta incompleta de media se trata como error. No se deduce disponibilidad de medios de las pruebas sintéticas.


## Reconciliación · 11-nov-2026

El código de PUB-12 consta en `4947b0c`, ancestro de `2878719`; Cloudflare Pages y Workers Builds de este último SHA terminaron correctamente según la comprobación previa. El editor y la política pura corresponden al contrato TP-02. Pruebas focales: 6/6; WebKit aislado con datos ficticios pasó a 1280/390, foco con teclado, conflicto 409, respuesta de media incompleta y zoom CSS 200 %. No se comprobó zoom nativo, lector de pantalla ni flujo autenticado de producción. No se realizó acceso nuevo a producción en esta reconciliación.

La conexión de la política a las rutas reales, guardias transaccionales y requisitos adicionales de Queue pertenece a PUB-02; no se atribuye a PUB-12 ni se afirma activada. El estado `hecho` de PUB-12 y la corrección de la dependencia de PUB-02 se registran en esta reconciliación; la recepción del catálogo por el tablero se verifica tras su despliegue.
