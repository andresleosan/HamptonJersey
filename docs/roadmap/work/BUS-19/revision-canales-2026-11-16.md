# BUS-19 · Revisión por canal · 16-nov-2026

Hecha por Claude por encargo de Luis (actor `claude-por-encargo-de-luis`). Entrada: directorio aceptado `bus23-20392de7…` (237 canales) y relevo BUS-23 (`property-directory-inventory-handoff.csv`).

**Evidencia nueva** (`condiciones-robots-2026-11-16.json`, referencia `BUS-19/condiciones-robots-2026-11-16/<host>`): para los 133 hosts por revisar se leyó robots.txt (comprobando el canal para `HamptonEstatesBot` y `*`), la página del canal y hasta 3 páginas de términos enlazadas. Una petición por host a la vez, agente identificado.

## Reglas aplicadas

| Decisión | Regla | Canales |
|---|---|---:|
| allowed · http | robots.txt permite el canal y los términos no prohíben la lectura automatizada (OnTheMarket: §3.3 la permite a un bot identificado que cumpla robots.txt) | 132 |
| manual_only | términos que prohíben bots (Rightmove, Zoopla, SpareRoom, Knight Frank, Falcon, Connections, JEP/All Island Media, Livingroom, app Raven) o restricción específica de BUS-23 (Broadlands Commercial, Dandara, JDC/Horizon/Westward, Quérée, Les Vaux), o web que bloquea bots (robots.txt o HTTP 401/403) | 42 |
| denied | Homely (plan maestro); 34 directorios/referencias sin anuncios propios; web propia de Hampton | 38 |
| pending (clase fijada) | Places.je, Properties.je: conectores posteriores | 6 |
| pending (sin cambio) | sin URL o redes sociales (16), permiso escrito necesario (Benest, ND Estates), web caída (AC Jersey) | 19 |

Hosts y rutas permitidos = host y ruta del canal (sin parámetros); redirección permitida = variante con/sin `www`. Intervalo mínimo 300 s. Vigencia hasta 16-may-2027. Retención: `retencion-mercado-v1.md`.

Límites: la lectura de términos fue automática por palabras clave sobre las páginas enlazadas desde el canal; una web sin términos enlazados se trató como «términos sin prohibición». Permitido no significa leído: cada canal necesita su lector (BUS-09).

Aplicación: `decisiones-2026-11-16.sql` (UPDATE versión 1→2 + fila de historial por canal, idempotente), probada sobre el esquema 0043 en memoria. Detalle por canal: `decisiones-2026-11-16.json`.

**Actualización**: los 38 canales denegados se eliminaron de producción y de estos archivos (`eliminar-denegados-2026-11-16.sql`). Si se vuelve a aceptar el directorio de 237 canales, reaparecerían como pendientes: filtrarlos antes.
