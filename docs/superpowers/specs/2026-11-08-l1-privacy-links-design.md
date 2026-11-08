# PRE-09 · Aviso de privacidad junto a la reserva

Lista1 ·8-nov-2026, main93f8f25 verificadoGitHub. Tramo técnico cerrado, no cierre completo PRE-09. Solo planificación.

El formulario de reserva pública montado en site/index.html mountBooking debe ofrecer el aviso existente junto a Request viewing, además del pie. No crear otra casilla de marketing ni bloquear una visita por no aceptar marketing. El enlace va a #/privacy con nombre «Privacy notice», y texto: «Read how we use your details in our privacy notice.» Mantener lo escrito al abrir/cerrar el aviso y poder volver a la reserva sin repetir selección o envío.

Código actual: SIDE_PAGES renderiza #/privacy usando site/apply.js renderPrivacy. La navegación puede reconstruir la pantalla de reserva; por ello capturar borrador de reserva solo en memoria de la página, nunca sessionStorage/localStorage ni URL con nombre/email/móvil. Reutilizar contenedor de vista lateral si preserva DOM y evitar crear un segundo aviso. Si la navegación monta de nuevo, restaurar valores al regresar y revalidar huecos con API actual: no conservar la afirmación de hueco libre. Token antispam no se persiste ni restaura.

Decisión técnica: enlace nativo a ruta existente; anotar un return target interno y referencia a botón para foco en memoria, no URL recibida del usuario. Fallback sin JS ofrece Privacy desde pie/ruta válida según mecanismo actual; no promesa de envío sin JS si el formulario no lo soporta. Si el visitante envía o abandona la página se destruye borrador temporal. Datos no viajan a analytics ni logs.

No cambiar contenido jurídico para inventar razón social, número JOIC, base legal, plazo de alquileres o cobertura de portal. Esa parte PRE-09 sigue pendiente de Hampton/PRE-03 y revisión jurídica; portal debe consumir aviso en AGE-12 cuando exista. Si la misma release requiere cambiar copy legal, esa modificación debe revisarse aparte, no inferirse de este enlace.

Diseño: web actual ink#151515/paper#ffffff/mist#f4f3f0/line#e3e0da/stone#6b665e, bronce pequeño#86542d. Body Montserrat/Helvetica Neue/Arial15px1.65, link/herencia subrayado, max68ch. El token stone global actual es#77736c; #6b665e es la elección explícita para el texto de este control por contraste, sin cambio global. Layout1240px/gutterclamp(16px,4vw,40px), aviso pegado a acción con12px de separación, objetivo44px/foco2pxbronceoffset2px. Tipos/densidad actuales según DESIGN Typography/Components/Accessibility, sin restyle ni fuentes/dependencias nuevas. Reflow390/1280 y zoom200%, foco visible, link teclado, no nueva animación. ENERGY1/RHYTHM1/MOTION1.

Criterios PRE09-L1 enlace visible junto al envío en portada y ficha; PRE09-L2 abrir/volver conserva borrador en memoria sin mantener antispam/hueco falso; PRE09-L3 ninguna PII nueva en storage/URL/logs; PRE09-L4 texto legal/campos institucionales permanecen pendientes, no declarar PRE-09 completo.

Skills: impeccable y antislop definen vínculo/foco/copy concreto y diales; security/frontend-security-coder memoria efímera/URLfija/esc; performance carga aviso existente solo al abrir; ponytail reutiliza navegación en vez de modal o gestor de consentimiento nuevo. Taste/redesign no aplica nueva página/rediseño.
