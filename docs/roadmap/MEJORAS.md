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
- [AGE-14] Un correo ya en estado `sending` no se cancela al suprimir y puede salir a la dirección retirada; solo cuenta como «enviado» · cancelar o esperar antes de suprimir · 14-nov-2026
- [AGE-14] Tras suprimir, canales, notas de comisión y fotos y motivos de revisión quedan congelados; si guardaban datos personales se quedan · la interfaz avisa de editarlos antes · 14-nov-2026
- [PUB-10] `server/proposed-schema/owner-requests-rebuild.sql` fija la definición antigua de advertisers (sin `suppressed_at` de 0057) y fallará; las reconstrucciones futuras de listings/tenancies deben contar con las FK nuevas de 0056/0058 · 14-nov-2026
- [PUB-11] Barrido periódico de restos `pending`/`removing`, inspección del interior del PDF, subida directa a R2 sin 20 MiB en memoria y botones de 44 px en móvil · 14-nov-2026
- [PUB-11] Calibrar los avisos de calidad de foto (resolución, exposición, enfoque) con fotografías representativas de Hampton · hoy son orientativos · 14-nov-2026
- [ADM-16] Si se borra el depósito del contrato, la pantalla oculta la propuesta y el historial de mydeposits aunque siguen en la base (TenancyExit.jsx:176) · mostrarlos siempre · 14-nov-2026
- [ADM-16] Editar el inventario de salida antes del primer paso con mydeposits puede quitar referencias que ya cita una línea de la propuesta · revalidarlas al registrar el paso · 14-nov-2026
- [ADM-16] Cambiar `start_on` después del inventario de salida puede dejar la devolución de llaves antes del inicio · sin pérdida de datos · 14-nov-2026
- [ADM-16] La comprobación de referencias entre contratos lee el JSON de todos los inventarios sin índice · aceptable con el volumen actual · 14-nov-2026
- [ADM-13] El trigger de 0060 no protege la columna `rooms` frente a un UPDATE directo · desde la app no se llega · añadir trigger que compare sin `repair` · 14-nov-2026
- [ADM-13] La comprobación de referencia ya usada en otro contrato va fuera del batch: dos registros simultáneos podrían compartirla · llevar el NOT EXISTS al INSERT · 14-nov-2026
- [ADM-13] Una reparación decidida sobre la inspección de un contrato ya terminado se crea en ese contrato, no en el activo · decisión de diseño · 14-nov-2026
