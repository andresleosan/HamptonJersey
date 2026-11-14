# <id> · <nombre corto>

Plantilla de AUT-09. Cada campo es una línea `- **Campo:** valor`; ninguno se omite. Lo que no se sabe se escribe `desconocido` (y el coste o el tope, `null`), nunca se rellena. `tests/server/automation-cards.test.mjs` comprueba los campos, el estado, la tarea dueña y que cada ruta entre comillas invertidas exista.

- **Id:** `<id>` (igual que el nombre del archivo)
- **Estado:** activa | apagada | prevista, seguido de una frase que diga por qué
- **Tarea dueña:** código de `docs/roadmap/tasks/` (p. ej. AUT-07); otras tareas implicadas detrás
- **Propósito:** qué consigue, en una frase
- **Disparador:** reloj, petición, evento o persona que la pone en marcha
- **Entradas y clase de datos:** qué lee y su clase (C0 a C3) o `desconocido`
- **Salidas y efectos:** qué escribe, envía o borra; qué nunca hace
- **Guardas humanas y modo:** qué decide siempre una persona; modo Draft/Approve/Auto o «no aplica»
- **Interruptor:** variable o ajuste que la enciende y su valor en el repositorio; «ninguno» si no lo tiene
- **Coste y límite:** tope por pasada o por día; coste en dinero `null` si se desconoce
- **Código:** rutas del repositorio que la implementan, o «ninguno» si es prevista
- **Pruebas que la cubren:** rutas de archivos de prueba existentes; «ninguna» solo si es prevista
- **Criterio de hecho:** qué tiene que verse, comprobado, para darla por hecha
