# Tanda 6 · estado de planificación

Base GitHub `47dab2c17b1b235a3a3332862d68b72a51115f71`, verificada el10-nov-2026. Solo documentos locales; no código, migraciones, datos reales, campañas, distribución ni publicación.

## Decisiones y antecedentes

Luis confirmó formulario de propietarios para venta/alquiler con nombre, teléfono, correo, dirección completa y casilla de valoración; tarea en Inbox. Para las cifras públicas eligió contar **contactos registrados** y rotularlos como tales, sin afirmar personas físicas únicas. Se mantiene umbral5 y prevención de deducciones.

A petición de Luis se buscaron planes en el proyecto y copias locales. Sí existe [PUB-20 · Folleto parroquial con QR y conteos agregados](/tmp/hampton-list2-publish-o82mowjt/docs/superpowers/plans/2026-11-10-tp02-pub-20-plan.md), con diseño de redirección y conteo por día. Es un archivo no rastreado en esa copia, no se encontró en GitHub main; no se encontró implementación de QR en código. Reconciliación aquí conserva una sola campaña, endpoint y contador; el plan anterior es antecedente y no se ejecuta como sistema paralelo. También se encontró [ANA-10 anterior de atribución](/tmp/hampton-list2-publish-o82mowjt/docs/superpowers/plans/2026-11-08-ana-10-typed-contact-acquisition-source.md), alcance distinto al conteo agregado.

## Planes

- [PUB-10 · Registro y valoración](2026-11-10-pub-10-registro-propietarios.md): contrato de construcción, con PRE-03/PRE-09 como condiciones de activación.
- [PUB-19 · Demanda por parroquia](2026-11-10-pub-19-demanda-propietarios.md): conteo de contactos y controles de divulgación; revisión de privacidad y pruebas de datos son requisitos para activar.
- [PUB-20 · Folleto y QR](2026-11-10-pub-20-folleto-qr.md): único sistema reconciliado con plan previo.
- [ANA-10 · QR agregado](2026-11-10-ana-10-qr-agregado.md): contrato confirmado para redirecciones de folletos. El alcance original adicional de atribución individual/carteles no fue confirmado; no declarar ese alcance construido, descartado ni aprobado por esta entrega.
- [Diseño compartido](../specs/2026-11-10-tanda6-propietarios-design.md).

La revisión independiente se enfocó en idempotencia/Inbox, privacidad de cifras, snapshot y ruta QR; hallazgos corregidos en planes. Las pruebas de aplicación, impresión, lectura real del código y condiciones externas se ejecutan al construir y activar; no se han ejecutado en esta entrega. No ejecutar pruebas de producto artificiales solo por cambiar documentos. La propuesta de QR antiguo conservada fuera del repositorio no se copia ni se modifica; el contrato vigente de esta tanda es autocontenido.
