# F1 · lectura segura del almacén QA de este PC

Propuesta local: no ejecutada con identidad. La autorización anterior F ya
permitió insertar la fila queues y publicar QA; no repetir esas operaciones.
El deployment verificado es 28800bf7-eb1c-48ab-8e03-d8ee03ba57fb, con el artefacto
aprobado d4b2a57bd3036efc1718396d68edfb3912d59f8e35a2cd4dae765e8c6d43c30b.

La primera llamada del launcher se detuvo en path-reparse antes de leer valores
o ejecutar el proceso de pruebas. Diagnóstico posterior solo de metadatos:

1. Python recibe como home un alias de perfil que es una junction de Windows.
   Se normaliza únicamente ese alias del perfil actual y se añade la ruta fija
   HamptonQA/full-app-access. No se admiten rutas privadas arbitrarias.
2. Esa carpeta tiene propietario actual, ACL protegida y una única regla Allow
   del propietario. Sus tres archivos también solo permiten ese propietario;
   heredan la regla segura de la carpeta protegida. El launcher F exigía además
   ACL protegida sin herencia en cada archivo y en el abuelo HamptonQA, lo que
   rechaza un almacén con permisos efectivos correctos.
3. Windows PowerShell 5 no carga el módulo Security en el entorno recibido de
   PowerShell 7 de este proceso. La corrección usa pwsh.exe instalado en este PC,
   sin perfil ni interacción, para las comprobaciones de ACL.

F1 **no cambia ACL, propietarios, archivos de secretos, variables de perfil,
contenedores, red ni artefacto publicado**. Usa la carpeta canónica del perfil
actual, comprueba que corresponde al mismo almacén ya existente y
rechaza reparse points en ella, sus archivos y todos sus ancestros. La carpeta
privada debe continuar protegida y todos los propietarios/reglas deben seguir
siendo del usuario actual; se rechaza cualquier otro principal o Deny. En los
archivos se admite herencia solamente dentro de esa carpeta privada protegida.

El script original F y sus 55 archivos sellados permanecen sin modificar.
host.py comprueba el hash original del launcher antes de importarlo, y verifica
la propuesta F completa, ambos árboles de artefactos y el paquete ya montado.
Reutiliza las funciones originales de bloqueo, inventarios, revisión E1, lectura
de archivos regulares, entrega por stdin al ID sellado, parada verificada ante
incertidumbre y limpieza por identidad de archivo. No añade monkeypatches ni
una vía nueva de sesión, SQL, despliegue o acceso a producción.

Solo con sí escrito para la huella F1 se ejecutará el mismo smoke aprobado,
con qa-agent@example.test y el mismo runner. Mantiene la parada del único ID
sellado ante timeout/resumen incierto y el sentinel que impide reintentos.

La auditoría de metadatos reales ya pasa sin leer valores. Las pruebas usan
archivos vacíos/ficticios temporales de Windows: prueban herencia segura,
rechazo de lectores extra, carpeta privada abierta y fallos antes de leer valores.
El estado publicado se conserva; el smoke autenticado sigue pendiente.
