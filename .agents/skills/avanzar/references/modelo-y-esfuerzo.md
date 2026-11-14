# Modelo y esfuerzo para la próxima sesión

Se recomienda una sola vez, al parar. No cambia la sesión en curso. Mira lo que queda arriba de la ruta (`node scripts/avanzar-ruta.mjs`) y elige la pareja más barata que lo resuelva con confianza. El modelo lo decide qué toca el trabajo; el esfuerzo, cuánto hay que pensar.

| Lo que queda arriba de la ruta | Claude Code | Codex |
| --- | --- | --- |
| Cierres por aceptación propia, fichas, textos, cambios mecánicos | `claude-sonnet-5-5` | `gpt-6-luna` |
| Cambios acotados que siguen un patrón existente | `claude-sonnet-5-5` | `gpt-6.1-sol` |
| Varias piezas, migraciones, reglas de negocio, dinero, permisos, datos de personas | `claude-opus-5-5` | `gpt-6.1-terra` |
| Arquitectura de una fase, seguridad delicada, concurrencia difícil | `claude-fable-5-2` | `gpt-6-astra` |

| Esfuerzo | Cuándo |
| --- | --- |
| `low` | Pasos mecánicos con pruebas que avisan. |
| `medium` | Lote acotado con plan claro y pruebas. |
| `high` | Varias piezas o producción sin pruebas automáticas que lo cubran. |
| `xhigh` | Concurrencia, seguridad, migraciones sobre datos reales. |

Comprueba que el modelo existe en la herramienta antes de recomendarlo. Cuando orquestes un lote con subagentes, el orquestador necesita el modelo alto y cada subagente puede ir un escalón por debajo.

Formato: `Próxima sesión: /avanzar · modelo <modelo> · esfuerzo <nivel>` y una frase con el motivo.
