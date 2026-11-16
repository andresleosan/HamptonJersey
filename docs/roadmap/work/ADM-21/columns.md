# ADM-21: columnas de la exportación contable

Rentals › **Accounting export** (`#/rentals/accounting`) descarga un CSV por tipo con
`GET /api/admin/rental-accounting/export?type=charges|payments|statements&from=AAAA-MM-DD&to=AAAA-MM-DD`.

## Formato

- CSV RFC 4180: separador coma, comillas dobles cuando hace falta (`""` dentro), fin de línea CRLF, cabecera en la primera fila.
- UTF-8 **sin** BOM (el plan no lo pide; todas las columnas son ASCII salvo texto ajeno improbable en `tenancy_ref`).
- Fechas ISO `AAAA-MM-DD` (días de Jersey). Importes enteros en **peniques**, siempre ≥ 0; el signo lo da `direction`.
- Texto ajeno que empiece por `=`, `+`, `-`, `@`, un carácter de control o espacios seguidos de uno de ellos lleva un
  apóstrofo delante (`'=…`) para que una hoja de cálculo no lo ejecute como fórmula. Los números del sistema no lo llevan.
- Rango inclusivo de hasta 366 días que termina hoy como tarde. Más de 50.000 filas o 16 MB: error 413, nunca se recorta.
  Un importe por encima de 100.000.000 peniques (1 millón de libras) en una fila: error 422 y no se descarga nada.
- Cada archivo se lee en una sola transacción de D1: es un corte coherente. Repetir la exportación sin cambios da los
  mismos bytes. Exportar no marca nada como enviado, pagado ni exportado.
- Nunca salen descripciones bancarias, nombres, correos, teléfonos, direcciones ni cuentas.

## Columnas (en este orden, `schema_version` = 1)

| Columna | Contenido |
|---|---|
| `schema_version` | `1`. Cambia solo si cambian estas columnas o su significado. |
| `record_type` | `rent_charges`, `rent_adjustments`, `rent_payments` o `landlord_statement_lines`. |
| `record_id` | Identificador estable de la fila (ver abajo). |
| `tenancy_ref` | Referencia de pago del contrato (`HE-T0001`, la que muestra el panel); vacío en un pago sin asignar; en liquidaciones, la del propietario `HE-L` + su id con 4 cifras. |
| `date` | Fecha contable de la fila (ver abajo). |
| `kind` | Subtipo (ver abajo). |
| `currency` | `GBP`. |
| `amount_pence` | Importe en peniques, entero ≥ 0. |
| `direction` | `debit` o `credit` (ver abajo). |
| `related_id` | Fila o elemento relacionado, o vacío. |
| `revision` | Contratos: `financial_revision` del contrato en el momento de exportar (1 en un pago sin asignar). Liquidaciones: número de revisión cerrada. |
| `supersedes` | Solo liquidaciones: el `record_id` de la línea equivalente de la revisión cerrada anterior a la que sustituye; vacío en la revisión 1 y en el resto de tipos. |

## Tipos

### `type=charges` → `rent_charges` y `rent_adjustments` (libro del inquilino)

| record_type | record_id | date | kind | direction | related_id |
|---|---|---|---|---|---|
| `rent_charges` | `charge-<id>` | vencimiento (`due_on`) | `rent` o `opening` (saldo inicial) | `debit` | vacío |
| `rent_adjustments` | `adjustment-<id>` | fecha efectiva | `writeoff` | `credit` | `charge-<id>` del cargo que reduce |
| `rent_adjustments` | `adjustment-<id>` | fecha efectiva | `reversal` | `debit` | `charge-<id>` del cargo |

Un write-off (ADM-09) **no es dinero cobrado**: nunca aparece en `rent_payments`. El mismo día, los cargos van antes que los ajustes. Los ajustes solo salen con
`ADM09_ARREARS_READY`, igual que en el panel. Antes de leer se crean los cargos de alquiler que falten, como hace Rentals.

### `type=payments` → `rent_payments`

| record_id | date | kind | direction |
|---|---|---|---|
| `payment-<id>` | fecha de recepción | `rent`, `deposit` u `other` | `credit` |

Incluye los pagos sin asignar (`tenancy_ref` vacío). Para un contrato, la suma de `debit` menos `credit` de sus cargos,
ajustes y pagos `rent` desde el principio hasta hoy es la deuda que muestra el panel.

### `type=statements` → `landlord_statement_lines` (libro del propietario)

Solo liquidaciones **cerradas** (`statement_runs`) y, de cada propietario y mes, la **última revisión cerrada** (la que
muestra Statements), leída de su instantánea congelada: una corrección posterior no cambia la exportación hasta que se
cierra la revisión siguiente, que sale con su número en `revision`, otros `record_id` e importes completos (no la
diferencia). Se incluye el mes cuyo último
día cae dentro del rango; `date` es ese último día.

| kind | record_id | direction | related_id |
|---|---|---|---|
| `rent` | `statement-<run>:rent:<rental>` | `credit` | `rental-<id>` |
| `fee` | `statement-<run>:fee:<rental>` | `debit` | `rental-<id>` |
| `repair` | `statement-<run>:repair:<repair>` | `debit` | `rental-<id>` |
| `gst` | `statement-<run>:gst` | `debit` | vacío |
| `net` | `statement-<run>:net` | `credit` (o `debit` si es negativo) | vacío |

`net` es una línea de control (= `rent` − `fee` − `gst` − `repair` de esa revisión): no se suma con las demás. Las
líneas con importe 0 no salen, salvo `net`. Los depósitos y otros cobros, y el alquiler dado por perdido del mes, quedan
fuera como en Statements (los write-offs están en `type=charges`).

**Revisiones: no contar dos veces.** Cada línea de una revisión nueva indica en `supersedes` la línea equivalente (mismo
`kind` y misma vivienda o reparación) de la revisión cerrada anterior. Una línea que la anterior tenía y la nueva ya no
sale a 0, antes de `net`, para sustituirla también. **Al importar una revisión nueva, anula la que indica `supersedes`**:
así cada línea de la revisión anterior queda sustituida por exactamente una de la nueva. Si la revisión anterior se
borró (datos personales), se usa la más reciente que quede.

## Compatibilidad

CSV genérico con cabecera, coma, fechas ISO e importes enteros: se importa en programas contables y hojas de cálculo
que aceptan un CSV con columnas a elegir (por ejemplo, la importación genérica de Xero, QuickBooks o Sage, o Excel con
«Datos › Desde texto/CSV»). Comprobado con el lector CSV de Python y el de la app (`parseCsv`), no con un programa
contable real: el formato concreto del destino se adapta cuando Hampton diga cuál usa.
