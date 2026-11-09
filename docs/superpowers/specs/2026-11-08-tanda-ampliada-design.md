> **Nota de vigencia (9-nov-2026):** documento histórico o de planificación. Antes de ejecutarlo, consultar [el índice vigente de Lista 4](../plans/2026-11-09-lista4-tandas-pendientes.md) y las decisiones registradas; no presupone que esté listo para construir ni reactiva tours 3D, redes automáticas, portales o Drive.

# Tanda ampliada · Canales, respaldo y fotos del equipo

8-nov-2026 · Base comprobada `c26cc8e54dce5790b3dfcc642ad854ff7b1f4cf1`. Solo planificación, sin reservas ni conexión. Tours 3D más adelante.

## Alcance común

PUB-03 redes, PUB-15 portales y PUB-16 propagación de estados comparten ficha y revisión, pero cada canal tiene su propia evidencia, errores y estado; publicar en web no implica publicar en otro canal. La ficha existente se publica en `server/routes/listings.js`; cambios de ventas actualizan Under offer/Sold. EST-17 conserva el trabajo de nuevos estados; no crear otra máquina de estados. La regla de disponibilidad de respuestas de agencias aprobada por Luis para ANA-06 no implica automáticamente cambiar el estado público de una ficha. PRE-02 y cuentas reales no están comprobados; no publicar, conectar ni crear cuentas. PUB-15 espera portales y especificaciones reales de Hampton.

Diseño propuesto y aún no aprobado: intención única por ficha/versión/canal y snapshot revisado, sin secretos ni datos privados; una persona aprueba antes de salida. Distinguir preparado, en envío, confirmado, fallido e incierto; nunca reintentar una respuesta incierta sin comprobar proveedor o decisión humana. Reconciliar cambios de estado y versiones con cola o feeds, con evidencia accesible; no diseñar contratos de proveedor inexistentes como si fueran definitivos. Las operaciones de estado y publicación deben seguir siendo independientes si un canal falla.

PRE-14 es un proyecto de respaldo independiente con destino, cifrado, custodia de llaves, retención y restauración por decidir; la exportación contiene datos sensibles y nunca se guarda en Git. Cloudflare documenta [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/) para 7 días en Free y 30 en Paid: comprobar plan y backend reales sin suponerlos. Restaurar sobre D1 es destructivo; ensayos solo en recursos de prueba autorizados. La recuperación de D1 no demuestra respaldo de imágenes R2 u otros servicios.

PRE-16 limita este plan al traslado de fotos de equipo servidas desde Wix. La transición completa del dominio tiene otros requisitos ya documentados. Preservar URLs/alternativas, permisos de imagen, contenido y accesibilidad; no dar de baja Wix ni modificar DNS. Comprobar origen/licencia y activos antes de trasladarlos.

Interfaz de panel: inglés, Montserrat 14px/1.5, Tenor Sans 26px, tarjetas 24px/radio 14px, botones 10px 20px/píldora; ink #141414, fondo #f2efe9, blanco #fff, line #e2ddd4, bronce #8a6a3b, error #a32020. Visibilidad textual de errores e incertidumbre, teclado, foco, contraste, móvil 390 y desktop 1280. Reusar sistema vigente; no introducir rediseño ni dependencias innecesarias. Skills avanzar, brainstorming, grill-me, writing-plans, impeccable, security-best-practices, frontend-security-coder, antislop, web-performance-optimization y ponytail aplican según fase; al construir seguir sus requisitos de configuración y revisión.
