# PRE-16 · Traslado de fotos del equipo — plan de implementación del tramo de fotos

> Implementación futura con `superpowers:executing-plans`. Solo planificación; no incluye cambiar el dominio ni dar de baja Wix.

**Objetivo:** servir desde la web de Hampton las dos fotos actuales del equipo. **Arquitectura:** archivos JPEG estáticos propios, allowlist exacta y presentación existente. **Stack:** sitio estático y pruebas Node. **Base:** `f0d8eb73905e32b3f283c180cfc12f9149a3cb93`. Luis autorizó copiar y reutilizar las fotos actuales en nombre de Hampton; obtenerlas pertenece a la construcción.

## Contrato

`site/data/team.json` tiene dos fotos Wix utilizadas en tres lugares de `site/index.html`: equipo, selección del negociador al reservar y ficha de propiedad. Guardar las fotografías correspondientes como `site/assets/team/gilberto-franco.jpg` y `site/assets/team/joshua-franco.jpg`, sin sustituir imágenes por otras. Verificar HTTP exitoso, tipo real JPEG, decodificación, dimensiones y calidad; si no coinciden o falla la descarga, detener el traslado y comunicarlo. La comparación visual se realiza contra las imágenes actuales. No descargar ni copiar credenciales durante la planificación.

Reutilizar el diseño de `DESIGN.md`: tinta `#151515`, blanco `#fff`, mist `#f4f3f0`, Montserrat 15 px/1.65, títulos Tenor Sans; conservar recortes, alternativas de texto y responsive existentes. `frontend-security-coder` y `security-best-practices` preservan validación; `impeccable` y `antislop` preservan legibilidad; `web-performance-optimization` limita peso y `ponytail` evita dependencias nuevas.

## Pasos

1. **Archivos:** `site/lib.js`, `tests/lib.test.js`, `site/data/team.json`, `site/index.html` y los dos JPEG indicados.
   - [ ] Crear prueba de `safeTeamPhoto(u)` para las dos rutas exactas y rechazo de URL externas, `javascript:`, rutas relativas, `..`, query, fragmento y valores no string. Implementar y exportar función que devuelve la ruta válida o `null`; conservar sin relajar la función `safeUrl` y las demás protecciones.
   - [ ] Descargar las dos fotos autorizadas durante la construcción; validar contenido JPEG y dimensiones con herramientas disponibles, asociar cada persona a su imagen real y conservar calidad. Sustituir sus valores en `site/data/team.json` por las rutas locales.
   - [ ] En `site/index.html`, usar el helper global cargado por `/lib.js` y sustituir el saneamiento de `TEAM` mediante `safeTeamPhoto(a.photo)`; reemplazar las tres llamadas a `wix(...)` para equipo, selección de negociador y detalle, escapando atributos como hoy. Eliminar `wix` solo si no quedan usos. Para error de carga, ocultar la imagen en cada vista sin ocultar nombre, función ni controles; instalar manejador compatible con la política CSP existente, sin `onerror` inline.
   - [ ] Pruebas: ambas rutas aceptadas, entradas peligrosas rechazadas, cada archivo referenciado existe y decodifica, vista de equipo y selección de negociador y detalle con imagen ausente, y ninguna petición a Wix por fotos de equipo. Mantener alt actuales (`nombre` en tarjeta; vacío para decorativas).
2. **Verificación:** ejecutar `node --test tests/lib.test.js`, `npm test`, `npm run build`, `npm run check:release` y e2e aplicable. Comprobar con navegador 1280/390: recortes, reserva, ficha, teclado, foco, consola y red; usar datos sintéticos. Registrar resultados y actualizar PRE-16 como tramo de fotos solamente tras construir. Cambiar dominio, activar o cancelar servicios y publicar requieren su autorización específica.
