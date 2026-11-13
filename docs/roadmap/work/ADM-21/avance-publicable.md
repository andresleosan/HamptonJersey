# ADM-21: avance parcial

El codificador CSV puro transforma filas sintéticas de tipos cerrados, con importes enteros en peniques, escape CSV y protección ante fórmulas. Se revisó independientemente y se cubrió con pruebas sintéticas. No obtiene datos, no implementa permisos ni expone descargas.

Antes de conectarlo se requieren la autoridad financiera ADM-09 y el snapshot cerrado ADM-10; también hay que comprobar el límite de importes para liquidaciones, limitar el tamaño total o usar streaming y verificar la compatibilidad con el programa contable elegido. El prefijo de protección modifica el texto exportado. La tarea sigue pendiente.
