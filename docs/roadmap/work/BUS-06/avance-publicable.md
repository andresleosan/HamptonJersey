# BUS-06 y BUS-19 · Avance de construcción

13 de noviembre de 2026. Se construyeron y probaron localmente el núcleo de inventario y una primera autoridad de revisión de acceso por fuente y canal. El núcleo conserva versiones, concesiones de adquisición compartidas, recibos idempotentes y registro de cambios. Las decisiones distinguen acceso y conservación, y las fuentes desconocidas permanecen pendientes.

La revisión documental local comprende 237 registros de fuente/canal para 141 identificadores históricos o propuestos. Esta revisión no concede permisos ni acredita capturas. Homely y JFSC permanecen excluidas; Places y Properties, aplazadas en esta etapa.

El relevo aceptado se ha reconciliado con su revisión documental comprobando sus huellas y referencias. Se preparó un candidato privado con los 237 canales, incluidos 14 sin URL; todos siguen pendientes y sin clasificar. El candidato no incluye URLs, no se publica en Git y no crea decisiones ni registros de ejecución.

Las rutas administrativas del inventario están desactivadas por defecto. La migración aditiva se ha ensayado en bases de prueba; no se ha aplicado una migración remota ni activado fuentes reales con este avance.

Para completar BUS-06 y BUS-19 faltan la recepción y reconciliación del manifiesto aceptado, los lectores y su control efectivo de red, la pantalla de revisión, los permisos aplicables por canal y la evidencia de cobertura real. El avance de código y las pruebas no convierten una fuente inaccesible en una fuente sin anuncios.

La reconciliación documental rechaza también claves JSON duplicadas, incluso cuando la huella del archivo coincide: una misma evidencia no puede tener interpretaciones contradictorias según el lector. Prueba sintética: `python3 -m unittest tests.test_directory_manifest`. Esto endurece la preparación del candidato; no autentica al autor ni transforma los hashes en aceptación operativa.

La incorporación operativa sigue dependiendo de una autoridad durable que identifique al revisor y vincule su aceptación a la revisión y huella exactas, y de decisiones BUS-19 verificables para cada canal y alcance, incluidos acceso y conservación. El candidato documental se marca `candidate_not_authorized` y carece de esas decisiones: no debe insertarse como manifiesto aceptado ni habilitar canales. Hasta disponer de dicha autoridad, la ausencia de permiso permanece pendiente y no equivale a cobertura vacía. Ninguna fuente real fue consultada ni se produjo captura con esta prueba.

La revisión independiente confirmó duplicados anidados y escapados, Unicode válido y conservación/no creación de salida ante rechazo; 15 pruebas sintéticas pasaron. La validación no autentica al revisor ni autoriza fuentes. Un JSON extremadamente anidado puede producir un error ruidoso previo a escribir; no se atribuye como resuelto.

La vista administrativa de solo lectura muestra recorridos y cobertura por fuente y canal, con páginas, estados de error y cobertura desconocida. Continúa sujeta al gate existente; no activa fuentes. Las pruebas aisladas con respuestas sintéticas cubren escritorio, móvil y zoom, y una revisión independiente contrastó el contrato. El montaje conjunto en Automations se verificó con gate 404 simulado a 390/1280; no acredita el gate desplegado ni cobertura real. Faltan la gestión/revisión por canal, carga manual y el resto del plan.

BUS-19 incorpora rutas y pantalla de revisión por canal bajo el gate existente. Lista y detalle muestran la decisión efectiva; el formulario conserva borradores y bloquea el guardado ante conflicto o datos obsoletos. Las pruebas sintéticas incluyen revocación, caducidad, fallo y pérdida de fila, y D1 local ensaya concurrencia y rollback. La pantalla y API recibieron revisión independiente. Ninguna prueba acredita permisos ni canales reales; faltan la aceptación operativa del manifiesto, evidencia por canal y lectores que apliquen la decisión. La proyección de vigencia del listado debe mantenerse coordinada con el servicio dueño.

## 14 de noviembre de 2026 · Recorrido completo en el panel

Con el interruptor encendido, Automations permite el recorrido entero sin lectores automáticos:

1. **Directorio.** Un admin elige el archivo privado del manifiesto, ve su revisión, sus canales y su huella SHA-256, y lo acepta. El servidor vuelve a calcular la huella sobre el texto recibido y registra quién aceptó. Todos los canales entran pendientes; los permisos que traiga el archivo se ignoran. El archivo no se guarda en el repositorio ni en una migración.
2. **Revisión por canal (BUS-19).** Cada canal muestra su tipo de fuente y la nota de la revisión documental. Quien revisa elige el tipo y la decisión con su evidencia. Solo una fuente general puede abrirse; los dominios de Homely, Places.je y Properties.je se rechazan siempre.
3. **Tanda.** Se abre una tanda sobre el directorio aceptado. Para cada canal revisado como manual se pegan hasta 10 anuncios por envío; el servidor los valida todos y guarda todos o ninguno. La decisión del canal se revalida antes de tomarlo, al tomarlo y al guardar.
4. **Cobertura.** Cada canal dice cuántos anuncios aportó o por qué no se ha leído (falta revisión, falta carga manual, no permitido, pausado). Un canal sin leer nunca aparece con cero anuncios y la cobertura externa sigue «desconocida».
5. **Cierre.** La tanda se pausa, se reanuda o se cierra para empezar la siguiente; su historial se conserva. Una revisión posterior del manifiesto mueve los canales que lista y conserva sus decisiones.

Límites: cada canal admite un envío por su intervalo mínimo (60 segundos o más); una carga manual no puede declarar un canal leído por completo; no hay lector de webs externas ni recorrido automático. El candidato privado real se aceptó en una base local de prueba con 237 canales pendientes. Nada de esto está activo en producción: falta aplicar la migración `0043` y encender `MARKET_INVENTORY_READY`.
