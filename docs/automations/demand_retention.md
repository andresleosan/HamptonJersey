# demand_retention · poda de matrices privadas de demanda

- **Id:** `demand_retention`
- **Estado:** apagada — `DEMAND_INTERNAL_READY` no está en `jobs/wrangler.toml`, así que el reloj sale sin hacer nada.
- **Tarea dueña:** PUB-19
- **Propósito:** borrar las matrices privadas de demanda vencidas, con su propio registro, sin tocar la retención general.
- **Disparador:** el reloj (`clock`), una vez por día de Jersey, con reserva de 5 minutos y hasta 3 intentos.
- **Entradas y clase de datos:** matrices internas de demanda por celda (agregados; clase exacta desconocida).
- **Salidas y efectos:** borra filas vencidas y deja `app_settings.demand_retention_run` con el número borrado; nunca publica nada.
- **Guardas humanas y modo:** no aplica (sin IA).
- **Interruptor:** `DEMAND_INTERNAL_READY` = '1' en el Worker del reloj; ausente en el repositorio.
- **Coste y límite:** una pasada al día; coste en dinero `null`.
- **Código:** `server/demand-retention.js`, `server/public-demand.js`
- **Pruebas que la cubren:** `tests/server/pub19-retention-isolation.test.mjs`, `tests/server/pub19-demand-d1.test.mjs`
- **Criterio de hecho:** con el interruptor encendido, una sola poda por día, independiente de `retention_daily` y sin afectar a su resultado; activarla es decisión de PUB-19.
