# BUS-19 · Ledger local

## 13-nov-2026 · Revisión documental parcial

- **Entrada:** BUS-23 aceptada por Luis en esta conversación; [registro de aceptación](../BUS-23/registro-aceptacion-BUS-23.json) y sus 14 huellas comprobados. El checklist de GitHub permanece en 60/221 (27,1 %); no se ha comprobado el tablero desplegado.
- **Plan y dependencia:** el plan de cierre exige `BUS-06:source-schema`. La búsqueda de los nombres previstos en `codex/hampton-design-pass` y la copia local `a3cfc90` no encontró el esquema o servicios nominales. No se ha consultado producción ni se descarta otra rama.
- **Trabajo independiente:** protocolo y consultas; condiciones de Rightmove, OnTheMarket, Gaudin y Jersey Insight recuperadas, Broadlands examinado parcialmente y Propertyskipper fallido. No se revisó robots efectivo ni se accedió a inventarios o cuentas.
- **Salida:** revisión documental de 237 registros fuente/ruta para 141 IDs, en JSON/CSV, más manifiesto de huellas. Las seis fuentes con restricciones específicas conservan once filas destacadas; Homely, Meta, Places y Properties conservan sus límites. Cero permisos o lectores activados.
- **Ruling:** el registro es documental, no `SourceAccessDecision`; crear persistencia antes del esquema dueño arriesgaría una segunda autoridad. El riesgo de posponer el código es que ningún control de acceso nuevo queda aplicado; la aplicación no debe tratar la revisión como habilitación.
- **Ruling:** se mantuvieron los 14 registros sin URL y las tres fuentes propuestas sujetas a reconciliación de alias, sin reintentar el CSV histórico cuyo acceso fue rechazado. Riesgo: la cobertura del directorio sigue incompleta.
- **Ruling:** sin cambios de producto ni interfaz se verifican estructura, huellas y restricciones, sin suites de aplicación ni navegador. Riesgo: no se comprueba comportamiento de runtime que no se modificó. Playwright: no aplica.
- **Comprobaciones:** 237 claves únicas; correspondencia JSON/CSV y relevo; políticas heredadas; Homely excluida; Meta y Places/Properties fuera de etapa; Rightmove y OnTheMarket sin habilitación automática; métodos de evidencia y huellas consistentes.
- **Revisión independiente:** confirmó conservación de canales y restricciones, sin permisos ni activaciones. Señaló que los tres registros de JEP no distinguían búsqueda insuficiente de falta de revisión; se corrigieron con fecha y referencia al intento. No revalidó condiciones externas, robots, código o producción.
- **Pendiente:** esquema de BUS-06, integración AGE-04 según dependencia de BUS-06, persistencia y aplicación de políticas, pruebas y revisión efectiva por fuente. Sin commit, publicación, migración ni cambios de producción.
