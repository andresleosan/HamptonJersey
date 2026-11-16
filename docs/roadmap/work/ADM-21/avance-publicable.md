# ADM-21: avance

Construido el 16-nov-2026: Rentals › Accounting export descarga en CSV los cargos con sus write-offs y reversiones
(ADM-09), los pagos recibidos y las liquidaciones cerradas (ADM-10, última revisión, desde su instantánea), con el
codificador puro (peniques, escape y protección ante fórmulas). Descarga GET solo con sesión del equipo y del mismo
origen, sin caché; rango de hasta 366 días, 50.000 filas y 16 MB, por encima se rechaza sin recortar. Columnas en
[columns.md](columns.md).

Falta publicarlo y descargar un rango real en producción. La compatibilidad se comprobó con lectores CSV estándar, no
con un programa contable concreto: el formato se adapta cuando Hampton diga cuál usa. El prefijo de protección modifica
el texto exportado que empiece por `=`, `+`, `-`, `@` o un carácter de control.
