# PRE-10 · Registrar oposición al marketing · Diseño

Lista1 · PRE-10 (tramo manual) · 8-nov-2026. Solo planificación. Base main/GitHub `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobada14:14UTC en copia exclusiva. Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

## Objetivo y fuentes

Permitir al empleado registrar una oposición recibida sin perder cambios pendientes ni reactivar consentimientos por accidente.

Código leído: server/routes/applicants.js updateContact ya admite marketing:false, guarda contact.consent_changed con lock; ApplicantDetail.jsx solo confirma true. La casilla pública ofrece news, no servicios de valoración. No se emite interpretación jurídica nueva.

## Enfoque y decisiones

Añadir acción «Record marketing objection» en la ficha de contacto compartida, disponible cuando existe opt-in. Mostrar estado actual y explicación: afecta a todas las búsquedas del contacto. Confirmación inline explícita, cancelable; exige resolver primero cambios de contacto sin guardar. No cerrar búsqueda, borrar persona ni tocar consentimientos de otro contacto. Cuando ya no hay opt-in mostrar «Marketing consent not recorded», sin botón que invente una oposición histórica.
Usar PUT existente con {updated_at,marketing:false} y sin campos de formulario no guardados. El evento existente acredita actor y fecha del cambio; no atribuirle canal/reason no capturados. Tras éxito refrescar solo contacto/eventos/retención preservando borrador de criterios y foco. No añadir supresión de correo transaccional: la oposición al marketing no equivale al bloqueo de servicio de AUT-17; los futuros emisores promocionales deben comprobar consentimiento justo antes del envío.

Alternativa elegida: ampliar el flujo existente con un contrato pequeño y verificable. Duplicar el dominio o introducir automatismos no pedidos aumenta permisos y estados sin resolver la necesidad. Las decisiones técnicas de este documento son propuestas del planificador, no aprobaciones atribuidas a Luis.

## Contratos

UI `recordMarketingObjection():Promise<void>` en ApplicantDetail; consume contact.updated_at y marketing_opt_in_at guardados, llama api(`/admin/contacts/${contact.id}`,{method:'PUT',body:{updated_at,marketing:false}}). Servidor conserva saveVersioned y no-op actual. Error409 no reintenta silenciosamente; recargar contacto y pedir confirmación renovada si corresponde. Respuesta tardía tras ID/logout no se aplica.

## Seguridad, error y concurrencia

Actor desde sesión; permisos de rutas existentes, sin controles debilitados. SQL parametrizado y checks de versión dentro de la mutación, evento/tarea efectivos en el mismo batch; guardas no-op no producen efectos. Error visible conserva borrador/foco;403/401 no revela ni repone datos tras logout;409 obliga revisar estado antes de confirmar. Sin datos personales en logs o almacenamiento persistente nuevo. Nunca imprimir configuración privada para probar.

## Interfaz y valores verificables

Panel existente: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone#6b665e, bronze#a56b3d para foco, bronze-dk#86542d para texto pequeño/hover, ok#2f6b4f, err#a32020, warn-bg#fff6e5, field-line#8f8a82. CSS actual prevalece sobre propuestas antiguas DESIGN.md Colors/Shapes. Tenor Sans/Georgia/serif H1 26px/H2 19px400; Montserrat/system-ui14px/1.5, auxiliar12px, tabla12px600 y celdas10px12px. page1240px, padding24px16px120px, radio14 tarjeta/10 campo/999 botón, gaps8/12/16/24px. Tabla a tarjetas760px; link/control32px escritorio44px móvil, foco2px/offset2px, contraste4.5:1 texto/3:1 foco. Probar1280/390, teclado/zoom200%/reduced motion. No paquetes, fuentes, imágenes o animaciones nuevas. ENERGY1/RHYTHM1/MOTION1 por comparación operativa y continuidad Hampton.

## Dependencias

Catálogo PRE-10: AUT-17 activated y PRE-02 activated solo para canales reales (scope partial). El tramo manual no espera dichos canales; construirlo con alcance/evidencia de unidad explícitos, sin afirmar completado PRE-10 entero. Abogado/equipo deben validar las reglas/copy de marketing por canal antes de activar campañas. Esta entrega no crea campañas ni opina sobre su base legal.

## Criterios por código

PRE10-M1: opt-in existente pasa a null tras confirmación, exactamente un evento efectivo y actor de sesión.
PRE10-M2: dos búsquedas comparten el cambio, sin cerrar ninguna; criterios sin guardar preservados.
PRE10-M3: Cancel/409/401/no-op no revoca por otra cuenta ni confirma éxito falso.
PRE10-M4: comunicaciones promocionales futuras consumen consentimiento actual; activación y reglas legales del resto de PRE-10 siguen pendientes.

## Aplicación de skills

avanzar conserva tarea/dependencias/estados; brainstorming y grill-me documentan decisiones y límites; writing-plans fija archivos/interfaces/pruebas; impeccable conserva foco y copy operativo; security-best-practices/frontend-security-coder exigen auth/SQL parametrizado/texto seguro y datos mínimos; antislop evita estados/estadísticas ficticios y aplica diales; web-performance-optimization limita rondas/bytes y polling; ponytail reutiliza módulos existentes. taste-skill/redesign-skill no aplica a páginas nuevas: no se crea una página ni se rediseña la identidad. Gates runtime se ejecutan al construir, no se acreditan por Markdown.
