# Hampton App · Datos de Jersey en las fichas

Fecha: 2026-10-25 · Estado: decisiones de Claude (Luis: «si sigamos», sobre la propuesta de datos de Jersey; antes delegó las decisiones) · Base: `main` en producción (`2bc363a`)
Parte de F4 sin Meta (arquitectura §9 F4: «Alta de ficha con campos de Jersey… y `To confirm`») y de P-13 («sin ellos el matching propone casas que no valen»). Donde este documento no dice nada, mandan los specs de F1-A y F0.

## 1. Intención

En Jersey no todo el mundo puede comprar o alquilar cualquier casa: depende del estatus de residencia de la persona (Control of Housing and Work Law) y de la categoría de la vivienda. Hoy la app guarda el estatus del aplicante, pero la ficha no dice si la casa es *Qualified* o *Registered*, así que el matching propone casas que el aplicante no puede ocupar, y el equipo pierde visitas. Además la tenencia (freehold, flying freehold, share transfer) es texto libre, y nada avisa de lo que falta en una ficha antes de publicarla.

**Éxito (verificable en pruebas):**
- Cada ficha tiene tenencia, categoría (Qualified / Registered) y restricción (ninguna, solo primeros compradores, solo mayores de 55) como valores fijos, editables en el panel y visibles en la web.
- El matching aplica las reglas de gov.je de la tabla §3: excluye lo que el estatus del aplicante no permite y marca como «por confirmar» lo que depende de su pareja o de datos que no tenemos.
- El editor muestra **Before you publish**: la lista de lo que falta en la ficha.

**No-objetivos:** comprobar el estatus de una persona (lo hace la ley y el abogado; aquí solo se filtra con lo que el aplicante declara); la vivienda social (Hampton no la comercializa); avisar a los aplicantes de los cambios.

**Anti-objetivos:**
- Excluir una casa por un dato que no tenemos: lo desconocido nunca excluye (regla de F1-A).
- Afirmar en la web algo legal que no es seguro: los textos públicos describen la categoría, no aconsejan.

## 2. Decisiones (todas de Claude; revisables)

| # | Decisión | Por qué |
|---|---|---|
| J1 | **Migración `0015_jersey_fields.sql`**: `listings` gana `tenure_type` (`freehold`, `flying_freehold`, `share_transfer`, `leasehold`), `housing_category` (`qualified`, `registered`) y `restriction` (`first_time_buyer`, `over_55`), todos con CHECK y NULL = no se sabe / ninguna (para `restriction`, NULL = ninguna). `tenure_type` se rellena desde el texto actual (`freehold`, `flying freehold`, `share transfer`; «freehold / share transfer» y lo demás quedan NULL) | Valores fijos que el matching puede leer; el texto viejo se queda como estaba en la columna `tenure` |
| J2 | **Editor**: tres selectores (Tenure, Housing category, Restriction) en lugar del campo de texto de tenencia. Si `tenure_type` está vacío y la ficha tiene texto viejo, se ve debajo como «Was: …» hasta que se elija un valor | Nada se pierde y el equipo lo corrige al editar |
| J3 | **Web pública**: en los datos de la ficha, «Tenure: Flying freehold», «Housing: Qualified» o «Housing: Registered (open to all residential statuses)», y una etiqueta «First-time buyers only» u «Over 55s only» si aplica. Sin `tenure_type`, se muestra el texto viejo si lo hay | Los compradores de Jersey lo buscan antes de pedir visita |
| J4 | **Matching**: una comprobación nueva `housing` en `server/matching.js` con la tabla §3. «fails» es filtro duro (la casa no se propone); «unknown» se muestra con su motivo. No suma ni resta puntos | Las puntuaciones actuales no cambian; solo se filtra lo imposible |
| J5 | Estatus del aplicante vacío o `not_sure`: si la ficha es Registered y sin restricción, «meets» («Registered: open to all») al alquilar o en un share transfer, y ninguna comprobación en una compra por el Royal Court (Standard no puede comprar); si es Qualified o tiene restricción, «unknown» con su motivo (la regla de primeros compradores por `buyer_position` sigue aplicando); si la ficha no tiene categoría ni restricción, no se añade la comprobación | Lo desconocido nunca excluye, y un «unknown» en cada coincidencia sería ruido en Review |
| J6 | **Before you publish** (solo panel, no bloquea): falta precio; falta parroquia; faltan dormitorios (residencial); falta tenencia (venta); falta categoría de vivienda (residencial); menos de 5 fotos públicas; sin foto de portada; sin resumen. Cada línea enlaza o lleva al campo | El «To confirm» de F4; el equipo decide si publica |
| J7 | Tras desplegar, **Recalculate all** en Review una vez, para aplicar la regla nueva a las coincidencias guardadas | El matching guarda resultados |
| J8 | Textos en inglés (D19). La regla cita su fuente en un comentario (gov.je, CHW housing guidance, leída el 25-oct-2026) y la tabla queda en este spec | Si cambia la ley, se cambia en un solo sitio |

## 3. Reglas (gov.je, «Control of Housing and Work (CHW) Law: housing guidance» y «Residential and employment statuses», leídas el 25-oct-2026)

Estatus: PE Permanent Entitled, ENT Entitled, LIC Licensed, LLO Licensed for Lease Only, EFW Entitled for Work Only, STN Standard (antes «Registered»).

**Alquilar** (aplicante `rent`, ficha en alquiler):

| Categoría | PE, ENT, LIC | LLO | EFW, STN |
|---|---|---|---|
| Registered | meets | meets | meets |
| Qualified | meets | meets («lease under 9 years») | **fails** («Qualified: needs PE, ENT, LIC or LLO») |
| Sin categoría | meets | meets | unknown |

**Comprar** (aplicante `buy`, ficha en venta). «Royal Court» = `freehold`, `flying_freehold`, `leasehold` o tenencia desconocida; *share transfer* no pasa por el Royal Court y cualquiera puede comprarlo, pero ocupar un piso Qualified sigue limitado:

| Caso | PE, ENT | LIC | LLO | EFW | STN |
|---|---|---|---|---|---|
| Royal Court (tenencia conocida) | meets | meets | unknown («only jointly with a PE, ENT or LIC partner») | unknown (igual) | **fails** («Standard status cannot buy») |
| Tenencia desconocida | meets | meets | unknown | unknown | unknown |
| Share transfer · Registered | meets | meets | meets | meets | meets |
| Share transfer · Qualified | meets | meets | meets | unknown («occupy only with an eligible partner») | **fails** |
| Share transfer · sin categoría | meets | meets | meets | unknown | unknown |

**Restricciones** (se combinan con lo anterior; gana el peor resultado):
- `first_time_buyer`: LIC, LLO, EFW, STN → **fails** (la compra asistida exige Entitled); `buyer_position` conocido y distinto de `first_time` → **fails**; PE o ENT con `first_time` → meets; lo demás → unknown.
- `over_55`: siempre unknown («Over 55s only: check age»), porque no guardamos la edad.

## 4. Lo que decide quien construye

- Cómo se escriben los textos de evidencia exactos (cortos, en inglés, sin consejo legal).
- El orden y el diseño de los selectores y de **Before you publish**, siguiendo `DESIGN.md` y el editor actual.
- Dónde van las etiquetas en la ficha pública.

## 5. Despliegue

Migración `0015` en remoto antes del push; tras el push, **Recalculate all** en Review. Hampton revisa la categoría de sus fichas publicadas (hoy 3).
