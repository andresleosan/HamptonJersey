> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# PUB-05 · Características físicas de la propiedad

Fecha: 8-nov-2026. Lista 4. Entrega: **solo planificación local**, sin reservas, construcción, migración ni publicación. Diseño propuesto para revisión; no atribuir a Luis aprobación de sus detalles técnicos.

## Objetivo, fuentes y situación real

Completar la familia física de la ficha: superficie interior en pies² y m², aseos, salones, parking/garaje, trastero, planta/plantas, ascensor, año, conservación, calefacción, doble acristalamiento, exterior, comodidades, amueblado y mascotas. El equipo debe poder corregir un dato sin que guardar una descripción o recalcular coincidencias borre su decisión.

Fuentes: `docs/roadmap/tasks/PUB-05.json`, checklist, arquitectura §5.10 y los planes locales SPR-01/PUB-06 del 8-nov. Base verificada: `main`, `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Regla vigente de avanzar: `plan --list 4 --task PUB-05` devuelve `reserved:false`, `buildAuthorized:false`. El original privado de Luis no existe en esta copia; no se copió.

Ya existen `bedrooms`, `bathrooms` y `property_type`. `extractFeatures()` calcula `feat_pets`, `feat_parking`, `feat_furnished`, `feat_outdoor`, `feat_type`, `feat_evidence` desde texto/specs. Se llama al crear/guardar y desde `recalcListings()`; el SELECT del recálculo solo lleva los campos de texto actuales. `feat_evidence._requirements` aporta certeza para los must-haves de REG-08; cambiar solo un `feat_*` no basta para cambiar esa certeza. EST-18 usa triggers con campos enumerados. Ninguno de los campos nuevos de este diseño está construido en la base inspeccionada.

## Alternativas y elección propuesta

1. **Recomendada:** campos físicos tipados y un pequeño documento de excepciones manuales para las cuatro características derivadas editables. Conservar `feat_*` como proyección compatible y resolver prioridades en el extractor común.
2. Hacer editables directamente los `feat_*`: menos interfaz inicial, pero el próximo guardado/recálculo los sobrescribe y su certeza puede contradecir el valor. Descartada.
3. Guardarlo todo en Specification: mantiene texto libre, sin unidades ni desconocidos fiables; no permite prioridad manual verificable. Descartada.

## Datos nuevos y validación

Todos opcionales. Omitidos en PUT parcial se conservan; vacío/espacios/null borra según el tipo. No sustituir desconocido por no, cero, lista vacía o planta baja. Los campos estructurados no se extraen automáticamente de prose en esta entrega.

| Campo | Contrato API y almacenamiento |
| --- | --- |
| `interior_area_sqft` | Campo único compartido con PUB-06: REAL nullable, número finito `0 < n < 1e8`, hasta 2 decimales. No superficie del terreno. No duplicar columna ni validador ya integrado. |
| `separate_wcs`, `reception_rooms` | INTEGER nullable, entero 0–100. Aseos separados de bathrooms; no sumarlos a los baños ni al requisito de baños de matching. |
| `has_garage`, `has_storage`, `has_lift`, `double_glazing` | INTEGER nullable, exclusivamente 0/1/null en API. Controles `Unknown`, `Yes`, `No`, sin coerción booleana de strings. Garaje no implica un número de plazas. |
| `floor_level` | INTEGER nullable, entero -20–200. 0 es planta baja, negativos sótanos; planta de acceso principal para dúplex, no número de niveles de la vivienda. |
| `building_floors` | INTEGER nullable, entero 1–200; plantas sobre rasante contando la baja. Si ambos son conocidos y floor_level ≥0, exigir floor_level < building_floors. No forzar ninguno en casas o negocios. |
| `year_built` | INTEGER nullable, entero 1–9999. Dato declarado, no fecha de licencia ni prueba de antigüedad; no inferir año del texto. |
| `property_condition` | TEXT nullable: `new_build`, `existing`, `good`, `needs_modernisation`, `needs_renovation`. Labels `New build`, `Existing (condition not assessed)`, `Good condition`, `Needs modernisation`, `Needs renovation`; null `Not known`. `existing` afirma segunda mano sin afirmar buen estado, distinto de null. Campo compartido con PUB-04, sin segunda columna. No calcular un certificado. |
| `heating_types` | JSON array nullable con códigos `oil`, `gas`, `electric`, `heat_pump`, `lpg`. Array canónico sin duplicados en ese orden. Null desconocido; [] confirmado sin calefacción; no equiparar no seleccionado a ninguna. |
| `amenities` | JSON array nullable: `pool`, `gym`, `communal_areas`, orden canónico. Null desconocido; [] confirmado sin esas comodidades. No incluye inventario de seguridad, domótica o aire acondicionado no pedido. |
| `feature_overrides` | TEXT JSON NOT NULL DEFAULT '{}'. API recibe objeto estricto con claves opcionales `pets`, `parking`, `furnished`, `outdoor`, sin claves desconocidas. Omitir campo en PUT conserva; null o {} explícitos restablecen todas a automático. Dentro del objeto, clave ausente = automático; clave presente null = desconocido manual que bloquea la extracción de esa característica. |

Validar arrays como arrays JSON reales, no texto JSON en la API. Serializar solo en la capa de persistencia y devolverlos como listas en el detalle. Mantener bedrooms/bathrooms 0–100 y property_type existentes. Errores por campo: enteros `Enter a whole number from {min} to {max}, or leave blank`; flags `Choose Yes, No or Unknown`; área reutiliza mensaje de PUB-06; enums `Choose a listed value or Unknown`; floor inconsistente se asocia a `floor_level` con `Floor must be below the number of above-ground floors`.

## Excepciones manuales y certeza

| Clave | Valor manual válido |
| --- | --- |
| pets | `yes`, `no` o null. Yes expresa aceptación sin condición; para `Pets considered`, restricciones o permiso pendiente usar Unknown. No crear reglas por especie/cantidad. |
| parking | Entero 0–10000 o null. Es el número confirmado de plazas propias incluidas; 0 declara ninguna, no una plaza desconocida. |
| furnished | `yes`, `no` o null. Part-furnished o a negociar es Unknown, no Yes. |
| outdoor | null o mapa de `garden`, `terrace`, `balcony`, `patio` con valores `yes`, `no`, `unknown`. Un mapa manual reemplaza la extracción de todo el exterior: claves omitidas se normalizan a unknown; orden fijo y sin extras. No mezclar selectivamente inferencias automáticas con ese mapa manual. |

## Decisiones de integración

| ID | Decisión propuesta |
| --- | --- |
| D1 | Superficie: editar un solo input `Interior area (sq ft)` y mostrar al lado un output `Interior area (m²)` calculado con factor exacto 0.09290304. Mostrar 2 decimales; 1000 sq ft →92.90 m². No guardar ni editar una segunda cifra ni hacer conversiones de ida/vuelta al guardar. Valor desconocido muestra `Not known`. |
| D2 | PUB-06 ya propuso interior_area_sqft. Orden de construcción recomendado SPR-01 →PUB-06 →PUB-05: consumir su columna/validación y ratio existentes, sin ciclo (PUB-06 no espera a la familia física completa). Si aún falta, planificar no se bloquea; al construir acordar/integrar ese mínimo bajo su tarea, sin segunda columna/migración. |
| D3 | Datos manuales nuevos son informativos y opcionales; no cambian criterios de publicación, permisos, residencia, habitaciones mínimas, pesos/umbrales ni disponibilidad. Nuevos aseos no satisfacen baths; nuevas comodidades no convierten requisitos libres en comprobados. |
| D4 | La UI distingue por característica `From text`, `Set manually`, `Unknown`. `From text` quita la clave del objeto; `Unknown` pone null; `Set manually` exige un valor válido. Mensaje `Manual values are kept when the text changes or matches are recalculated.` |
| D5 | Usar `Object.hasOwn` para distinguir ausente/null/0. Rechazar arrays como override, strings incluso vacíos, prototipos/claves extra y valores fuera de enum; nunca mezclar objetos no validados mediante un spread a columnas SQL. Validar/normalizar feature_overrides antes de la rama blank general: null de API se convierte en objeto {} y en texto DB '{}', nunca en NULL para esa columna NOT NULL. JSON canónico para que un no-op no produzca eventos. |
| D6 | Extraer texto como hoy y aplicar excepciones al final, en el mismo `extractFeatures()`. Todos sus consumidores obtienen la proyección efectiva. Actualizar SELECT de recalcListings para incluir feature_overrides; conservar guardia updated_at y no modificar updated_at al recalcular. El recálculo nunca escribe feature_overrides. |
| D7 | Regenerar juntos valor y evidencia: parking manual N produce feat_parking=N y `_requirements.parking={value:N,kind:'exact'}`; null produce value:null/kind:unknown. Pets manual yes/no/null produce certeza yes/no/unknown. Furnished manual actualiza feat_furnished y su texto de evidencia. Conservar las certezas de claves no sobrescritas y `_requirements.version=1`. |
| D8 | Exterior manual conserva cuatro hechos en el override. Para compatibilidad, legacy `terrace` significa terraza o patio: combinado yes si cualquiera es yes, no si ambos son no, unknown en los demás casos. feat_outdoor contiene códigos legacy garden/terrace/balcony positivos. Si los cuatro son unknown queda null; en los demás casos puede ser [] sin positivos. `_requirements.outdoor` lleva certeza garden/terrace/balcony con la misma combinación, sin falsos positivos. |
| D9 | Etiqueta de evidencia manual fija, sin autor/email ni texto libre: `Set by staff`, más el hecho normalizado cuando sirva para explicarlo. El actor real y el momento se conservan en eventos de guardado existentes. Manual no acredita origen documental ni aprobación del propietario. |
| D10 | No tocar la lectura automática de tipo ni parroquia. El tipo libre existente sigue alimentando feat_type y sus comprobaciones; no crear un segundo selector de Type ni duplicar la superficie en Price. Cambiar operación/use no borra datos físicos o overrides ocultos. |
| D11 | Auditoría: columnas físicas y feature_overrides tipados en fields/before/after, usando json() para listas/mapas. feat_* y feat_evidence siguen siendo proyecciones derivadas; el historial distingue el cambio humano en feature_overrides y el efecto calculado. No-op/400/409 no añaden eventos y un fallo del evento revierte todo. |
| D12 | Fuentes/importación no convierten texto en una confirmación humana. property.txt y Drive mantienen sus whitelists. En createListing con source queue, rechazar feature_overrides no vacío con error de campo `Review manual facts in the listing editor`; dejar la cola recuperable. Correcciones manuales solo por rutas admin con autenticación y CSRF existentes. Recálculos no inventan un actor humano. |
| D13 | Lista y web pública conservan su shape actual: beds/baths/type como hoy, sin exponer nuevos campos, notas internas ni metadatos de overrides. Matching sigue consumiendo feat_* y evidencia; validar REG-08 y legado sin introducir nuevos criterios. |
| D14 | Editor: sección `Physical details` entre Details y Price. Mover allí Type/Bedrooms/Bathrooms conservando sus IDs para focus/prepub; añadir grupos `Size and rooms`, `Building`, `Features`. Calefacción/comodidades usan modos de borrador `Unknown`, `None`, `Select values`: Select values vacío muestra `Choose at least one value, or choose None or Unknown` y bloquea Save; solo None genera []. Los modos de borrador no se envían a la API. Manual sin valor válido también bloquea Save, no se convierte en Unknown. Reutilizar field/ctl/grid2/actionbar; sin wizard ni Save adicional. Mantener Specification, sin backfill especulativo. |

## Grill-me: preguntas resueltas por el diseño

- **Automático contra manual:** D4–D8; editar description/specs o Recalculate all no puede sobrescribir la decisión. Reset explícito restaura extracción del texto actual.
- **Unknown contra No:** null/clave ausente/lista vacía tienen funciones distintas; patio/terraza y parking cero se prueban de forma separada. Un campo no marcado no confirma ausencia.
- **Unidades y otros planes:** D1/D2; una superficie interior, read-only m² y contrato de PUB-06 reutilizado, sin exigir implementar dependencias para redactar documentos.
- **Plantas:** convención ground=0, total contando ground; validación cruzada solo cuando ambos datos están presentes. No inferir acceso o ascensor a partir del número de planta.
- **Negocio/venta/alquiler:** campos opcionales conservados; pets/furnished pueden ocultarse fuera de alquiler sin borrar sus valores. No inferir que en venta se aceptan mascotas.
- **Permisos/proveniencia:** D9/D12; datos estructurados declarados por el equipo, sin alterar controles ni atribuir confirmación manual a una fuente automática.
- **Concurrencia e historial:** D6/D11; revisión optimistic-lock existente; error conserva el borrador, eventos reales y ninguna disponibilidad confirmada por cambiar físico.

No quedan decisiones funcionales necesarias para redactar el plan. Lo propuesto requiere revisión del diseño/alcance antes de una construcción futura; la lista de datos no acredita cumplimiento legal, accesibilidad del inmueble o seguridad del edificio.

## Aceptación

| ID | Resultado comprobable |
| --- | --- |
| A1 | Guardar/recargar/borrar cada campo; 0, no, desconocido y [] conservan su significado; PUT omitido conserva. |
| A2 | Superficie única y m² calculado reproducibles, sin deriva por guardar repetidamente ni cambiar otros campos. |
| A3 | Manuales sobreviven a cambios de texto, guardados y Recalculate all; reset vuelve al texto actual, no al dato viejo. |
| A4 | Matching REG-08 y legado reciben valores/evidencia coherentes para pets, parking exacto y exterior; aseos no son baños, no nuevos criterios automáticos. |
| A5 | Validación estricta y cruzada; fuente queue no puede crear overrides manuales; errores conservan estado recuperable. |
| A6 | Migración preserva datos/eventos/FKs; auditoría JSON fiel, no-op/409/rollback atómicos y confirmed_at intacto en edición física. |
| A7 | Flujo con teclado/foco/zoom200% a1280/390, errores, Unknown/From text, Discard y datos ocultos sin pérdida. |
| A8 | Public API e importaciones conservan contrato y privacidad; planificación local crea solo documentos y cero reservas. |

[Plan de construcción](../plans/2026-11-08-pub-05-physical-fields.md) · [ledger](../plans/2026-11-08-pub-05-physical-fields-ledger.md).
