# Tanda 7 · Estado y orden de construcción

Base GitHub `577965525f5c443320444d642759185eb568e9da` verificada el 10-nov-2026 e integrada en copia local que también contiene decisiones locales de tanda 6. Solo planificación, sin código, migraciones ni configuración externa.

- **ANA-01 actividad agregada:** [plan ya existente](2026-11-10-tp02-ana-01-plan.md), [spec reconciliada](../specs/2026-11-10-tp02-measurement-design.md); sin seguimiento individual, sin duplicar ANA-04/PUB-09/ANA-10. Contrato construible; no configura otros proveedores.
- **ANA-03 tráfico y origen agregado:** [plan actualizado](2026-11-10-tanda7-ana-03-cloudflare.md). Plan de construcción completo con consulta candidata explícita y pruebas; datos reales y activación sujetos a validar consulta, capacidad, permisos y privacidad en cuenta. No se presenta esa comprobación como completada.
- **ANA-04 filtros y tendencias:** [plan actualizado](2026-11-10-tanda7-ana-04-filtros.md), con productor marginal sin identidad y protección de coste/retención antes de activar.
- **ANA-05 etapas verificadas:** [plan existente](2026-11-10-tp02-ana-05-plan.md); conserva la cohorte real, no inventa embudo de visitantes. Los productores de hechos faltantes se muestran como no integrados hasta que existan.
- **ANA-06 tiempos:** [plan actualizado](2026-11-10-tanda7-ana-06-tiempos.md), con horario y festivos previamente confirmados. La integración AGE-05/06/11 requiere hechos reales y constancia de recepción; hasta entonces no se inventan resultados.
- **PUB-17 salud de ficha:** [plan actualizado](2026-11-10-tanda7-pub-17-salud.md), revisión de 30 días con datos reales, sin notificar propietarios ni cambiar precio.

[Diseño común](../specs/2026-11-10-tanda7-analitica-design.md). Orden: ANA-01/04 y ANA-05 calculan por módulos separados; ANA-06/PUB-17 integran cuando corresponda; una sola persona integra `server/routes/insights.js` y `admin/src/Insights.jsx`. ANA-03 se construye desactivada en paralelo sin acceso de cuenta. PUB-09/ANA-10 son dueños únicos de sus contadores. Las pruebas y Playwright corresponden a construcción; no se ejecutan productos por modificar documentos.

Revisión independiente de construcción: se añadió productor manual auditado de recepción a AGE-11; PUB-17 excluye Let agreed y detecta cambios entre páginas; ANA-04 explicita opciones MAX y cobertura incierta; ANA-03 conserva dependencia real de cuenta y esquema.

Aclaración posterior de ANA-03: consulta candidata concreta, filtros/cobertura/fallos y pruebas quedaron definidos; su verificación en la cuenta sigue siendo un requisito de integración/activación, no un hecho ya acreditado.
