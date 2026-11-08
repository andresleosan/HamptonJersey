# PRE-11 · Tours externos solo tras elección · Diseño

Lista1 · PRE-11 · 8-nov-2026. Solo planificación. Base main/GitHub `93f8f25c0aa029f1850f0c46855fb89fd524a8e3` comprobada14:14UTC en copia exclusiva. Plan cerrado técnicamente; construcción condicionada a sus dependencias y encargo propio.

## Objetivo y fuentes

Evitar que los reproductores externos de tours contacten al proveedor antes de una elección explícita del visitante.

site/index.html mountPublic crea .tour3d con playing=false pero IntersectionObserver lo cambia al entrar en viewport. show(i) conserva playing al cambiar de tour. La ficha crea iframe al seleccionar tour. site/lib.js restringe embedUrl a Matterport/Vimeo/YouTube-nocookie. Consultadas fuentes primarias: [Vimeo dnt](https://help.vimeo.com/hc/en-us/articles/12426260232977-About-Player-Parameters) y [YouTube privacidad mejorada](https://support.google.com/youtube/answer/171780?hl=en). Los parámetros reducen seguimiento, no se presentan como garantía de ausencia total de cookies ni cumplimiento legal.

## Enfoque y decisiones

Eliminar la activación por IntersectionObserver. Cada tour/proveedor empieza en poster local con aviso «Loading this tour connects to [provider], which receives your IP address and may use its own storage.» y botón «Load [provider] tour». Cambiar de tour restablece elección; no permiso global persistido. Elegir pestaña Tour en la ficha muestra el mismo control, no iframe automático. Tras pulsar crear iframe validado; botón «Unload tour» elimina iframe y deja aviso/poster; no promete borrar almacenamiento ya creado por proveedor. Fuera del allowlist ofrecer solo enlace HTTPS validado con aviso. No banner global ni CMP nuevo por esta tarea. La validación jurídica del copy pertenece a Hampton, sin impedir implementar el control técnico que evita cargas no elegidas.

Alternativa elegida: ampliar el flujo existente con un contrato pequeño y verificable. Duplicar el dominio o introducir automatismos no pedidos aumenta permisos y estados sin resolver la necesidad. Las decisiones técnicas de este documento son propuestas del planificador, no aprobaciones atribuidas a Luis.

## Contratos

Crear `site/tour-privacy.js`: `tourProvider(url):'Matterport'|'Vimeo'|'YouTube'|null`, `privateEmbedUrl(url):string|null` usa la validación equivalente a embedUrl y fija dnt=1 para player.vimeo.com preservando h y otros parámetros válidos, nunca evalúa URL arbitraria. `mountTourGate(container,{url,title,onLoaded}):()=>void` renderiza poster/aviso/botón y devuelve cleanup. Solo un gesto de ese botón llama load; contador stats tour se llama en onLoaded, no al mostrar poster. Cleanup retira iframe, timers y listeners. Foco al iframe con título tras cargar y retorno al botón tras unload; error20s ofrece reintento y enlace externo, sin reintento automático. site/index.html carga /tour-privacy.js como script clásico después de /lib.js y antes del script inline principal; exports CommonJS solo para tests, como lib.js, sin convertir el HTML a módulo ni redefinir globals.

## Seguridad, error y concurrencia

Actor desde sesión; permisos de rutas existentes, sin controles debilitados. SQL parametrizado y checks de versión dentro de la mutación, evento/tarea efectivos en el mismo batch; guardas no-op no producen efectos. Error visible conserva borrador/foco;403/401 no revela ni repone datos tras logout;409 obliga revisar estado antes de confirmar. Sin datos personales en logs o almacenamiento persistente nuevo. Nunca imprimir configuración privada para probar.

## Interfaz y valores verificables

Superficie web existente, no nueva página: ink#151515, paper#ffffff, mist#f4f3f0, line#e3e0da, stone actual#77736c; para este control nuevo se adopta stone#6b665e por contraste, sin retokenizar toda la web, y bronze-dk#86542d para texto pequeño. Tenor Sans display400: H2 clamp(24px,3vw,34px)/.01em, cuerpo Montserrat/Helvetica Neue/Arial15px/1.65, copy max68ch. Contenedor1240px, gutter clamp(16px,4vw,40px), secciones clamp(56px,8vw,104px), poster mantiene aspect-ratio y radios16px ya existentes. Botón píldora999px padding13px28px, objetivo44px, foco2px/offset2px; no nueva imagen externa para poster. Mantener estilos de .tour3d-play y .stage; aviso inline12–14px legible, contraste4.5:1. Móvil390/escritorio1280/zoom200%, responsive existente sin nueva rejilla. ENERGY1/RHYTHM1/MOTION1 en este control, hover y reduced motion; no autoplay/scroll-trigger. DESIGN Colors/Typography/Components/Accessibility como fuente, propuestas de restyle global fuera.

## Dependencias

PRE-11 no tiene dependencia de catálogo. No se activa una campaña ni un proveedor nuevo. El diseño del control de carga está cerrado técnicamente; no se presenta como conclusión legal sobre qué cookies son esenciales. Cualquier autorización global persistente o nueva herramienta de consentimiento se diseña por separado.

## Criterios por código

PRE11-1: antes de gesto, llegar al viewport/cambiar radio/abrir pestaña no genera requests, iframes, preconnect ni posters al dominio del proveedor.
PRE11-2: un gesto carga solo el URL permitido elegido, Vimeo dnt=1 preserva h; URL peligrosa no crea iframe.
PRE11-3: cambiar tour/ruta/unload desmonta iframe y timers; sin preferencias persistidas o consentimiento automático.
PRE11-4: teclado, foco, error20s/offline y fallback HTTPS son utilizables. El test registra solo tráfico local/interceptado, no afirma auditar cookies reales de proveedores.

## Aplicación de skills

avanzar conserva tarea/dependencias/estados; brainstorming y grill-me documentan decisiones y límites; writing-plans fija archivos/interfaces/pruebas; impeccable conserva foco y copy operativo; security-best-practices/frontend-security-coder exigen auth/SQL parametrizado/texto seguro y datos mínimos; antislop evita estados/estadísticas ficticios y aplica diales; web-performance-optimization limita rondas/bytes y polling; ponytail reutiliza módulos existentes. taste-skill/redesign-skill no aplica a páginas nuevas: no se crea una página ni se rediseña la identidad. Gates runtime se ejecutan al construir, no se acreditan por Markdown.
