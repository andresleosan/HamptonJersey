# BUS-19 · retencion-mercado-v1 (16-nov-2026)

Referencia `BUS-19/retencion-mercado-v1` que llevan los canales permitidos o solo manuales. Valor por defecto propuesto por Claude por encargo de Luis; Luis puede cambiarlo.

- Se guardan solo datos del anuncio público (URL, precio, operación, dormitorios, parroquia, fechas vistas). Nada de datos personales del anunciante más allá del nombre de la agencia.
- Un anuncio que desaparece de su fuente se conserva 12 meses desde la última vez que se vio (mismo plazo que la limpieza G2) y después se borra.
- Fotos: solo como enlace. No se descargan mientras la fuente no tenga permiso de fotos (SPR-03).
- Cada lector se identifica como `HamptonEstatesBot`, respeta robots.txt y lee como mínimo cada 300 s por canal, una pasada diaria.
