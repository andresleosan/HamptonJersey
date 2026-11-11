# PUB-02 · Construcción local — 12-nov-2026

Base `3cd38319d420b99d5f53396c02d1b2d130286ebc`, rama `codex/pub-02-local`. Sin commit, push, despliegue ni acceso a datos reales en esta construcción.

La transición compartida valida título, operación y foto pública elegible desde datos guardados; repite versión, estado, mínimos y límites de Queue en la escritura. La foto sin clave, privada, externa o de otro tipo no es elegible. Las recomendaciones y el 100 % no bloquean; el precio privado es válido. Las fichas históricas no se modifican automáticamente. El editor bloquea publicar con cambios sin guardar y el panel conserva el aviso de una ficha publicada que pierde su última foto.

Revisión independiente detectó tres hallazgos: aprobación de Queue no atómica, descarte que podía borrar una publicación concurrente y clave de foto vacía. Se corrigieron y se añadieron regresiones. El cierre de Queue y la escritura de ficha/evento ahora comparten batch D1; el descarte reclama la cola dentro del mismo batch y aborta antes de borrar si perdió la carrera. Se repite la condición de Queue en la publicación normal.

Se corrigió también `requires: implementation` de PUB-02, introducido en la reconciliación anterior de PUB-12: el validador solo admite `integrated`. No se ha publicado todavía esta corrección documental.

Pruebas: 1.206 JavaScript y 14 Python aprobadas; 10 pruebas focales de publicación, carreras y Queue; WebKit aislado 1280/390 con error por foto, interruptor, cambios sin guardar, teclado, éxito y zoom CSS 200 %. El mismo recorrido en D1 local forzó un fallo de Queue y comprobó rollback de ficha y cola antes de una aprobación exitosa. Build, check:release, team:check y check:packages aprobados. Los casos con adaptador SQLite no prueban concurrencia en D1 remoto. El zoom CSS no equivale al nativo; no se probaron sesiones ni datos de producción.

Recorrido general WebKit: public y urls pasaron; admin llegó a un timeout en el tour y reg17 no llegó a ejecutarse. La copia limpia base reprodujo el mismo timeout. Se identificó una posible diferencia en la simulación de conexión del fixture auxiliar; una repetición exploratoria de admin y reg17 se detuvo tras varios minutos sin resultado. El ajuste exploratorio no se conserva y no se afirma que el recorrido pase. Pendiente: completar esa validación, autorización de integración y publicación, y verificación posterior. El estado sigue parcial y el porcentaje público no cambia hasta la publicación y el cierre documentado.


## Publicación autorizada

Luis autorizó integración y despliegue con el recorrido general pendiente. `6dfdbdaf5af1b460dd03696b111205c4e3a68d69` se integró en main sin forzar; Cloudflare Pages y Workers Builds: hampton-jobs terminaron correctamente. WebKit anónimo de solo lectura pasó 1280/390 en la web pública, sin enviar formularios. Una solicitud directa desde el VPS recibió 403; no acredita un fallo funcional ni una verificación autenticada. No se realizaron migraciones ni publicaciones de fichas reales. La prueba general de panel permanece incompleta por el timeout previo de tours descrito arriba; el recorrido focal y D1 local sí pasaron.
