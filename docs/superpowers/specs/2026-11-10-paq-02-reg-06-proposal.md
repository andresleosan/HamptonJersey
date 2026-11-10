# PAQ-02 / REG-06: respuestas explícitas de zona

Estado: diseño aprobado por Luis en este hilo el 10-nov-2026. Base original examinada `47dab2c`; al retomar se integró localmente GitHub `5779655` preservando REG-07. Recupera únicamente el alcance REG-06 del [diseño anterior](2026-11-08-l1-registration-criteria-design.md) y su [plan](../plans/2026-11-08-l1-registration-criteria.md). No implica aprobar SAP-10 ni REG-12, publicar o aplicar migraciones.

## Comportamiento propuesto

En el registro público y el panel, la persona puede elegir zonas concretas, cualquier zona de Jersey o indicar que todavía no sabe. Puede excluir zonas en cualquiera de los casos. Si acepta varias zonas concretas, puede señalar una preferida opcional: las demás siguen siendo aceptables.

Una respuesta «no sé» sigue pendiente; no significa «cualquier zona». Los registros antiguos se conservan sin inventar una respuesta. Las zonas excluidas se mantienen al cambiar de opción. Si un cambio borra zonas o una preferencia ya elegidas, se pide confirmación y cancelar conserva lo anterior.

Regla incluida en la propuesta aprobada: en las altas nuevas de la web y el panel se pide una de las tres respuestas sin preseleccionar ninguna; «no sé» permite continuar. Editar otro campo de un registro histórico no obliga a responder ni modifica su ausencia, y los clientes API antiguos conservan la compatibilidad.

Si se acepta cualquier zona salvo una exclusión y se desconoce la parroquia de una propiedad, esa exclusión permanece pendiente de comprobación; no se declara cumplida por omitir el criterio. La misma prudencia se aplica a una respuesta «no sé» o a un dato histórico vacío cuando la zona es imprescindible.

La zona preferida solo desempata opciones con el mismo grupo de requisitos y puntuación; no prevalece sobre una opción mejor ni anula la revisión o las decisiones humanas. El emparejamiento comercial sigue fuera de este alcance.

## Límites y comprobaciones

- Preservar valores históricos, presupuestos, mascotas, aparcamiento, prioridades y búsquedas separadas de compra/alquiler; validar el contrato en el servidor y conservar la gestión actual de duplicados.
- Integrar el orden y la paginación existentes de BUS-14 sin perder ni duplicar resultados. Comprobar escrituras simultáneas y consultas tanto del panel como del recálculo.
- La revisión independiente encontró que el comparador propuesto en el plan anterior no tiene consumidores: el orden real está en `server/routes/matches.js` y sus cursores en `server/match-pages.js`. El plan de construcción debe actualizar conjuntamente orden, predicado, cursor e índice que corresponda, además de Review, y comprobar páginas 25/25/10, empates y cambios de versión. Modificar solo el comparador o solo el `ORDER BY` no cumple el criterio.
- La migración 0037 registra cambios en los datos usados por matching mediante `applicants_match_inputs`. El contrato nuevo debe invalidar atómicamente las revisiones y la versión de ranking al cambiar solo la respuesta o preferencia, incluso si la puntuación no cambia; conservar también la invalidación existente cuando una propiedad cambia de parroquia. Probar cursores y recálculos ante esos cambios.
- En la revisión de un registro duplicado, copiar respuesta, zonas aceptadas y preferencia como un grupo coherente; preservar exclusiones y pedir confirmación antes de retirar valores previos. Cancelar conserva el borrador y un envío repetido nunca sobrescribe automáticamente la búsqueda existente.
- Una migración aditiva local permitiría guardar las nuevas respuestas sin rellenar históricos por inferencia. El número propuesto en el plan anterior ya está ocupado; al construir se elegirá uno libre después de comprobar de nuevo el historial. Aplicar una migración en producción y publicar requieren la aprobación separada del commit exacto.
- REG-08, REG-11 y REG-17 constan en el historial de `main`; la integración posterior de visitas de REG-17 y la comprobación nueva de migraciones en producción siguen pendientes de evidencia. No se reconstruyen por esta propuesta.
- Cubrir validación, legado, exclusiones, prioridades, empates y paginación, además de recorridos de registro y panel en escritorio y móvil. Usar datos locales de prueba.

Alternativa considerada: interpretar los campos históricos vacíos como «cualquier zona». Se descarta porque convertiría un dato no respondido en una decisión del cliente.
