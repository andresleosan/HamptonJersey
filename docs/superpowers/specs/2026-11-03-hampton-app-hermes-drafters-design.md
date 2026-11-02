# Hampton App · Quién usa los borradores de Hermes (AUT-15)

Fecha: 2026-11-03 · Estado: aprobado por Luis en el chat («sí a todo», 3-nov, a las 4 preguntas de abajo) · Base: `main` en producción (`bc9fb8a`)
Arquitectura §6.6 (Hermes). Punto nuevo AUT-15 del checklist; cambia lo que dicen AUT-13, AUT-14, PUB-13, PRE-31 y PRE-32. Diseño y dos revisiones (seguridad y viabilidad) del 2-nov-2026, hechos en el VPS; el plan del avisador también vive solo allí, porque lleva datos del VPS.

## 1. Intención

Hoy, en cuanto algo llama una vez a la puerta de Hermes con la llave, la app guarda la hora (`server/routes/hermes.js:173`) y el bloque «Draft with Hermes» aparece a todo el equipo en cada ficha publicada (`admin/src/HermesDraft.jsx:20`). Cualquiera del panel puede pedir, usar o descartar borradores (`POST /api/admin/jobs` está abierto a todo administrador). Eso choca con dos cosas que Luis decidió el 2-nov-2026:

- En la fase 1a no hay IA. El avisador del canal del equipo llamará a la puerta cada minuto (avisos y resumen), pero nadie hará borradores: el equipo vería un botón que no funciona.
- En la fase 1b los borradores gastan el plan personal de ChatGPT de Luis, y sus condiciones no dejan poner la cuenta a disposición de otras personas.

**Éxito (verificable):**
- Sin la fila de la lista, con la lista vacía o con un valor que no sea una lista, nadie ve el bloque, aunque la puerta ya se haya usado: `GET /api/admin/jobs` responde `{ job: null, hermes_at: null }`.
- Pedir, usar o descartar un borrador responde 403 a quien no está en la lista. Lo hace antes de leer la petición y sin crear ni cambiar ningún trabajo, así que tampoco dice si la ficha existe.
- Quien está en la lista ve el bloque y lo usa como hoy.
- Pausar los envíos, y reanudarlos en el panel, siguen igual para todo el equipo.
- La lista no está en el repo, que es público. Es la fila `hermes_drafters` de `app_settings`, con una lista JSON de emails, y se pone con un comando SQL en remoto. Nadie la cambia desde el panel.
- La tarjeta de Hermes de Automations dice «No jobs yet.», sin pedir al equipo que pida borradores.

**No-objetivos:**
- Una pantalla para editar la lista: decisión 1 de Luis, solo por comando.
- Roles generales. La lista solo dice quién puede gastar el plan personal de ChatGPT de Luis. No sirve para ningún otro permiso, y el rol `owner` que planea P-12 nunca la incluye.
- Separar en la puerta las llamadas del avisador de las de Hermes, con dos llaves o una etiqueta del intermediario. Hace falta antes de la fase 1b y va en su propia tarea.
- La operación de la puerta con la que Hermes pide un trabajo (`POST /api/hermes/jobs`): no cambia. En la 1b solo las dos cuentas de Luis dan órdenes al Hermes de Hampton (lista de usuarios de Telegram, en el VPS).
- Añadir a Luis a la lista: decisión 2, al empezar la fase 1b, no ahora.

## 2. Decisiones de Luis (3-nov-2026, «sí a todo»)

1. La lista es una fila de la base de datos que se pone con un comando. No es una marca en Settings → Users (necesitaría migración y cualquier administrador podría ponérsela) ni un secreto de Cloudflare (cada cambio obligaría a volver a publicar).
2. Luis se añade al empezar la fase 1b. Hasta entonces nadie ve el bloque, tampoco él.
3. En Automations solo cambia el texto vacío de la tarjeta de Hermes, que pasa a «No jobs yet.». La tarjeta sigue a la vista de todos, con sus números.
4. En el mismo commit, los documentos se ponen al día con lo decidido el 2-nov-2026:
   - el canal de solo lectura del equipo, el avisador de la fase 1a y que solo Luis da órdenes, desde sus dos cuentas;
   - AUT-13, AUT-14, PUB-13, PRE-31 y PRE-32, y AUT-15 nuevo;
   - como pendientes, lo nuevo del 2-nov: el asistente de Luis, captar propietarios, el plazo de conservación tras el fin de un contrato y el paquete para el abogado.

## 3. Diseño

- `server/routes/hermes.js`:
  - `canUseHermesDrafts(env, email)` lee la fila `hermes_drafters` y la interpreta con `JSON.parse` dentro de un try. Solo vale una lista, y cada email se compara en minúsculas. Cualquier otra cosa significa nadie: sin fila, JSON roto, un objeto, un texto o una lista vacía. Su comentario dice qué significa (gastar el plan personal de ChatGPT de Luis) y que no se reutiliza para otros permisos.
  - `latestJob` responde `{ job: null, hermes_at: null }` con 200 a quien no puede usarla, así que el bloque se oculta sin error.
  - `askJob`, `use` y `discard` llevan una comprobación previa que responde `403 "Hermes drafts aren't available to your account."` antes de leer la petición o tocar `jobs`.
  - La puerta (`/api/hermes/*`) y `resume` no cambian.
- `admin/src/Automations.jsx:59`: «No jobs yet.»
- El comando para Luis (fase 1b, no ahora), en ESTADO, con su email de Google como marcador `<TU_EMAIL_DE_GOOGLE>`. Guarda el email con `lower(trim(...))` y sustituye la lista entera.
- **Vaciar la lista** (no forma parte de ningún paso; solo si hace falta quitar a todos), desde `/root/HamptonJersey`:

```bash
npx wrangler d1 execute hampton --remote --command "DELETE FROM app_settings WHERE key = 'hermes_drafters'"
```

## 4. Seguridad y privacidad

- Ningún email real en el repo: las pruebas usan `admin@example.test`.
- Falla cerrada. Un valor estropeado deja a todos fuera, nunca a todos dentro.
- El 403 llega antes que el 404 o el 409, para que nadie de fuera de la lista pueda averiguar qué fichas existen.
- Quien tiene una llave de D1 con permiso de escritura (hoy, el taller de Optimyze) puede escribir la fila: riesgo aceptado por Luis. Lo mismo vale hoy para `admins` y `jobs`.
- La tarjeta de Hermes de Automations sigue a la vista de todo el equipo, por la decisión 3: la hora de la última petición, qué fichas tienen un borrador esperando y los últimos trabajos, nunca el texto del borrador. Quien no está en la lista ve esos enlaces, pero en la ficha no le aparece el bloque.
- Si alguien sale de la lista con el editor abierto, su siguiente clic recibe el 403 y el bloque desaparece al recargarse, sin mostrar el mensaje. Es aceptable, porque falla cerrado.
- Precondición antes de poner `HERMES_KEY` en Production: AUT-15 tiene que estar en producción, con el commit en `origin/main` y el despliegue de Pages terminado.
