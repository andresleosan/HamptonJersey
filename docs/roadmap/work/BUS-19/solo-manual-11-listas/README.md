# Solo manual · 112 canales en 11 listas

Preparado el 26-nov-2026 a partir de los datos guardados en este clon. La primera lista contiene 12 canales y las otras diez contienen 10 cada una. Son 112 canales de 57 fuentes.

Cada tanda de estas listas sigue la [regla de extracción para el archivo de Hampton](../../../../fichas-archivadas.md), incluidas las fotos privadas, las coincidencias con Listings y la comprobación de cobertura por canal.

Consulta el [seguimiento de extracción y archivado](seguimiento-extraccion.md) antes de repetir un canal. El registro se actualiza con cada carga verificada.

Para comprobar si una web ya aportó fichas a Archived, busca su ID en la [checklist de las 237 entradas](../access-review-queue.csv). Las rutas de un mismo dominio comparten el estado de la tanda. El [listado del 26 de noviembre](../canales-archived-2026-11-26.csv) reúne los 46 dominios con fichas identificadas.

Se conserva el orden del estado de fuentes: `source_ref`, después `channel_id`. Cada canal mantiene su identificador y URL; canales distintos de una misma fuente cuentan por separado.

| Lista | Canales | Posiciones |
|---|---:|---|
| [Lista 01](lista-01.md) | 12 | 1–12 |
| [Lista 02](lista-02.md) | 10 | 13–22 |
| [Lista 03](lista-03.md) | 10 | 23–32 |
| [Lista 04](lista-04.md) | 10 | 33–42 |
| [Lista 05](lista-05.md) | 10 | 43–52 |
| [Lista 06](lista-06.md) | 10 | 53–62 |
| [Lista 07](lista-07.md) | 10 | 63–72 |
| [Lista 08](lista-08.md) | 10 | 73–82 |
| [Lista 09](lista-09.md) | 10 | 83–92 |
| [Lista 10](lista-10.md) | 10 | 93–102 |
| [Lista 11](lista-11.md) | 10 | 103–112 |

## Procedencia

- [Estado de fuentes del 25-nov-2026](../estado-fuentes-2026-11-25.json): 45 canales con `access_status: manual_only`.
- [Decisiones del 25-nov-2026](../decisiones-2026-11-25.json): otros 67 canales pasan de `allowed` a `manual_only`.
- [Decisiones del 16-nov-2026](../decisiones-2026-11-16.json): nombres, URLs y motivos anteriores, unidos por `source_ref` y `channel_id`.

Total: 45 + 67 = 112. Los motivos de las 67 reclasificaciones proceden de las decisiones del 25-nov. El Markdown antiguo `canales-no-permitidos-2026-11-16.md` mostraba 42 y no incorpora todas las actualizaciones; no se ha usado como inventario final.

Esta división organiza los registros del clon; no cambia decisiones de acceso ni actualiza la base de datos. No se ha consultado producción ni se han vuelto a revisar las páginas de los canales.
