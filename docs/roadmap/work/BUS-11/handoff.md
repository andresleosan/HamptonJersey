# BUS-11 · Relevo para revisión

Este relevo deja siete dudas concretas pendientes y confirma que una de las propuestas ya tenía ID en BUS-23. [cases.json](cases.json), [findings.json](findings.json) y [directory-delta.json](directory-delta.json) son documentos de trabajo: las ocho entradas del delta indican `no_change`, no crean fuentes, no fusionan entidades y no autorizan acceso. Los IDs desconocidos quedan `null`; no se inventan identidades.

Para continuar, el responsable debe revisar primero la decisión y condiciones vigentes **por dominio, canal, método y finalidad**, y después contrastar únicamente los huecos para los que exista un método explícitamente permitido. Si el método es restringido o la evidencia de autorización no está disponible, mantener la tarea manual; no contactar personas, crear cuentas ni saltar barreras por defecto. En particular, la condición específica de `src-quemard-estates`, la propuesta no integrada `src-accommodation-centre-jersey`, la aplicación no instalada y los canales sociales requieren sus revisiones respectivas. BUS-19 conserva la decisión de acceso; BUS-20 mantiene su propio alcance.

Las fuentes ya identificadas conservan sus IDs. Una propuesta de `alias` o `correct` requiere una evidencia posterior trazable que demuestre la relación concreta; compartir una web o un nombre no basta. Si aparece evidencia para una fuente nueva, comprobar antes los aliases por una vía autorizada y crear una propuesta revisable, nunca una activación. No se cambia la base original ni se ejecuta su pipeline.

La aceptación de BUS-11 sigue pendiente. El plan permite conservar casos manuales sin resolver si sus límites y próximos pasos son explícitos: hay que confirmar si existe algún contraste permitido que aún pueda hacerse y revisar independientemente evidencia y límites antes de aceptar el relevo. BUS-06, BUS-19 y las tres investigaciones aceptadas conservan sus estados y restricciones. El historial de accesos de esta sesión consta en [access-log.md](access-log.md).

## Validación documental

Se validaron los cuatro JSON, ocho IDs de caso únicos, correspondencia caso/evidencia/delta, los ocho `no_change`, fechas, fuentes existentes y huellas/filas de los insumos aceptados. Se comprobaron 14 enlaces locales y la presencia de las tres URL históricas en la evidencia aceptada. No se verificó por red la disponibilidad actual de esas URL; los intentos de esta sesión constan aparte. No aplica ejecutar pruebas de aplicación o navegador para estos documentos.
