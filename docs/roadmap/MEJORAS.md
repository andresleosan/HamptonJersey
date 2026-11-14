# Mejoras que no bloquean

Endurecimientos y sugerencias de revisión que quedan fuera del alcance de la tarea que los originó. No impiden cerrarla (sección 3 de la [skill](../../.agents/skills/avanzar/SKILL.md)). Lo grave no va aquí: fuga de datos personales, fallo de permisos, pérdida de datos o dinero mal calculado se arreglan dentro de la tarea.

Formato: `- [CÓDIGO] qué mejorar · por qué · fecha`.

- [PUB-09] Purgar filas de retirada, notas privadas y actor al borrar una ficha (hoy quedan inaccesibles pero se conservan) · minimización de datos; revisión independiente 14-nov · 14-nov-2026
- [PUB-09] Despublicar una ficha ya oculta devuelve 409 en vez de éxito silencioso · cambio de conducta para scripts externos · 14-nov-2026
- [PUB-06] Guardar importes en peniques enteros si algún día se suman · hoy REAL con dos decimales validados · 14-nov-2026
- [PUB-08] La prueba general `tests/e2e.cjs` falla al cargar el tour YouTube del home (`#tour3d iframe` no aparece tras «Load YouTube tour»); ocurre igual en 9578528, antes del lote de 14-nov · revisar el fixture o la carga diferida · 14-nov-2026
- [VIS-09] Al mover una visita a un negociador sin reglas queda el registro de márgenes anterior (inbox.js:129) · solo amplía huecos · 14-nov-2026
- [VIS-09] Reprogramar una reserva antigua con listing_id no estándar da 500 en vez de mensaje claro (viewing-policy.js:153) · 14-nov-2026
- [AUT-10] Con AUT10_MODES_READY encendido antes de 0054, la pantalla Automations da 500 (automations.js:41) · aplicar siempre la migración antes · 14-nov-2026
- [OFE-06] La instantánea de pasos depende del orden de group_concat, que SQLite no garantiza · peor caso: «recargar» innecesario · 14-nov-2026
