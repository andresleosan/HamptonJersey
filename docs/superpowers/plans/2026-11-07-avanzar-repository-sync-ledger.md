# Arranque de avanzar: GitHub antes del roadmap

Petición de Luis durante EST-09, 7-nov-2026: revisar el repositorio canónico y clonar/alinear al trabajar desde VPS, ambos Hermes o PC local. Cambio documental acotado, implementado sin alterar controles ni código de aplicación. EST-09 conserva la política aprobada y su propio plan.

Diseño/plan proporcionado: norma en SKILL.md y enlace/contrato en AVANZAR. Clasificar igual/atrasado/adelantado/divergente, trabajo propio/ajeno, repositorio ausente/equivocado y fallo de red; conservar tarea pendiente. Actualización fast-forward o clon nuevo permitido, nunca reset/clean ni publicación automática. En Hermes el candado y clon autorizado prevalecen sobre crear otra copia. El SHA aprobado queda congelado.

Evidencia inicial: consulta de rama por conector GitHub y git fetch coinciden en d0738c77fd7a3267f9516a1514e124061baf5c1d; HEAD de main igual, comparación0/0. Checkout original de diseño preservado. Las dependencias de EST-09 y sus tres documentos locales permanecen aparte.

Skills: skill-creator para modificación acotada, mantener invocación y validar frontmatter/referencias. DESIGN/Playwright no aplican a instrucciones sin interfaz. Seguridad: sin secretos, pérdida de archivos ni cambios a wrappers. No requiere npm test/build de aplicación por sí solo.

Verificación: `git diff --check` correcto. Frontmatter, referencias y casos de sincronización comprobados; el validador de skill-creator no arrancó por PyYAML ausente, por lo que se registró validación estructural alternativa, sin instalar dependencias globales. Playwright: no aplica.

Distribución: respaldos privados en `/tmp/hampton-avanzar-sync-backup`; solo Markdown actualizado en copia local de VPS, instrucciones compartidas de Hermes1/Hermes2 y fuentes persistentes de Codex/Claude del taller. Ambas vistas Hermes coinciden con el archivo compartido; hashes de fuentes y runtime del taller coinciden. Escritura in situ conserva propietarios/permisos; sin reinicios, configuración, llaves ni controles alterados. PC no accesible: no afirmar instalación. GitHub espera publicación autorizada de esta entrega.

## Actualización posterior a la entrega

Publicación posterior confirmada: norma en8388560, incluida enaea7eb5. En la continuación del7-nov se verificaron otra vez ambos hashes de la skill y se alineó el clon compartido Hermes de246300e aaea7eb5 por fast-forward bajo candadoh1; limpio y candado liberado. PC fuera del alcance actual.
