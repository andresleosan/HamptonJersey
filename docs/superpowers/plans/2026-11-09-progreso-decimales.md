# Progreso del tablero con dos decimales

## Requisito aprobado

Luis pide mostrar dos decimales con coma:52/221 debe verse como23,53%. Se aplica al progreso general, por lista y por paquete, incluyendo el texto accesible de cada barra. Se conserva el conteo de tareas hechas/alcance vigente, exclusiones y efecto de filtros; no se asigna avance ficticio a parciales. Base verificada main/GitHub4bbc92de78b51735832944dd20ad2e6b87ac058e, copia propia con candado. Cambio pequeño de formato ya definido por el usuario; sin decisiones de diseño abiertas.

## Implementación

Reutilizar progress/describe en docs/roadmap/tablero-publico.js. Conservar la proporción numérica antes de presentarla y formatear solo el texto con dos decimales y localees-ES. No nueva dependencia, servicio, datos personales o permisos. La aritmética de barras sigue siendo done/total.

Presentación vigente conservada: paleta clara paper#F4F6F8/surface#fff/ink#22303F/muted#566476/line#D3DAE2/accent#2B6CA3; paleta oscura actual sin cambios. Open Sans15px/1.55, títulos Source Serif4 y códigos IBM Plex Mono. Espacios16/24px, objetivos44px, breakpoint759/760px; porcentaje en los componentes actuales, sin CSS nuevo. Mantener filtros, foco, estados sin datos/error y contraste. El tablero de desarrollo sigue en español conforme a su interfaz existente.

- [x] RED: actualizar prueba de progreso fraccionario y añadir regresiónDOM52/221→23,53%, actualización53→23,98%, filtros, barras/listas/paquetes,0,00% y100,00%.
- [x] GREEN: retirar truncamiento y usar el formateador compartido con dos decimales/coma.
- [x] Verificar pruebas, build/release y empaquetado público. Recorrido local Playwright1280/390 con fixtures, foco, filtros y contraste; MCP bloqueado conocido, usar navegador independiente ya disponible sin modificar controles.
- [x] Revisión independiente, registrar resultados/ESTADO/relevo y commit. Publicar requiere aprobación del SHA exacto; este cambio no hereda el sí de4bbc92d.

## Recomendación de trabajo paralelo

Conservar trabajo propio abierto antes de elegir otro tramo. Propuesta inicial: VPS verifica y cierra REG-17 según criterios existentes (commit5e9c860 ya integrado; no reconstruir), Hermes1 construye PUB-04 según su plan vigente y alcance revisado. Recursos principales distintos: applicants/visitas frente a listings/editor. Directorio/inventario de mercado requiere primero resolver la cadena BUS-19/BUS-21/22/23→BUS-06→BUS-10 antes del matching canónico deBUS-12; no iniciar consumidores ignorando esos contratos.

Una copia y un escritor por equipo, una tarea/entrega activa por equipo. Acordar propietarios de archivos/contratos y numeración de migraciones antes de editar recursos compartidos. Cada equipo entrega código+fixtures+pruebas+hecho/falta; unir fuentes y regenerar ESTADO/checklist/catálogo en la integración. Solo VPS publica al principio: primero integra ambas entregas, fija elSHA, obtiene revisión/sí y publica; Hermes1 continúa construyendo durante esa ventana pero espera para hacerpush. Así se evitan cruces que invalidaron las dos aprobaciones anteriores. Son recomendaciones, no reservas o nuevos permisos de producto/publicación.

## Registro

Skills: brainstorming acota el requisito explícito; writing-plans proporciona este plan breve; TDD fija el cambio de presentación; ponytail reutiliza el formato compartido; verification-before-completion exige resultados antes de declarar listo. Sin rediseño ni infraestructura nueva.


### Resultados de construcción

- RED observado:99.00 frente99.50 y texto23% frente23,53%. La ejecución inicial sin permiso de proceso también dioEPERM al lanzar el planificador; se repitió por el cauce autorizado, sin cambiar controles.
- GREEN:14pruebas public-board; suite completa1069JS+14PythonPASS. Build/release, catálogopaquetes250/23 yteam:public:build dry-runPASS.
- Nuevo recorrido reutilizable tests/progress-decimals.e2e.cjs usa el handler público real y fixtures locales de sololectura. PASS1280/390: formato global/lista/paquete, texto accesible de barras, refresh52→53, filtro/foco, zoomCSS200 sin overflow,503 conservando último dato y recuperación. Capturas /tmp/progress-decimals-captures/progress-{1280,390}.png inspeccionadas. ZoomCSS no se presenta como zoom nativo; sin CSS ni layout nuevos.
- La fórmula conserva proporción exacta; Intl.NumberFormat es-ES presenta dos decimales al renderizar. Barras continúan done/total, filtros/exclusiones intactos y sin ponderación parcial. No migración ni endpoint/escritura nueva.
- Publicación requiere main integrado, revisión y sí para elSHAfinal; solo se despliega el Worker público hampton-tareas con su configuración existente y --keep-vars. No necesita redeplegar catálogo/coordinador por el formato numérico.

### Reparto propuesto para avanzar a la vez

VPS: conciliación/verificación REG-17 antes de reconstruir, sobre commit5e9c860 integrado y0026del ámbito existente. Verificar criterios de persistencia/rangos; la reutilización posterior porVIS-17 es un contrato técnico que debe conservarse, no se afirma implementada por guardar preferencias. Si hay requisito real sin cubrir, ejecutar el tramo propio o registrar dependencia concreta; no cerrar por simple presencia del commit. Sol/medium para esa revisión operativa.

Hermes1: PUB-04, completar identidad/dirección interna según plan vigente y decisiones ya registradas; Sol/high por validación de campos privados, DTO públicos, historial, estabilidad de IDs y migración. Su alcance principal listings-schema/listing-editor es distinto de applicants/viewings/registration deREG-17. Comprobar al iniciar que no haya trabajo propio previo pendiente y acordar archivos compartidos/migraciones con VPS; no adoptar cambios de otro taller.

Ventana de entrega: un único publicadorVPS. Cada equipo entrega una unidad completa con código, fixture, pruebas y revisión. VPS integra las entregas listas antes delSHAfinal y actualiza tablero al publicar; Hermes1 no hacepush durante la aprobación/publicación delVPS. La asignación propuesta no crea reservas remotas ni concede permiso de publicación. La cadena de inventario conserva BUS-19/BUS-21/22/23→BUS-06→BUS-10; no saltar a integración canónicaBUS-12 sin ese contrato.

Si VPS y Hermes1 comparten host, ejecutar sus pruebas focales en paralelo y el e2e general por turnos: el proveedor Drive ficticio usa8799 y el lanzador ya exige un general por host. Cada cambio debe llegar con sus propias pruebas locales. No cambiar puertos/red/controles para forzar concurrencia; acordar la ventana del e2e y la publicación mantiene el trabajo útil paralelo.


Revisión independiente final bus14_document_review: sin hallazgos. Proporción/formatos/barras/accesibilidad, filtros/foco/error y reparto de trabajo respaldados; no se afirma publicación. Preparado para commit enmain y aprobación delSHAexacto antes de desplegar el Worker público.
