---
name: avanzar
description: Avanza el checklist de Hampton App sin detenerse - elige por la ruta, construye, verifica, migra lo autorizado, publica y sigue con la siguiente tarea. Úsala con /avanzar, $avanzar o cuando Hermes transmita ese encargo.
---

# Avanzar Hampton App

**Meta de Luis (14-nov-2026): terminar el proyecto lo antes posible.** Cada invocación trabaja en bucle hasta que no quede trabajo viable: cierra tareas, sube el porcentaje y sigue. No pide aprobaciones que ya están dadas ni se detiene a preguntar.

Este archivo y [CONTINUIDAD-AVANZAR.md](../../../docs/roadmap/CONTINUIDAD-AVANZAR.md) (autorizaciones de Luis) son las únicas reglas vigentes. Sustituyen a todas las versiones anteriores de esta skill, al coordinador, a las reservas y a los turnos entre talleres: si un plan o ledger antiguo los menciona, es historia y no se ejecuta.

Invocación: `/avanzar` (sigue la ruta), `/avanzar PUB-09` (esa tarea primero, luego la ruta) o `/avanzar PAQ-18` (las tareas de ese paquete primero).

## 1. Arranque: un minuto, sin preguntas

1. **Copia de avance.** En la VPS es `/root/HamptonJersey/.worktrees/avanzar`, rama `main`, con dependencias instaladas. En otro equipo, el clon en `main`. La carpeta `/root/HamptonJersey` tiene trabajo de diseño de Luis en otra rama: no se toca.
2. `git pull --ff-only origin main`. Si hay commits propios sin publicar, se conservan y se retoman. Nunca `reset --hard`, `clean`, `stash`, rebase ni force-push.
3. `node scripts/avanzar-ruta.mjs` y anuncia en una línea: `Progreso: X de Y · Z %`.
4. Lee [CONTINUIDAD-AVANZAR.md](../../../docs/roadmap/CONTINUIDAD-AVANZAR.md), [COLA-LUIS.md](../../../docs/roadmap/COLA-LUIS.md) (aplica lo que Luis ya respondió) y, si existe, `.claude/relevo-avanzar.md` (privado: trabajo a medias de la sesión anterior, que se resuelve primero).

No leas `ESTADO.md` entero, el checklist HTML ni documentos de `docs/superpowers/` que no sean de la tarea elegida. La fuente de cada tarea es su ficha `docs/roadmap/tasks/<CÓDIGO>.json` y su carpeta `docs/roadmap/work/<CÓDIGO>/`.

## 2. Elegir: por la ruta, cerrando antes de abrir

La salida de `avanzar-ruta.mjs` ya viene ordenada por lo que más desbloquea. Dentro del bloque «Cerrables ahora», toma en este orden:

1. **Cierres por aceptación propia** (marca «espera consumidores»): tareas cuyo trabajo propio está publicado y solo esperan a otras tareas. Se comprueban contra el criterio de hecho y se cierran o se deja escrito lo que de verdad les falta.
2. **Construidas y apagadas** (marca «apagada»): código en `main` que espera migración e interruptor. Se aplica la sección 6 y se verifica el recorrido real.
3. **Lo que más desbloquea**, después el resto.

Trabaja por **lotes de hasta 4 tareas** cuyos recursos de escritura (`resources` con `mode: write` en `docs/roadmap/work-units.json`) no se solapen. Una tarea que necesita a Luis, a Hampton o a un tercero no se espera: se apunta en la cola y se toma la siguiente. No abras una tarea nueva mientras quede otra del lote que pueda cerrarse; los avances parciales repartidos entre muchas tareas no suben el porcentaje.

## 3. Criterio de «hecho» (decisión de Luis, 14-nov-2026)

Una tarea es **hecha** cuando se cumplen las tres:

- Hace lo que promete su título y el alcance de su plan vigente, o de la arquitectura si no tiene plan.
- Está publicada en `main` y, si lleva migración o interruptor, aplicada y encendida.
- Se comprobó su recorrido, con la evidencia anotada en la ficha.

Lo que le corresponde a **otra tarea** (consumidores futuros, productores de otros módulos, canales externos) se traslada al `falta` de esa otra tarea y deja de bloquear esta. Los endurecimientos que una revisión propone fuera del alcance original van a [MEJORAS.md](../../../docs/roadmap/MEJORAS.md) y no bloquean, salvo que sean graves: fuga de datos personales, fallo de permisos, pérdida de datos o dinero mal calculado. Si un criterio exige un servicio real que no está activo, la tarea sigue parcial y el `falta` nombra solo ese criterio. Nada se marca hecho sin comprobarlo.

## 4. Decidir sin detenerse

No se usan herramientas de preguntas ni se espera respuesta. Cada decisión se toma con la primera fuente que la resuelva:

1. Instrucción de Luis en la sesión y [CONTINUIDAD-AVANZAR.md](../../../docs/roadmap/CONTINUIDAD-AVANZAR.md).
2. Plan, spec o ledger de la tarea (`node scripts/plan-packages.mjs --task <CÓDIGO>` muestra su plan en `planReferences`).
3. [Arquitectura](../../../docs/roadmap/2026-10-23-arquitectura-hampton-app.md) y [plan maestro](../../../docs/roadmap/2026-11-10-plan-maestro-vigente.md); `DESIGN.md` para interfaz.
4. La recomendación ya escrita en esos documentos.
5. Si nada lo resuelve: la opción más simple y reversible que cumpla el título de la tarea.

Anota la decisión y su fuente en una línea de la evidencia de la tarea. Lo que **solo Luis puede hacer o decidir** (lista «No autorizado» de CONTINUIDAD, cuentas externas, datos de Hampton, abogado) se añade como una fila a [COLA-LUIS.md](../../../docs/roadmap/COLA-LUIS.md) con qué hace falta y qué desbloquea, y se sigue con otra tarea. Las observaciones de Centinela o de un revisor se tratan igual: grave se arregla ahora, lo demás a MEJORAS.

## 5. Construir

- **Con plan vigente: se ejecuta.** No se repite brainstorming, grill-me ni un spec nuevo, y no se reabre lo que el plan ya decidió. Sin plan y con varias piezas: un plan de una página en `docs/roadmap/work/<CÓDIGO>/`. Arreglo pequeño: directo.
- Lógica nueva (cálculos, permisos, estados, dinero): primero la prueba que falla. Durante la construcción corre solo las pruebas de los archivos tocados, por ejemplo `node --test tests/server/<archivo>.test.mjs`.
- Interfaz: valores reales de `DESIGN.md`. Aplica una skill de diseño, seguridad o rendimiento solo si el cambio la necesita; `ponytail` siempre (el mínimo código que cumple).
- **Subagentes.** Si la herramienta los ofrece, reparte las tareas del lote: un subagente por tarea, cada uno en su propio worktree, con este encargo: código, ficha y plan de la tarea, criterio de hecho, pruebas focales que debe pasar y «devuelve el commit y lo que no pudiste comprobar». Un solo escritor por archivo. Quien orquesta integra los commits en `main` uno a uno y no construye lo que delegó. Sin subagentes, las tareas del lote van en serie.
- **Revisión independiente:** una por lote, y solo si el lote toca dinero, permisos, datos de personas, migraciones, autenticación o la web pública. Un revisor nuevo recibe el diff, no las conclusiones.
- El repositorio es público: nada de secretos, datos personales, `docs/roadmap/Hampton APP.md`, `.claude/relevo-avanzar.md` ni `docs/audits/`.

## 6. Migrar y encender

Autorización permanente y límites en [CONTINUIDAD-AVANZAR.md](../../../docs/roadmap/CONTINUIDAD-AVANZAR.md). Para cada migración pendiente que necesite el lote:

1. `npx wrangler d1 migrations list hampton --remote` y lee el archivo entero. Clasifícala con la regla de CONTINUIDAD. Si no es aditiva, o depende de una pendiente que no lo es: fila en COLA-LUIS y sigue con otra tarea.
2. Ensayo local: las pruebas D1 de la tarea pasan sobre una base nueva con todas las migraciones.
3. Punto de recuperación: `npx wrangler d1 time-travel info hampton` y guarda el marcador en el relevo privado.
4. Aplica **solo los archivos revisados**, en orden, desde un directorio temporal de migraciones que contenga únicamente esos archivos. Nunca toda la cola a ciegas. Un resultado incierto se comprueba con `migrations list` antes de repetir.
5. Enciende el interruptor de la tarea en `wrangler.toml` dentro del commit del lote, si CONTINUIDAD lo permite para ese interruptor.
6. Tras el despliegue, comprueba el recorrido real con lecturas (`npm run test:production:readonly` o peticiones GET). Solo entonces la tarea pasa a hecha.

## 7. Verificar y publicar: una vez por lote

```sh
npm test && npm run build && npm run check:release
```

Si el lote cambia interfaz, el recorrido de cada tarea en el navegador aislado, a 1280 y 390, como indica `AGENTS.md`:

```sh
E2E_PRODUCTION_READONLY=0 E2E_SCRIPT=tests/<archivo>.cjs npm run test:e2e:isolated
```

Distingue fallo del cambio, fallo anterior y comprobación que el entorno no permite; no declares comprobado lo que no corrió. Después:

1. Actualiza la ficha de cada tarea: `estado`, `hecho`, `falta`, `nextStep`, `evidencia`, `actualizado`. Frases cortas.
2. `npm run team:catalog && npm run team:check && npm run check:packages`.
3. Una línea por cierre arriba de `docs/roadmap/ESTADO.md`: fecha, código, qué cambió para el equipo y progreso antes → después.
4. Commit corto en inglés con solo tus archivos, `git pull --ff-only origin main` y `git push origin main`. Solo se publica `main`. Si el remoto cambió en tus archivos, integra y repite las pruebas afectadas.
5. Comprueba que `origin/main` tiene el commit y que `https://hampton-tareas.andres-san1404.workers.dev/v1/board` refleja el cierre. Anuncia `antes → después`.
6. Vuelve al paso 3 del arranque y toma el siguiente lote.

## 8. Cuándo parar

Solo si Luis lo pide, no queda ninguna tarea viable en la ruta, o se alcanza un límite real de la sesión. Un lote terminado, una tarea bloqueada o una prueba fallida no son motivo: se anota y se sigue con lo independiente.

Al parar:

- Sobrescribe `.claude/relevo-avanzar.md` (privado, máximo 40 líneas): último SHA publicado, trabajo local sin publicar y dónde está, marcadores de recuperación, y el siguiente paso exacto.
- Responde a Luis en español simple: progreso antes → después, qué cambió para el equipo y cómo probarlo, las filas nuevas de COLA-LUIS, y la línea para seguir con [modelo y esfuerzo](references/modelo-y-esfuerzo.md): `Próxima sesión: /avanzar · modelo <modelo> · esfuerzo <nivel>`.

## Dentro de Hermes

Hermes conserva los controles de su taller: candado local antes de tocar la copia, sus envoltorios de Git y publicación, y el sí de Luis por Telegram sobre el SHA exacto antes de migrar o subir (`TALLER_PUSH_APROBADO`, `TALLER_SHA_APROBADO`, `TALLER_MIGRACION_APROBADA`). Las decisiones que necesite las escribe como pregunta al final del turno. El resto de esta skill se aplica igual.
