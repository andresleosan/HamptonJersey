# Reflujo público independiente de REG-12

El E2E anterior de REG-12 detectó 652 px de ancho del documento en una ventana de 390 px con zoom CSS del 200 %. Al sustituir temporalmente el acuse nuevo por el marcado anterior en el mismo DOM, el resultado seguía siendo 652 px; los mayores desbordamientos eran el logo y el menú de la cabecera. Aquella comparación no ejecutó una versión anterior completa y el E2E original quedó fallido.

Este cambio independiente permite que la cabecera móvil ajuste y envuelva logo y menú, y evita un mínimo rígido en la cuadrícula del pie cuando queda poco espacio. Conserva el marcado, los enlaces y la lógica del menú. No modifica los criterios ni el acuse de REG-12.

Dos ejecuciones de Chromium con fixtures locales, mediante `E2E_PRODUCTION_READONLY=0 npm run test:e2e:isolated`, pasaron:

- `E2E_SCRIPT=tests/public-header-reflow.e2e.cjs`: anchos 1280, 390 y 320 px, logo y visibilidad del menú, apertura mediante teclado, foco inicial, Escape y retorno del foco; cabecera y pie se ajustaron también a 390 px con zoom CSS del 200 %.
- `E2E_SCRIPT=tests/reg12-registration.e2e.cjs`: nuevo y repetido, dos operaciones, comercial sin matching, acuse idéntico, foco de controles y guardado de prioridades `unknown` sin respuesta ni valor coherente. El documento público midió 390 px con el acuse actual y con el marcado anterior a 390 px/200 %; el documento administrativo también midió 390 px. Esta ejecución contiene tanto la corrección de prioridades como el reflujo independiente, por lo que no acredita que los commits anteriores, por sí solos, resuelvan el zoom.

Las tres ejecuciones E2E anteriores que alcanzaron el fixture siguen documentadas en `2026-11-13-acuse-y-criterios.md`; esta repetición no convierte aquellas ejecuciones en aprobadas. No se probó WebKit ni producción y no se ejecutó una suite completa.
