# Fichas de automatización · avance de AUT-09

Este registro inicial reúne tres propósitos del diseño: [listing_text](listing_text.md), [market_ambiguity_v1](market_ambiguity_v1.md) y [hampton_intent_v1](hampton_intent_v1.md). `listing_text` ya figura como tipo de trabajo en la puerta existente de Hermes; eso no acredita que un modelo esté conectado. Los otros dos propósitos son contratos previstos, no servicios activos.

`server/automation-contracts.js` conserva los identificadores, la versión, operaciones, clases previstas y puntos de decisión humana. Su validación solo compara una definición con el registro cerrado: **no autoriza acceso a datos, gasto, modelos, cuentas, envíos ni modos**, y ningún productor la consume todavía. Una clase prevista tampoco sustituye la clasificación y autorización del dato concreto. Una lista de clases vacía significa que no hay ninguna clase acreditada aquí. C3 no se habilita a través de este registro.

Los cuatro puntos humanos del diseño permanecen explícitos: aprobar un match, consultar ante un imprescindible desconocido, resolver una búsqueda y revisar una presentación. El registro es declarativo; las barreras reales deben aplicarlas los servicios dueños y revalidarse antes de cada efecto.

[acceptance.json](acceptance.json) contiene únicamente estados pendientes y referencias vacías. No contiene casos reales ni demuestra proveedor, modelo, calidad o activación. Para cada propósito de IA faltan los casos reales y adversarios, el umbral decidido para su diseño y evidencia de su ejecución; ningún umbral universal se deduce aquí. El coste y la moneda desconocidos son `null`; alcanzar un límite o no conocer el coste requiere revisión, no una autorización de gasto.

Quedan por inventariar las demás automatizaciones y sus fichas reales, integrar los consumidores AUT-10/AUT-01 y verificar las políticas, baterías y evidencias correspondientes. AUT-09 sigue **parcial**. No se añade migración ni interfaz y no se modifican el reloj, la retención, los canales o el comportamiento productivo.
