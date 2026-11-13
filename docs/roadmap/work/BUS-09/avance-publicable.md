# BUS-09 · Normalización parcial

13-nov-2026. Se construyó una normalización pura para observaciones y fichas propias de Jersey, sin lecturas externas ni cambios de datos. Se conservan las cantidades y periodos de origen, los valores monetarios ajenos a la operación permanecen no comparables y las monedas se escalan según sus unidades menores. Una renta anual puede compararse mensualmente sin borrar el original; la ausencia de respuesta sobre mascotas sigue siendo desconocida. Los datos humanos y los de autoridad desconocida no se sobrescriben.

El contrato de fuentes permanece pendiente y no produce definiciones de lectores autorizados. Faltan la integración con el inventario BUS-06, lectores y evidencias específicas de cada fuente, tratamiento operativo de contradicciones y su revisión. Ninguna fuente se ha activado por estas pruebas. BUS-09 sigue parcial.

Verificación antes de integración: 15 pruebas focales de normalización y contratos; revisión independiente con dos hallazgos corregidos mediante pruebas que fallaron y después pasaron. Suite integrada con PUB-09: 1.279 Node y 25 Python; build, release y catálogo correctos. No hay interfaz ni migración nueva.

La prueba existente de Review asumía respuestas en 30 ms y falló bajo carga en ambas suites paralelas; se reemplazó esa suposición por una espera limitada del control o estado real. Pasó aisladamente y en tres ejecuciones concurrentes.
