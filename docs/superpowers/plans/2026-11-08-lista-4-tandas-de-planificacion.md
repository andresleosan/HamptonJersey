> **Nota de vigencia (9-nov-2026):** documento histórico; consultar [el índice vigente](2026-11-09-lista4-tandas-pendientes.md) y las decisiones posteriores de Luis antes de ejecutarlo.

# Lista 4 · Tandas para preparar planes

8-nov-2026 · Base del catálogo `93f8f25c0aa029f1850f0c46855fb89fd524a8e3`. Esta es una propuesta de organización de la planificación; no acredita implementación, integración, reserva ni autorización de publicación. Los estados y dependencias se vuelven a comprobar al iniciar cada tanda.

## Método

Una tanda tiene una spec y un plan común, un ledger y una matriz que conserva cada código, aceptación, dependencias y pruebas propias. Se inspeccionan juntos los archivos compartidos y se define un orden único de migraciones, contratos y pruebas; se revisa el conjunto antes de entregarlo. Separar fases construibles cuando una decisión o integración afecte solo parte del alcance. No fusionar códigos ni marcar una tarea terminada porque otra del grupo esté lista. Una construcción posterior requiere verificar el catálogo y la coordinación vigente para todos sus recursos y unidades; una tanda de planificación no reserva nada.

## Tandas propuestas

| Orden | Tanda | Códigos | Por qué y límites |
|---|---|---|---|
| 0 | Integración de planes de ficha ya hechos | SPR-01, PUB-04, PUB-05, PUB-06, PUB-07 | Ya tienen planes separados. Producir una matriz de compatibilidad y secuencia de construcción: fecha compartida, superficie, estado del inmueble, migraciones, eventos, privacidad y validaciones. Conservar íntegros los planes y reconocer que aún no están implementados. BUS-13 sigue pendiente de Hampton y de revisión jurídica. |
| 1 | Contenido y archivos de la ficha | PUB-08, PUB-11 | El mismo editor y pipeline de medios: etiquetas, textos sociales, vídeo separado del enlace existente, calidad de imágenes y documentos. Diseñar visibilidad y permisos de documentos, formatos, límites, fallos y publicación por separado; no asumir que todos los archivos serán públicos. Puede dividirse en fases si PDF y seguridad exigen un contrato previo. |
| 2 | Alta guiada y completitud | PUB-01, PUB-12; relación con PUB-02 | Un solo recorrido móvil por familias y una fuente de criterios de completitud. Reutilizar las familias de la tanda 0 y contenido de la 1; no duplicar campos. Luis debe decidir si Publish bloquea por completitud: mientras tanto planificar porcentaje y conservar el comportamiento actual. PUB-02 es seguimiento de esa decisión, no se declara resuelta. |
| 3 | Estado e historial de propiedad | PUB-09, SPR-02; relación con EST-17, EST-18 y PUB-15 | Diseñar estados, cambios y trazabilidad conjuntamente, sin duplicar eventos. EST-17 conserva estados pendientes y EST-18 la base de eventos y productores futuros; la vista de historial está aplazada por Luis, por lo que no se presupone su construcción. IDs y feeds de portales siguen sujetos a PUB-15 y a las cuentas que confirme Hampton. |
| 4 | Propiedad multifuente y seguimiento | SPR-07, SPR-08, SPR-03 | Comparten identidad, fuentes, anuncios, observaciones y capturas. Plan en fases: primero contratos de inventario y evidencia; luego secciones, filtros, captura y descargas. BUS-10, EST-16, EST-13, AGE-06 y otras dependencias concretas se verifican por tramo; no convertir una observación web en confirmación comercial. SPR-02 aporta historial cuando corresponda. |
| 5 | Métricas y recorrido de la web | ANA-04, ANA-05; coordinación con ANA-01 y PUB-17 | Definir eventos, agregados y embudo juntos, sin guardar identificadores personales por defecto. ANA-01 tiene requisito de privacidad y consentimiento; PUB-17 necesita una regla de salud y avisos, que pueden quedar en fase posterior con métricas fiables. Confirmar fuentes y criterios antes de prometer cálculos. |
| 6 | Captación de propietarios y origen | PUB-10, PUB-19, PUB-20, ANA-10 | Contrato común de demanda agregada, formulario, origen y QR, con fases por canal. ANA-07 figura como hecha en el catálogo; verificar integración y cifras actuales. El formulario depende de PRE-03 y PRE-09; selección de parroquia y presupuesto son de Hampton. Mantener umbral de privacidad documentado y no enviar campañas. |

PUB-13 se coordina con la tanda 1 por textos y fotos, pero depende de AUT-13 y de la regla de Luis de usar solo fichas publicadas; no asumir activación de Hermes. PUB-21 tiene pendientes externos de configuración y de Hermes, y no se considera terminada por planificar el editor. Tours 3D más adelante. Las acciones asignadas a Luis o Hampton, incluida PUB-14, conservan su responsable.

## Primera tanda recomendada

Empezar por **tanda 0**: reconciliar los cinco planes ya existentes para detectar incompatibilidades antes de sumar cambios en los mismos archivos. Seguir con **tanda 1 (PUB-08 + PUB-11)** como próximo plan conjunto. Tras cada tanda entregar enlaces al plan, matriz por código, pendientes externos y validación real. No ejecutar trabajos de producto durante esta sesión de planificación.

Planes existentes: [SPR-01](/tmp/hampton-lista4-plans-20261108/docs/superpowers/plans/2026-11-08-spr-01-listing-availability.md), [PUB-04](/tmp/hampton-pub04-plans-20261108/docs/superpowers/plans/2026-11-08-pub-04-property-identity.md), [PUB-05](/tmp/hampton-pub05-plans-20261108/docs/superpowers/plans/2026-11-08-pub-05-physical-fields.md), [PUB-06](/tmp/hampton-pub06-plans-20261108/docs/superpowers/plans/2026-11-08-pub-06-financial-fields.md) y [PUB-07](/tmp/hampton-pub07-plans-20261108/docs/superpowers/plans/2026-11-08-pub-07-legal-technical.md). Estas rutas son locales y temporales; no son evidencia de publicación.
