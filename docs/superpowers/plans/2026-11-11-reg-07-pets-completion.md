# REG-07 · Completar mascotas imprescindibles

El commit `fe9618f` publicó la corrección de mascotas desconocidas y REG-06. La revisión de cierre detectó que el plan vigente de REG-07 también exige que mascotas declaradas sean imprescindibles, sin interruptor que las rebaje. Se completa ese alcance en la misma tarea; no se crean registros reales ni se añade una migración.

- [x] La web y el panel explican que las mascotas declaradas deben ser admitidas; quitar la opción de rebajarlas, conservar cantidades, ausencia y respuesta desconocida, y mantener el control de parking independiente.
- [x] El servidor y el matching tratan una mascota declarada como imprescindible incluso con clientes o registros antiguos que indiquen `preferred`; preservar los demás datos y las búsquedas legacy sin inventar prioridades.
- [x] Una negativa inequívoca de mascotas excluye el inmueble; con condiciones desconocidas el criterio de mascotas queda por confirmar y otros criterios pueden determinar el resultado global. Conservar decisiones de Shortlist/Rejected durante recálculos y no enviar consultas automáticas.
- [x] Pruebas de regresión de contrato, formularios, guardado y coincidencias; suite, build, comprobaciones y navegador local aislado a 1280/390 y zoom 200 %, con revisión independiente.
- [x] Actualizar checklist, ESTADO y este ledger con la evidencia real; publicar la entrega autorizada, comprobar GitHub, despliegues y smoke público de solo lectura. El panel autenticado de producción solo se declara verificado si se prueba con sesión autorizada.

La clasificación se añade al motor existente que utiliza BUS-12; no se afirma completar las demás capacidades de BUS-12, BUS-15 o AGE-03.

## Verificación local

- Suite final: 1.163 pruebas JavaScript y 14 Python; build, check:release, team:check y check:packages correctos.
- WebKit aislado sin red pasó el recorrido de zonas y mascotas en 1280/390, teclado y zoom nativo superior al 200 %, incluida la visibilidad del foco; se corrigió el solapamiento de la navegación en anchos efectivos muy estrechos.
- Revisión independiente de matching, historial y privacidad: se incorporaron los casos de evidencia contradictoria o malformada, la versión de propiedad en Shortlist y el bloqueo de parámetros en el smoke público.
- Al terminar la verificación local quedaban pendientes la publicación y su comprobación; se completaron según el apartado siguiente. La verificación autenticada del panel y los envíos en producción no se han realizado.

## Publicación verificada

- El commit `e589b167177f4ac6b1511858cbf4af15aa0f38a5` está en main y contiene la corrección y la regla revisada. No requirió migración adicional. Cloudflare Pages y Workers Builds `hampton-jobs` terminaron correctamente.
- `E2E_PROD_EXPECT_REG06=1 E2E_PROD_EXPECT_REG07=1 npm run test:production:readonly` comprobó las opciones de zona y la interfaz de mascotas en WebKit aislado a 1280/390, sin enviar el formulario. Las solicitudes interceptadas solo permiten GET/HEAD de rutas y origen autorizados, sin parámetros; el contenedor no se presenta como cortafuegos general de red.
- El panel autenticado y el guardado se comprobaron localmente con datos sintéticos, no en producción. BUS-15/AGE-03 y el resto de BUS-12 siguen siendo trabajos separados.
