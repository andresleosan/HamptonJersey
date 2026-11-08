# PRE-09 · Privacy links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Solo plan, construcción y alcance por tramo requieren encargo/reserva propios.

**Goal:** Añadir un acceso al aviso junto a Request viewing preservando el borrador.

**Architecture:** Enlace a ruta #/privacy existente con vuelta y datos efímeros en memoria; revalidación de huecos al volver. Ninguna nueva política jurídica.

**Tech Stack:** JS/HTML/CSS actual y Playwright local.

**Spec:** [Diseño](../specs/2026-11-08-l1-privacy-links-design.md).

## Global Constraints

PRE-09 solo tramo enlace; datos institucionales requieren PRE-03 decision y portal/cobertura/retención siguen pendientes. Actor público sin nuevo permiso ni endpoint. Ruta fija#/privacy, renderPrivacy existente; guardar formulario solo en memoria y limpiar al enviar/abandonar. No persistir PII/antispam/slot libre. Web ink#151515,paper#ffffff,mist#f4f3f0,line#e3e0da,stone#6b665e,bronze-dk#86542d. Montserrat15px/1.65,linksubrayado,contenedor1240px,gutterclamp(16px,4vw,40px),gap12px,objetivo44px,foco2pxoffset2px. No nuevas fuentes, librerías o animaciones. ENERGY1/RHYTHM1/MOTION1. El stone global web actual es#77736c; usar #6b665e en este aviso es un cambio acotado propuesto por contraste, no describirlo como token global vigente. Diferenciar CSS vigente de propuestas de DESIGN.

## Review Focus

Abrir aviso con datos parcialmente escritos; regresar con hueco ocupado; cambio de ruta/segunda ficha; navegar por teclado a390/zoom200%; antispam caducado. Se prueban en el único flujo siguiente.

## Task1: Enlace accesible y vuelta segura

**Files:** Modificar site/index.html mountBooking/SIDE_PAGES y site/apply.js solo interfaz de retorno si hace falta; crear tests/privacy-links.e2e.cjs. No cambiar cuerpo jurídico ni esquema/backend.

**Interfaces:** helper local `rememberBookingDraft(form):BookingDraft` solo campos del formulario en memoria y referencia de retorno interna; `restoreBookingDraft(form,draft):void` restaura valores y fuerza consulta de disponibilidad actual, nunca token/hueco reservado. El snapshot se captura en el clic nativo al aviso, no en cada keystroke ni en analytics.

- [ ] Escribir e2e PRE09-L1…L4 para ambos formularios y vacíos, draft con nombre/email/teléfono de prueba, back/forward, hueco ocupado y antispam no restaurado; comprobar storage/URLsinPII. `E2E_SCRIPT=tests/privacy-links.e2e.cjs npm run test:e2e` -> RED por enlace/retorno ausentes.
- [ ] Añadir link y aviso al lado de envío; conservar DOM si navegación lo permite o snapshot efímero validado al volver; foco al formulario de origen, mensaje si hueco ya no existe, sin envío automático. No crear consentimiento publicitario ni asumir una nueva base legal.
- [ ] Focal -> PASS; npm test/build/check:release, e2e general y MCP1280/390/zoom200%, teclado/red/errores. Revisión independiente, ledger con evidencia, registrar alcance parcial sin cerrar PRE-09 entero. No migrar/publicar sin autorización.

Hoy solo revisión Markdown; todas casillas futuras abiertas. Playwright no aplica a esta entrega documental.
