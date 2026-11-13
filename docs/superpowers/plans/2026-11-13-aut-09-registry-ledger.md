# AUT-09 · Registro inicial de definiciones

13-nov-2026. Base de construcción `0c11720c39b13d58461885dc3441dfc1fe8a0489`, copia aislada. No se han modificado rutas, servicios, usuarios, cuentas ni datos remotos y no hay migración nueva.

## Alcance construido

`server/automation-contracts.js` define un registro cerrado y versionado para `listing_text`, `market_ambiguity_v1` y `hampton_intent_v1`, con propósitos, operaciones, clases previstas, contratos fuente, límites desconocidos y decisiones humanas. Solo `listing_text` existe actualmente como tipo de trabajo en la puerta de Hermes; la definición no demuestra conexión del modelo. Los otros dos son propósitos previstos. Las definiciones se devuelven como copias y su validación exige coincidencia exacta con la versión revisada, rechazando propiedades accesoras propias y campos ocultos o extra en DTO de datos ordinarios.

Las cuatro decisiones humanas del diseño se conservan explícitas: aprobar un match, consultar ante un imprescindible desconocido, resolver una búsqueda y revisar una presentación. Los módulos propietarios deben aplicar sus propias barreras; este registro no está conectado a un consumidor y no constituye una autorización. C3 no se habilita en el registro inicial. La lista vacía de clases para intención de chat no concede permiso.

Las tres [fichas](../../automations/index.md) y `acceptance.json` dejan casos, umbral, evidencia y coste pendientes; `null` no significa cero. No se han inventado casos reales ni afirmado calidad, proveedor, latencia, envío o activación. Los topes expresan comportamiento futuro, no una configuración vigente ni un permiso de gasto.

## Decisiones de integración

- **Ruling:** se usa la forma plural `input_classes`, `required_gates` y `hard_human_decisions` del contrato de cierre más reciente. La ficha original con `input_class` singular se representa mediante la lista correspondiente. Un consumidor antiguo que espere el nombre singular deberá adaptarse; no se modifica ninguno aquí.
- **Ruling:** se registran inicialmente los tres propósitos identificados en los planes, no se inventa una ficha completa para cada automatización real. Esto reduce el alcance entregado: AUT-09 permanece parcial hasta inventariar el resto y acreditar sus pruebas y consumidores.
- **Ruling:** una definición modificada requiere cambiar el registro versionado y revisión de código, incluso al añadir evidencia. Esto impide que un cliente presente por sí mismo una puerta debilitada o una batería falsa; añadir evidencia real necesitará una actualización revisada.

## Verificación

RED→GREEN: nueve pruebas focales cubren ID desconocidos, separación de propósitos, copias inmutables, versiones y puertas, C3, campos arbitrarios, costes/evidencia pendientes, propiedades accesoras u ocultas y enlaces a las fichas. El fallo inicial por módulo ausente y los fallos de las dos protecciones adicionales se reprodujeron antes de corregirlos. El registro es puro y no cambia UI: no corresponde presentar una prueba de navegador como verificación de proveedor o producción.

Pendiente: completar catálogo y fichas de las demás automatizaciones reales; recoger y aprobar casos reales/adversarios y criterios por versión; integrar AUT-10/AUT-01 y las puertas de política/cuenta/canal reales. Ningún estado `pending` habilita una ejecución. La revisión independiente y las pruebas generales quedan registradas en el cierre de esta copia.

Resultados finales sobre la base indicada: 1.301 pruebas Node y 25 Python, build, `check:release`, `team:check` y `check:packages` aprobados. La regresión focal combinada con el servicio de automatizaciones existente pasó 15/15. La revisión independiente está pendiente; no se hizo push ni se consultó producción.

## Integración y revisión independiente

Sobre el main `8475175` la suite integrada pasó 1.382 pruebas Node y 25 Python; build, release y catálogo correctos. La revisión independiente no encontró problemas bloqueantes en el registro desconectado.

Final: minor (deferred): la validación no es un sandbox para objetos JavaScript hostiles; un array con prototipo personalizado o Proxy puede ejecutar código al inspeccionarse o consumirse. Antes de conectar un consumidor, aceptar texto JSON y parsearlo en el límite confiable, y endurecer/revisar el manejo de prototipos; no pasar objetos arbitrarios ni interpretar `valid` como autorización. No hay consumidores ni ruta activa actualmente.
