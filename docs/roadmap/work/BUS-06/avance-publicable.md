# BUS-06 y BUS-19 · Avance de construcción

13 de noviembre de 2026. Se construyeron y probaron localmente el núcleo de inventario y una primera autoridad de revisión de acceso por fuente y canal. El núcleo conserva versiones, concesiones de adquisición compartidas, recibos idempotentes y registro de cambios. Las decisiones distinguen acceso y conservación, y las fuentes desconocidas permanecen pendientes.

La revisión documental local comprende 237 registros de fuente/canal para 141 identificadores históricos o propuestos. Esta revisión no concede permisos ni acredita capturas. Homely y JFSC permanecen excluidas; Places y Properties, aplazadas en esta etapa.

El relevo aceptado se ha reconciliado con su revisión documental comprobando sus huellas y referencias. Se preparó un candidato privado con los 237 canales, incluidos 14 sin URL; todos siguen pendientes y sin clasificar. El candidato no incluye URLs, no se publica en Git y no crea decisiones ni registros de ejecución.

Las rutas administrativas del inventario están desactivadas por defecto. La migración aditiva se ha ensayado en bases de prueba; no se ha aplicado una migración remota ni activado fuentes reales con este avance.

Para completar BUS-06 y BUS-19 faltan la recepción y reconciliación del manifiesto aceptado, los lectores y su control efectivo de red, la pantalla de revisión, los permisos aplicables por canal y la evidencia de cobertura real. El avance de código y las pruebas no convierten una fuente inaccesible en una fuente sin anuncios.

La reconciliación documental rechaza también claves JSON duplicadas, incluso cuando la huella del archivo coincide: una misma evidencia no puede tener interpretaciones contradictorias según el lector. Prueba sintética: `python3 -m unittest tests.test_directory_manifest`. Esto endurece la preparación del candidato; no autentica al autor ni transforma los hashes en aceptación operativa.

La incorporación operativa sigue dependiendo de una autoridad durable que identifique al revisor y vincule su aceptación a la revisión y huella exactas, y de decisiones BUS-19 verificables para cada canal y alcance, incluidos acceso y conservación. El candidato documental se marca `candidate_not_authorized` y carece de esas decisiones: no debe insertarse como manifiesto aceptado ni habilitar canales. Hasta disponer de dicha autoridad, la ausencia de permiso permanece pendiente y no equivale a cobertura vacía. Ninguna fuente real fue consultada ni se produjo captura con esta prueba.

La revisión independiente confirmó duplicados anidados y escapados, Unicode válido y conservación/no creación de salida ante rechazo; 15 pruebas sintéticas pasaron. La validación no autentica al revisor ni autoriza fuentes. Un JSON extremadamente anidado puede producir un error ruidoso previo a escribir; no se atribuye como resuelto.
