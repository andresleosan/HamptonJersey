# Revisión independiente de seguridad de F1

Fecha: 2026-11-10. Resultado: **sin hallazgos materiales en la corrección revisada**. F1 es apta para preparar y someter a aprobación su manifiesto propio; este informe no autoriza ejecutar el smoke ni acredita su resultado.

## Alcance y evidencia

Revisión de `runner-correction-f1/host.py`, su README, las siete pruebas F1 y los controles reutilizados de `publish/runner_host.py`. Se aplicó la skill `security-best-practices`; sus referencias disponibles no incluyen una guía específica de Python para ACL de Windows, por lo que las conclusiones se basan en código y pruebas observables de este alcance.

Comprobaciones independientes:

- HEAD: `80ad03df7e095750f455aa4aa668573e9aac5db4`.
- SHA-256 de F original: `be67091b22cd5bdcab7d8dd7a91e5d5d6cd8cfbfed0e5011245049ccc6d37f96`.
- Los **55 archivos sellados originales** mantienen tamaño y SHA-256: cero discrepancias.
- Launcher original: `7b272e49eb63aaabb515f16e539336716bdfdb226dc6dbb913e11d6fe829a529`.
- `python -m unittest discover -s tests -p test_full_app_qa_runner_f1.py -v`: **7 pruebas, OK**, exit code 0. Las pruebas de ACL usan archivos ficticios temporales de Windows. La prueba del sentinel llama al flujo con manifiesto, runtime y auditoría sustituidos y se detiene antes de cargar valores o lanzar procesos del runner.

No se leyeron archivos privados reales ni se ejecutaron operaciones Docker, Cloudflare, SQL o smoke. No se ejecutó la operación CLI `execute` de F1. Tampoco se repitió la auditoría del almacén real: el PASS previo de metadatos comunicado por el implementador queda fuera de esta evidencia independiente.

## Controles revisados

1. **Ruta canónica y mismo almacén.** `host.py:13` resuelve estrictamente solo el perfil actual y después añade `HamptonQA/full-app-access`; no resuelve ni acepta junctions de la carpeta QA o sus archivos. `host.py:14` fija el alcance lógico `canonical-current-user-profile/HamptonQA/full-app-access`, que el manifiesto debe reproducir exactamente (`host.py:56`); no permite elegir otra ruta privada. `host.py:65-67` rechaza reparse points en la ruta canónica y sus ancestros y exige igualdad con `PRIVATE` y `samefile` con el almacén del perfil. La lectura usa exclusivamente `PRIVATE` (`host.py:80`). El README refleja este alcance sin publicar el nombre local del perfil. No se cambia el perfil ni se copia un secreto a otra ubicación.

2. **Límite de ACL.** `host.py:22-37` comprueba carpeta y tres archivos antes de leer valores. Exige propietario actual, al menos una ACE, solo Allow del SID actual y DACL protegida en la carpeta privada. Aceptar herencia en archivos conserva ese límite: todas sus ACE efectivas también deben pertenecer al mismo SID. No exige proteger el abuelo, que no contiene los secretos directamente, ni altera permisos. Las comprobaciones siguen fallando ante carpeta privada abierta, lector adicional, error de ACL o reparse point. Las pruebas reales de fixtures confirman aceptación de la herencia segura y rechazo del lector adicional/carpeta abierta.

3. **Aprobación independiente de F1 y conservación de F.** `host.py:50-59` exige el SHA-256 explícito del nuevo manifiesto, verifica sus archivos y exige incluir host y pruebas F1; después carga F con la huella original fija y sus inventarios. `host.py:16-19` comprueba la huella del launcher original antes de importarlo. No se encontró monkeypatch en F1; los mocks pertenecen a las pruebas.

4. **Runtime y entrega de identidad.** `host.py:74-84` reutiliza el bloqueo exclusivo, la verificación del paquete montado y del runtime E1, y el launcher original. Conserva el ID de contenedor sellado y la entrega de valores solo por stdin al comando original. La corrección no introduce comandos de publicación, importación SQL o sesión alternativa.

5. **Incertidumbre y reintentos.** `host.py:78-87` conserva el sentinel previo a cargar secretos, su creación exclusiva y la limpieza por identidad de archivo. Un fallo incierto del launcher sigue usando la parada y comprobación del único ID sellado del original; al propagarse la excepción, el sentinel queda presente. Los valores se limpian del diccionario en `finally` una vez cargados. La prueba del sentinel confirma rechazo antes de cargar valores.

6. **PowerShell.** El cambio explícito a `pwsh.exe` mantiene argumentos separados, `-NoProfile`, modo no interactivo, comando codificado y salida limitada a un booleano. No se imprimen ACL, contenido privado ni errores que incluyan valores.

## Límites y condición para continuar

La revisión no sustituye la aprobación de una huella F1 concreta. El manifiesto final deberá sellar exactamente los archivos presentados, incluido este informe si se utiliza como evidencia, y volver a comprobarse antes del smoke. La ejecución autenticada, el estado actual del runtime y el PASS de la aplicación siguen pendientes.

Las comprobaciones de rutas, ACL y lecturas se realizan por pasos, como en el launcher original; no ofrecen una garantía frente a un proceso concurrente bajo la misma identidad capaz de cambiar el código, ACL o archivos durante la ejecución. Este alcance conserva la confianza en el host y la cuenta local existentes. No se detectó una ampliación de acceso a otro principal en la corrección propuesta.
