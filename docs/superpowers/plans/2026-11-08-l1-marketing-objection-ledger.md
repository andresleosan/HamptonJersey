# PRE-10 · Registrar oposición al marketing · Ledger

8-nov-2026 · Lista1 · PRE-10 (tramo manual). Base `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobadaGitHub14:14UTC. Solo planificación: sin reserva, construcción, migración, envío o publicación.

[Diseño](../specs/2026-11-08-l1-marketing-objection-design.md) · [Plan](2026-11-08-l1-marketing-objection.md).

Estado: Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

Fuente y decisión: Código leído: server/routes/applicants.js updateContact ya admite marketing:false, guarda contact.consent_changed con lock; ApplicantDetail.jsx solo confirma true. La casilla pública ofrece news, no servicios de valoración. No se emite interpretación jurídica nueva.

Dependencias: Catálogo PRE-10: AUT-17 activated y PRE-02 activated solo para canales reales (scope partial). El tramo manual no espera dichos canales; construirlo con alcance/evidencia de unidad explícitos, sin afirmar completado PRE-10 entero. Abogado/equipo deben validar las reglas/copy de marketing por canal antes de activar campañas. Esta entrega no crea campañas ni opina sobre su base legal.

Criterios de producto y pruebas permanecen abiertos hasta ejecución. La validación documental y revisión independiente de la tanda se registran en el índice común; no se presentan pruebas futuras como pasadas. Git sin autor configurado: conservar documentos, no inventar identidad. Relevo privado fuera de Git.

Gate antislop documental: Hard Gate PASS por estados/cifras basados en hechos y sin producto entregado; Purpose PASS por ampliación del flujo existente con razones en spec; Liveliness PASS diales1/1/1 según pantalla operativa; Craftsmanship PASS por contratos/controles definidos sin contenido ficticio. Los gates de runtime y Playwright quedan pendientes de construcción.
