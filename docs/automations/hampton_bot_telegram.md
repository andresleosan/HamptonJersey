# hampton_bot_telegram · Hampton Bot por Telegram para Luis

- **Id:** `hampton_bot_telegram`
- **Estado:** prevista — bloqueada por PRE-32 o una clave de API con acuerdo de datos.
- **Tarea dueña:** AUT-16
- **Propósito:** que Luis pregunte desde sus dos cuentas por fichas publicadas y chats en espera y reciba números, referencias y enlaces.
- **Disparador:** previsto: un mensaje privado de una de las dos cuentas de Luis.
- **Entradas y clase de datos:** previsto: solo datos públicos (C0) y contadores; el portero descarta reenvíos, adjuntos y mensajes con emails o teléfonos antes del modelo.
- **Salidas y efectos:** prevista: respuestas con referencias, títulos, precios y enlaces de la web; nunca datos de personas.
- **Guardas humanas y modo:** un mensaje de Telegram nunca cuenta como aprobación; aprobar y reanudar, solo en el panel. Modo: desconocido.
- **Interruptor:** desconocido.
- **Coste y límite:** desconocido; coste en dinero `null`.
- **Código:** ninguno
- **Pruebas que la cubren:** ninguna
- **Criterio de hecho:** según AUT-16, Luis pregunta desde sus dos cuentas y recibe solo números, referencias y enlaces; otra cuenta no recibe nada; el portero para reenvíos, adjuntos y teléfonos.
