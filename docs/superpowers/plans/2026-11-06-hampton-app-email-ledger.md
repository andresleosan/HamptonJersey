# AUT-17 · Preparación del diseño

Fecha: 6-nov-2026. Base: `main`, `a0c7bcf`. Encargo: `$avanzar AUT-17`.

Spec: [diseño propuesto](../specs/2026-11-06-hampton-app-email-design.md). **No aprobado todavía. No existe plan de implementación; este ledger registra únicamente la preparación.**

## Lectura y decisiones existentes

- Árbol inicial limpio; rama main alineada con origin/main. Leídos el relevo privado, ESTADO, JSON datos del checklist, arquitectura, texto privado de Luis y DESIGN.md. No hay AGENTS.md o CLAUDE.md en la raíz de este clon.
- Se mantienen P-19 (Cloudflare), el buzón habitual, aprobación humana del correo externo y primer uso NOT-10. No se reabre la elección de proveedor.
- Memoria migrada en la ruta de la skill no disponible en el taller; no se ha reconstruido a partir de transcripciones ni inventado decisiones. El relevo local es el antecedente utilizado.
- Skills aplicadas: avanzar, using-superpowers, brainstorming, grill-me, cloudflare-email-service y verification-before-completion. Se consultó la referencia de modelos de avanzar y el catálogo local: `gpt-6.1-terra` admite `high`.
- No se aplican aún writing-plans ni skills de implementación: falta resolver las propuestas de identidad, resumen recurrente, límite y conservación. No se requiere instalar herramientas ni dependencias en esta preparación.

## Hallazgos

1. **Pages no admite send_email.** Corrección a la formulación de AUT-17 y aclaración de P-19: Pages prepara y aprueba en D1; el binding está en hampton-jobs. Conserva la arquitectura, proveedor y control humano.
2. **MX de recepción y buzón externo.** Propuesta: dirección literal en un subdominio. Email Sending y Email Routing se configuran por separado. No se ha alterado DNS ni comprobado el proveedor de los MX actuales.
3. **Consulta remota bloqueada.** `wrangler email sending list`, exit 1: sin autenticación de Cloudflare en Wrangler. No prueba la ausencia de Workers Paid o del alta. No se pidieron credenciales ni se intentó sustituir la autenticación del taller.

## Revisión del diseño

Un agente independiente, solo lectura, según el builder check de brainstorming. Ninguna decisión imprescindible adicional. Incorporadas sus precisiones: contadores del resumen y To confirm, copy de pausa del resumen interno, cola caducada, trabajos en vuelo inciertos, conservación de contenido pendiente, topes por agencia aún pendientes y reintentos del proveedor por verificar. Sus decisiones para Luis coinciden con la spec: identidad, autorización recurrente, límite y conservación.

## Comprobaciones de esta entrega documental

- Validador real de Pages de Wrangler 4.148.0, expuesto únicamente en memoria con Node `Module._compile`, con configuración temporal. Control sin binding: pasa. Mismo control con `send_email`: rechaza con `Configuration file for Pages projects does not support "send_email"`. Exit 0 del arnés al comprobar ambos resultados. Sin cambios en node_modules ni en wrangler.toml.
- Dos intentos de usar el CLI como comprobación no fueron válidos: `pages dev --config` rechaza rutas personalizadas; `pages dev` con cwd temporal agotó 20 s; `pages functions build` sí compila pero no ejecuta la validación de Pages. Ninguno sustituye la comprobación anterior ni acredita soporte del binding. No quedaron procesos de esos intentos.
- Consulta de DNS público desde Python: bloqueada con URLError en el taller. Estado real de MX sin comprobar; la propuesta de subdominio procede de la documentación oficial y de conservar el buzón, no de afirmar un proveedor actual.
- `npm run check:release`: exit 0, sin TO CONFIRM.
- Se valida el JSON del checklist, que AUT-17 continúa pendiente y que los enlaces locales de esta entrega existen; `git diff --check` antes del commit.
- `npm test` y build de la app: no ejecutados, entrega únicamente documental, sin modificación de código, dependencias, configuración o migraciones. El pequeño build temporal anterior no es el build de Hampton.
- Playwright: no aplica a la preparación documental. El recorrido del correo y las pruebas de entrega real siguen pendientes de implementación y configuración.

## Entrega y continuidad

- Diseño y aclaraciones de ESTADO, checklist y arquitectura en un commit local. Sin push, publicación, migración ni envío de mensajes.
- AUT-17 y NOT-10 no están construidos ni completos. El resto de puntos dependientes conserva su estado.
- Decisión pendiente, Luis: revisar la propuesta de la spec. Después: plan de implementación, construcción, pruebas y revisión del código. Configuración real de Cloudflare y prueba de recepción requieren un canal autenticado existente; se mantienen como pendientes externos.
- Siguiente recomendado Codex: `/avanzar AUT-17` · `gpt-6.1-terra` · `high`. La tarea requiere varias partes con D1, cron, MIME y panel, control de concurrencia y resultados inciertos; las pruebas actuales no cubren todavía correo. Si se desea otra tarea mientras se resuelve la cuenta: AGE-04; no se inicia sin elección de Luis.
