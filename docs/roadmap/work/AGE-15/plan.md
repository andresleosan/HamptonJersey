# AGE-15 · Alta automática de la agencia de cada ficha

24-nov-2026 · Decisión de Luis (opción A): que la app registre sola la agencia de cada casa para que preparar una consulta no exija dar de alta la agencia a mano.

## Por qué

En producción `advertisers` tiene 0 filas y `listing_market_links` 0. Sin un anunciante vinculado a la ficha, AGE-03 no deja crear la consulta y el correo de Hermes (AUT-17, encendido el 24-nov) no tiene destinatario.

## De dónde sale la agencia

Las fotos importadas el 8-oct guardan su proveedor (`media.provider`), la misma regla que ya usa BUS-07 para decir «Co-listed · <agencia>». Lectura del 24-nov: Hunt Estates 162 fichas, Red Properties 43, Slomans 40 (+1 «Slomans»), Prestige 14, Columbia 6, y una cola larga de una ficha (Savills, Knight Frank, Quérée, Thompson, Troys, Pinnacle, Livingroom, Reside, Benest…). Hay proveedores que no son agencias (Hampton Estates, Visit Jersey, Tripadvisor, gobierno, ayuntamientos): se ignoran.

## Piezas

1. **Lista revisada de agencias** en el repositorio: nombre, alias tal como aparecen en `media.provider` (incluido «OnTheMarket / X» → X), web y **correo genérico de contacto** leído en su propia web (info@, lettings@, sales@; nunca el de una persona), con la dirección de la página y la fecha de lectura como evidencia.
2. **Sincronización** (función pura + escritura D1 idempotente): por cada agencia de la lista con fichas, crea el anunciante (`kind` agencia) si no existe, añade a `details.listing_ids` las fichas cuyas fotos la nombran y su contacto genérico si no tiene ninguno. Solo añade: nunca borra fichas ni contactos ni cambia lo que una persona editó; nunca toca anunciantes suprimidos (AGE-14) ni fichas de Hampton.
3. **Cuándo corre**: en la pasada diaria del reloj (hampton-jobs), detrás de `AGE15_AUTO_ADVERTISERS_READY`. No envía mensajes ni recoge datos del público: lo enciende /avanzar (CONTINUIDAD).
4. **Pruebas**: normalización de proveedores; D1 con altas, segunda pasada sin cambios, edición humana respetada, suprimido intacto, proveedor que no es agencia ignorado.

## Hecho cuando

- Tras la pasada en producción, las fichas de las agencias de la lista tienen su anunciante con correo genérico en Advertisers.
- En una coincidencia aprobada de una de esas fichas, «Prepare enquiry» → «Create enquiry» está activo.
- La primera consulta real deja su borrador en el Gmail de Hampton (recorrido de AUT-17), anotado en la ficha.

## Fuera de alcance

Teléfonos y personas de contacto, fichas sin fotos importadas (se vinculan a mano o con BUS-09 cuando Hermes lea el mercado), y fusionar agencias duplicadas que ya existan.
