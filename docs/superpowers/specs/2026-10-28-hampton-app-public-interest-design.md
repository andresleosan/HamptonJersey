# Hampton App · Interesados en la web (VIS-03)

Fecha: 2026-10-28 · Estado: aprobado por Luis en el chat («si», 28-oct) · Base: `main` en producción (`2f90b17`)
Parte de F3 en la arquitectura (`docs/roadmap/2026-10-23-arquitectura-hampton-app.md` §5.9: «La web lo muestra solo si es 2 o más y es real»). Donde este documento no dice nada, manda el spec de F3-A.

## 1. Intención

Luis pidió en su texto «Contar interesados al pedir visita, poder quitarlos y mostrarlo en la web». El panel ya cuenta a los interesados de cada casa (F3-A, C10), pero la web no lo enseña. Ver que otras personas también la quieren ayuda a que un comprador o inquilino se decida, y las ventas son la prioridad («Ventas primero»).

**Éxito (verificable):**
- Una casa publicada con 2 o más interesados muestra en su ficha de la web «N people interested» con su nota, justo encima de «Book a viewing». Con 0 o 1 no se muestra nada.
- El número es el mismo que «Active interest» del panel para esa casa.
- `GET /api/listings` lleva `interest: null` por debajo de 2 y ningún dato de ninguna persona.
- Una casa vendida (Sold) no muestra la línea aunque tenga interesados.
- La consulta lee por el índice `(listing_id, date)` de `viewing_requests`, nunca recorre la tabla entera.

**No-objetivos:** el botón del equipo para quitar a alguien del contador con motivo (VIS-02); el aviso por casa «2 viewings booked this week» que caduca a los 14 días (VIS-06); la línea en las tarjetas de la portada; actualizar el número en pantalla justo después de reservar; contar visitas a la página web.

**Anti-objetivos:**
- Un número inflado o inventado: «Inventar urgencia es una práctica engañosa, así que el contador nunca se infla» (§5.9).
- Cualquier dato de una persona en la respuesta pública, o que se pueda saber que hay exactamente una.
- Una petición nueva o más lenta para pintar la ficha.

## 2. Decisiones

| # | Decisión | Quién y dónde |
|---|---|---|
| P1 | **Dónde y qué**: en el resumen de la ficha (`.summary`), justo encima de los botones, «**N people interested**» y debajo la nota «Upcoming viewings, and those of the last 30 days that went well» | Luis eligió «Junto a Book a viewing» (28-oct). «that went well» lo añadió Claude para que la nota sea exacta, y Luis lo aprobó con la descripción («si») |
| P2 | **Solo en la ficha**; la portada no cambia | Luis, «Solo en la ficha» (28-oct) |
| P3 | **Desde 2** y con la cifra real | Texto de Luis y §5.9; confirmado en la descripción aprobada |
| P4 | **Cómo se cuenta**: la regla C10 del panel, en un solo sitio para el panel y la web. Cuenta las visitas `requested` o `confirmed` de hoy en adelante y las `completed` de los últimos 30 días con resultado `proceed` o `more_info`. Cada persona cuenta una vez: por email o, si no hay email, por teléfono. Se calcula al leer, así que caduca solo. Cuentan también las visitas que el equipo reserva por teléfono | Claude, aprobado con la descripción |
| P5 | **Sold** no la muestra (ya no se puede reservar). **Under offer** sí, porque se siguen aceptando visitas | Claude, aprobado con la descripción |
| P6 | **La API no envía 0 ni 1**: `interest` es `null` por debajo de 2, para que nadie sepa que hay exactamente una persona | Claude, aprobado con la descripción |
| P7 | **Sin endpoint ni migración nuevos**: el número viaja en `GET /api/listings` (caché de 60 s), así que un interesado nuevo sale en menos de un minuto | Claude, aprobado con la descripción |
| P8 | **No va** en los metadatos para Google y WhatsApp ni en la barra fija del móvil | Claude |
| P9 | **Diseño** según `DESIGN.md`: Montserrat 14px 600 en ink y la nota con `.hint` (12px stone, 4.72:1 sobre paper). Lleva un punto de 8px dibujado con CSS en ink: ni emoji ni bronce decorativo (*The One Accent Rule*) y el texto dice lo que es (*Text-Not-Color*). Sin fuentes, peticiones ni atributos `style=` nuevos | Claude |

## 3. Lo que decide quien construye

- Los nombres de las funciones y dónde se declara la regla compartida, siempre que el panel y la web usen la misma.
- El marcado exacto de la línea, siempre que sea texto que lea un lector de pantalla y no una región `aria-live`, porque el número no cambia mientras la página está abierta.
