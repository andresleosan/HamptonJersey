# Analizar la próxima tarea para recomendar modelo y esfuerzo

Haz este análisis al cerrar `/avanzar`, después de construir, comprobar con las pruebas y Playwright que correspondan y revisar. Incluye la recomendación en ESTADO antes del commit revisado y preséntala al usuario al final, junto al resultado de publicación. Se usa igual en la VPS y a través de Hermes. No cambia el modelo de la sesión en curso.

1. Elige una tarea viable según ESTADO, checklist, la reconciliación vigente de la roadmap, relevo y dependencias. Lee lo que falta y, si existen, su spec y plan. Mira las partes del código implicadas: no deduzcas la dificultad solo del título o del código de tarea. Distingue construcción pendiente de activación externa pendiente; no recomiendes reconstruir lo que ya existe. Si hay una dependencia de Luis, indícala y ofrece una tarea de desarrollo viable cuando corresponda.
2. Clasifica el trabajo: mecánico/documental, cambio acotado con patrón, implementación de varias partes, o decisiones difíciles de arquitectura y seguridad. Valora por separado incertidumbre, concurrencia, dinero, permisos, datos personales, migraciones, reversibilidad y cobertura de pruebas.
3. Comprueba los modelos disponibles en la sesión o en el catálogo local de Codex, por ejemplo los campos `slug` y `supported_reasoning_levels` de `models_cache.json` bajo `CODEX_HOME` o `~/.codex`. No abras credenciales. Comprueba que el esfuerzo elegido existe para ese modelo. Una caché es orientativa; ante un error de disponibilidad, explícalo y propone una alternativa disponible sin reintentar con modelos inventados.
4. Elige la opción menos costosa en tiempo y recursos que tenga capacidad suficiente para resolver esa tarea con confianza. No afirmes precios ni ahorros numéricos sin datos actuales. Estas son orientaciones de los modelos disponibles al preparar este flujo; vuelve a contrastarlas con el catálogo de esa sesión:

| Tipo de próxima tarea | Modelo orientativo |
| --- | --- |
| Textos, checklist, documentación o cambios mecánicos con comprobación clara | `gpt-6-luna` |
| Función o arreglo acotado que sigue un patrón probado | `gpt-6.1-sol` |
| Implementación exigente en varias partes, depuración compleja o migración con pruebas | `gpt-6.1-terra` |
| Arquitectura, seguridad delicada, concurrencia difícil o muchas decisiones abiertas | `gpt-6-astra` |

5. Decide el esfuerzo por la profundidad de razonamiento necesaria, sin vincularlo automáticamente al modelo:

| Esfuerzo | Cuándo conviene |
| --- | --- |
| `low` | Trabajo mecánico, requisitos cerrados y comprobaciones claras. |
| `medium` | Cambio acotado, plan claro y pruebas suficientes. |
| `high` | Varias partes, decisiones de diseño o lógica y cobertura incompleta. |
| `xhigh` | Concurrencia, seguridad, migraciones delicadas o fallos difíciles de reproducir. |
| `max` | Dificultad demostrada que no se resolvió con menos, o riesgo irreversible con mucha incertidumbre. |
| `ultra` | Solo si el modelo lo admite y hay una necesidad excepcional explicada; nunca por defecto. |

Sube primero el esfuerzo si falta profundidad de razonamiento; sube el modelo cuando falta capacidad para el tipo de trabajo. Un modelo potente puede llevar `low` en un paso mecánico dentro de un área delicada. Tampoco rebajes un problema de seguridad a un modelo pequeño solo porque afecta a pocos archivos.

Termina con este formato, sin anunciar otra recomendación provisional al empezar:

```text
Próxima tarea: /avanzar <código> · modelo <modelo> · esfuerzo <nivel>
Por qué: <una frase que conecte alcance, riesgo y pruebas con las dos elecciones>.
```

Guarda la misma pareja en ESTADO y en el relevo con los formatos de `SKILL.md`. Si Luis fijó una preferencia para la próxima tarea, respétala y explica el esfuerzo recomendado dentro de esa preferencia. Para usarla directamente en Codex: `$avanzar <código>`. Para un arranque nuevo, las opciones reales son `codex -m <modelo> -c 'model_reasoning_effort="<nivel>"'`; no uses el `/effort` de Claude.
