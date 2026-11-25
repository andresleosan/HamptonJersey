# PRE-02 · Guía del trámite de Meta: Messenger de la página → panel del equipo

Con esta guía, cualquier persona podrá escribir por Messenger a la página de Facebook de la inmobiliaria y el
equipo le contestará desde el panel (Messages › Facebook). Son 5 tramos (0 a 4) y 71 pasos tuyos (35 + 11 + 22 + 3;
el tramo 0 no tiene pasos tuyos). Antes de empezar hace falta tu Facebook personal con su móvil y su correo a
mano y el terminal del VPS por SSH; para el tramo 2, además, que /avanzar te confirme que el tramo 0 está hecho.

Fecha de la documentación de Meta: 25-nov-2026. Estado de la guía: escrita con la documentación oficial; **ningún
paso se ha ejecutado todavía contra Meta ni contra Cloudflare**.

---

## Cómo leer esta guía

- Los pasos se te dan de uno en uno por el chat. Esta guía es la referencia completa.
- Cada paso dice dónde se hace (📍), qué hacer, qué deberías ver (entre comillas « ») y qué hacer si ves otra cosa.
- Lo que va en un recuadro de código y está en el terminal se pega tal cual en el terminal. Lo que hay que pegar
  en Meta lleva delante el rótulo **PEGAR EN META**.
- Los nombres de pantallas y botones van en inglés, como los escribe Meta en su documentación. Tu pantalla puede
  estar en español o llamarse distinto: si no coincide, **no improvises**; copia en el chat lo que ves.
- Las referencias [F1], [S3] remiten a la tabla «Fuentes» del final. Las F están verificadas el 25-nov-2026; las
  S están sin verificar y el propio paso dice qué hacer si no se cumplen.
- Valores que tienes que poner tú: van marcados así, <ASI>, y el paso dice qué poner y de dónde sale.

### Reglas de secretos (el repositorio es público)

- El App Secret, los tokens y la clave de verificación **nunca** se pegan en el chat, en un correo ni en un
  archivo del repositorio. Tampoco deben verse en el vídeo de la revisión.
- En esta guía los secretos solo pasan por dos sitios: el aviso oculto del terminal (no se ve lo que pegas) y
  Cloudflare. Si un secreto se te escapa a otro sitio, dilo en el chat y mira la sección «Deshacer».
- **Aviso:** la forma habitual es pegar cada valor en el aviso oculto que abre wrangler. Esta guía se aparta
  de eso en los pasos 13, 17 y 30 a 32: el App Secret y los tokens se guardan un rato en la memoria del
  terminal y se entregan a wrangler desde ahí, porque Meta obliga a usar el App Secret en el terminal para
  el canje y porque el token es demasiado largo para copiarlo de la pantalla [S22]. Si prefieres la forma
  habitual, dilo en el chat antes del paso 30.
- Los identificadores (App ID, Page ID) no son secretos, pero tampoco se escriben en el repositorio.

### Reparto

| Quién | Qué hace |
| --- | --- |
| Tú | Todo lo que exige tu sesión de Facebook, los secretos y las decisiones. |
| /avanzar | Tramo 0; publicar después de tus secretos; encender «responder desde el panel»; la página fija de privacidad; preparar el acceso del revisor. Siempre con tu «sí». |
| La inmobiliaria | Dar acceso total a su cuenta de empresa (si no lo tienes), datos legales, documentos y recibir el código de la verificación. |

---

## Tramo 0 — Lo que hace /avanzar antes de que empieces (sin pasos tuyos)

Solo con tu «sí», /avanzar hace tres cosas:

1. Genera la clave de verificación (META_VERIFY_TOKEN). **No la da Meta**: la inventa /avanzar, la carga en
   Cloudflare y deja una copia en un archivo privado del VPS, /root/.hampton-meta-verify-token. Tú solo la lees
   cuando Meta te la pida (paso 40).
2. Enciende la entrada de mensajes de Facebook en la app. Sin esto, la dirección del webhook no existe y Meta la
   rechaza.
3. Publica en el aviso de privacidad de la web el párrafo sobre los mensajes de Facebook.

**Cómo sabes que está hecho:** /avanzar te lo confirma en el chat. Si no lo ha dicho, pregúntale «¿está hecho el
tramo 0 de Meta?» antes del paso 36. Los pasos 1 a 35 no dependen del tramo 0: **puedes empezarlos ya**.

**Lo que contesta la dirección del webhook** (lo comprobarás tú en el paso 38):

| Respuesta | Significa |
| --- | --- |
| 200 y el número de prueba | Todo bien: Meta podrá verificar la dirección. |
| 404 | La entrada de mensajes está apagada (falta el tramo 0 o su despliegue). |
| 503 | Falta un secreto o todavía no ha habido despliegue. |
| 403 | La clave de verificación no coincide. |

---

## Tramo 1 — Rápido, tuyo: accesos, app, página y tres secretos (pasos 1 a 35)

Se hace en una sentada de una hora larga. El token del paso 16 caduca en una o dos horas [F10]: de ahí al paso
23 no hagas pausas largas.

### Paso 1 — Comprueba si entras tú en la cuenta de empresa de la inmobiliaria y si la página está dentro

📍 Navegador — business.facebook.com (Meta Business Suite), con tu Facebook personal iniciado.

Este paso solo mira; no cambia nada. Abre esta dirección:

https://business.facebook.com/settings

En el menú de la izquierda mira dos cosas:

- **«People»** (Personas): busca tu propio nombre y lee qué acceso pone a su lado.
- **«Pages»** (Páginas), dentro de «Accounts» (Cuentas): mira si está la página de Facebook de la inmobiliaria
  (https://www.facebook.com/hamptonestatesjsy/).

**Deberías ver — Rama A, «tengo acceso»:** arriba, el nombre de la cuenta de empresa de la inmobiliaria; en
«People», tu nombre con «Full access» (en algunas pantallas «Full control», «Admin» o «Acceso total») [F5]; y en
«Pages», la página de la inmobiliaria [F6]. Contesta en el chat «Rama A» y sigue con el paso 2.

**Si ves otra cosa — Rama B, «lo lleva la inmobiliaria»:** es Rama B si pasa cualquiera de estas tres cosas:
(1) no te sale ninguna cuenta de empresa, o la que sale es tuya o de otro negocio; (2) tu nombre no aparece en
«People» o pone un acceso parcial; (3) la página no aparece en «Pages». No toques nada. Contesta en el chat
«Rama B» y cuál de las tres viste. Lo siguiente es de la inmobiliaria: mira el recuadro de abajo.

Si al entrar Meta te exige la verificación en dos pasos de tu Facebook, es que esa cuenta de empresa la pide a
sus miembros [F48]: actívala como te indique la pantalla y vuelve a abrir la dirección.

Dato sin verificar [S13]: el nombre exacto del apartado «People» no se ha visto en pantalla. Si el menú se llama
de otra forma, busca el apartado donde salen las personas con acceso.

> **Solo si saliste por la Rama B.** Pídele a la persona de la inmobiliaria que tiene acceso total a su cuenta
> de empresa una de estas dos cosas, y después repite el paso 1:
>
> - **Opción recomendada:** que invite a tu cuenta de Facebook con «Full access» (Settings › People › «Invite
>   people» [S13]) y, si la página no estaba en «Pages», que la añada (Settings › Pages › «+ Add» › «Add an
>   existing Facebook Page») [F6]. Con eso haces tú todo el trámite.
> - **Si prefiere no darte acceso total:** esa persona hace los pasos que lo exigen (paso 5, elegir su cuenta de
>   empresa al crear la app, y los pasos 47 a 53, la verificación del negocio) y a ti te da el acceso parcial
>   «Apps and integrations» [F5] y acceso completo a la página. Este camino es más lento y tiene un punto sin
>   verificar [S14]: díselo a /avanzar antes de seguir.

### Paso 2 — Regístrate como desarrollador de Meta

📍 Navegador — developers.facebook.com, con el mismo Facebook del paso 1.

Abre esta dirección y completa el registro: acepta los términos con «Next», confirma los códigos que Meta manda
a tu móvil y a tu correo, y elige una ocupación [F4].

https://developers.facebook.com/async/registration

**Deberías ver:** al terminar, la página de desarrolladores con tu sesión iniciada, ya sin pedirte el registro.
**Si ves otra cosa:** si te dice que ya estás registrado, perfecto: sigue. Si no llega algún código, no lo
intentes más de dos veces seguidas; dilo en el chat.

### Paso 3 — Crea la app: pantalla «App details»

📍 Navegador — developers.facebook.com.

Abre esta dirección:

https://developers.facebook.com/apps/creation/

En «App details» escribe el nombre de la app y el correo de contacto, y pulsa «Next» [F1].

- Nombre: uno neutro, por ejemplo «Hampton Estates Inbox». **No puede llevar** «Facebook», «FB», «Messenger»,
  «Instagram», «WhatsApp» ni parecidos: la revisión lo rechaza [F2].
- Correo: <CORREO_DE_CONTACTO> = un buzón de la inmobiliaria que alguien lea de verdad; ahí llegan los avisos
  de Meta. Pregunta a la inmobiliaria cuál usar; no lo escribas en el chat.

**Deberías ver:** la pantalla siguiente, titulada «Use cases».
**Si ves otra cosa:** si en vez de «Use cases» te pide elegir un «tipo de app» (Business, Consumer), para y
dilo en el chat: es el formato antiguo y los pasos cambian [S9].

### Paso 4 — Crea la app: pantalla «Use cases»

📍 Navegador — developers.facebook.com (misma pantalla).

⚠️ No se puede deshacer: un caso de uso añadido no se quita nunca [F1]. Si marcas otro por error, hay que crear
una app nueva.

Marca **solo** «Engage with customers on Messenger from Meta» (puede aparecer sin «from Meta») y pulsa «Next».

**Deberías ver:** la pantalla «Business».
**Si ves otra cosa:** si no encuentras ese caso de uso en la lista, no elijas «Other»; copia en el chat los
nombres que salen.

### Paso 5 — Crea la app: pantalla «Business»

📍 Navegador — developers.facebook.com (misma pantalla).

⚠️ Elige bien: la app tiene que quedar en la cuenta de empresa **de la inmobiliaria**, que es la dueña de la
página. Si queda en la tuya, la página sería de otro negocio y Meta puede exigir más trámites (régimen de
proveedor de otros negocios) [F3][S15].

Elige la cuenta de empresa de la inmobiliaria (saldrá como «A verified business portfolio» o «An unverified
business portfolio»; las dos valen) y pulsa «Next» [F1]. No elijas «I don't want to connect a business
portfolio yet» ni crees una cuenta nueva.

**Deberías ver:** la pantalla «Requirements».
**Si ves otra cosa:** si la cuenta de empresa de la inmobiliaria no aparece en la lista, es Rama B (paso 1): no
sigas con otra cuenta; dilo en el chat [S14].

Que la app deba vivir en la cuenta de empresa de la inmobiliaria es una recomendación razonada con la
documentación, no una frase literal de Meta [S15].

### Paso 6 — Crea la app: pantalla «Requirements»

📍 Navegador — developers.facebook.com (misma pantalla).

Lee lo que Meta dice que hará falta (no hay que rellenar nada) y pulsa «Next».

**Deberías ver:** la pantalla «Overview», con el resumen de lo elegido.
**Si ves otra cosa:** si pide algún dato que no sabes, no lo inventes: cópialo en el chat.

### Paso 7 — Crea la app: pantalla «Overview»

📍 Navegador — developers.facebook.com (misma pantalla).

Comprueba que pone el nombre de la app, el caso de uso de Messenger y la cuenta de empresa de la inmobiliaria,
y pulsa «Go to dashboard» [F1].

**Deberías ver:** el panel de la app, con su nombre y su «App ID» (un número) en la barra de arriba.
**Si ves otra cosa:** si antes de abrir el panel Meta te pide confirmar que eres tú, hazlo. Si da un error de
límite de apps, dilo en el chat.

### Paso 8 — Mira la lista de permisos del caso de uso (sin añadir ninguno)

📍 Navegador — developers.facebook.com, panel de la app.

En el menú de la izquierda pulsa «Dashboard» y después «Customize the Engage with customers on Messenger from
Meta use case» [F3]. Solo mira la lista de permisos; **no pulses «Add» en ninguno**.

**Deberías ver:** estos cinco como obligatorios («Required»): «business_management», «pages_messaging»,
«pages_show_list», «public_profile» y el de metadatos de página (Meta lo escribe a veces «page_manage_metadata»
y a veces «pages_manage_metadata»: es el mismo) [F3].
**Si ves otra cosa:** si falta alguno de los cinco, cópialo en el chat.

Dos decisiones ya tomadas en esta guía, con su motivo:

- **«pages_read_engagement»: no se añade.** La app no lee conversaciones por esa vía y pedir permisos que no se
  usan es motivo frecuente de rechazo [F16]. Una página de Meta lo incluye en su lista y otra lo pone como
  dependencia [S8]: si más adelante la pantalla lo impone, se añade y hay un texto preparado (paso 66).
- **«Human Agent» (contestar hasta 7 días después): no se pide ahora.** Hoy el panel solo contesta dentro de
  las 24 horas [F34]. Es decisión tuya pedirlo más adelante.

### Paso 9 — Conecta la página de Facebook a la app

📍 Navegador — developers.facebook.com, panel de la app (misma pantalla del caso de uso).

Entra en «Messenger API Setup». En la sección «Generate access tokens» pulsa «Connect»; en la ventana que se
abre pulsa «Continue», marca la página de la inmobiliaria, «Continue», «Save» y «Got it» [F3].

Consejo: si puedes, graba la pantalla mientras haces este paso (sin sonido). Es una escena del vídeo de la
revisión (paso 59) y puede que esta ventana no vuelva a salir igual.

**Deberías ver:** tras «Got it», otra vez el panel de la app [F3]; lo esperable es que la página de la
inmobiliaria aparezca ya en la sección «Generate access tokens».
**Si ves otra cosa:**

- Si la pantalla se llama «Messenger › Settings» y la sección «Token Generation», es la misma con el nombre
  antiguo [F8][S9]: sigue.
- Si la página de la inmobiliaria no sale en la ventana, tu Facebook no tiene acceso completo a la página: es
  Rama B (paso 1).
- Si «Connect» falla, hay otro camino documentado: Meta Business Suite › All Tools › Business Apps [F8]. Dilo
  en el chat antes de usarlo.

Aquí **no** rellenes «Configure webhooks» ni pulses «Add Subscriptions»: eso es el tramo 2, y hacerlo antes de
tiempo estropea la suscripción (ver paso 43).

### Paso 10 — Deja a la vista el App ID y el App Secret

📍 Navegador — developers.facebook.com, panel de la app.

⚠️ El App Secret es una contraseña de la app. No lo copies a ningún sitio que no sea el paso 13.

Abajo a la izquierda pulsa «App settings» › «Basic» (en algunas pantallas «Settings» › «Basic») [F2]. Deja esa
pestaña abierta.

**Deberías ver:** el «App ID» (un número) y el campo del App Secret; lo esperable es que salga oculto [S1].
**Si ves otra cosa:** si no encuentras el App Secret en esa página, dilo en el chat.

No actives «Require App Secret» en App settings › Advanced: la app no está preparada para eso y los envíos
fallarían [F37].

### Paso 11 — Abre el terminal en la carpeta de trabajo

Cambio de sitio: del navegador al terminal.

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
cd /root/HamptonJersey/.worktrees/avanzar
```

Qué hace: te coloca en la carpeta desde la que funciona la herramienta de Cloudflare (wrangler).

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** «No such file or directory» = no estás en el VPS; revisa la conexión SSH.

Usa **esta misma ventana de terminal** hasta el paso 34: los valores se guardan en la memoria de la ventana y
se pierden si la cierras.

### Paso 12 — Lleva el App ID al terminal

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

Pega el comando y pulsa Intro. El terminal se queda esperando: copia el número «App ID» de la pestaña del paso
10, pégalo y pulsa Intro.

```
read -r APP_ID
```

Qué hace: guarda el App ID en la memoria de esta ventana para los pasos siguientes; no lo escribe en ningún
archivo.

**Deberías ver:** el número mientras lo pegas y, tras Intro, el símbolo del terminal.
**Si ves otra cosa:** si pegaste algo que no era el número, repite el paso.

### Paso 13 — Lleva el App Secret al terminal

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

⚠️ Secreto. No lo pegues en ningún otro sitio.

En la pestaña del paso 10, muestra y copia el App Secret (lo esperable es un botón para verlo, que puede
pedirte la contraseña de Facebook [S1]). Pega el comando, pulsa Intro, pega el App Secret y pulsa Intro.

```
read -rs APP_SECRET
```

Qué hace: guarda el App Secret en la memoria de esta ventana sin mostrarlo ni dejarlo en el historial.

**Deberías ver:** nada mientras pegas (es un aviso oculto) y, tras Intro, el símbolo del terminal.
**Si ves otra cosa:** si el secreto aparece escrito en pantalla, es que se pegó antes de pulsar Intro en el
comando: dilo en el chat (habrá que cambiarlo, sección «Deshacer»).

### Paso 14 — Abre el explorador de la API con tu app elegida

Cambio de sitio: del terminal al navegador.

📍 Navegador — developers.facebook.com.

Abre esta dirección y, en el desplegable de aplicación, elige la app que acabas de crear [F44]:

https://developers.facebook.com/tools/explorer/

**Deberías ver:** el nombre de tu app en ese desplegable.
**Si ves otra cosa:** si tu app no sale en la lista, recarga la página; si sigue sin salir, dilo en el chat.

Importa que sea **tu** app: el paso 21 usa el App ID y el App Secret de esta misma app [S20].

El token que vas a crear queda ligado a tu cuenta de Facebook, a la página y a la app [F10]. Mientras se use,
tu cuenta tiene que conservar el acceso a la página.

### Paso 15 — Añade los cuatro permisos en el explorador

📍 Navegador — developers.facebook.com, explorador de la API (misma pantalla).

En el desplegable de permisos («Add a Permission» [S16]) añade estos cuatro, uno a uno:
«pages_show_list», «pages_manage_metadata», «pages_messaging» y «business_management» [F14].

**Deberías ver:** los cuatro en la lista de permisos del explorador.
**Si ves otra cosa:** si alguno no aparece en el desplegable, di en el chat cuál falta.

### Paso 16 — Genera el token corto

📍 Navegador — developers.facebook.com, explorador de la API (misma pantalla).

⚠️ Lo que sale es una llave temporal de tu cuenta. No la pegues en el chat.

Pulsa «Generate Access Token» [S16]. En la ventana de Facebook, elige la página de la inmobiliaria y acepta.

**Deberías ver:** el campo del token del explorador relleno con un texto muy largo [S16].
**Si ves otra cosa:** si la ventana no ofrece la página de la inmobiliaria, tu Facebook no tiene acceso a
ella (Rama B). Si da error de permisos, cópialo en el chat (el error, no el token).

Este token caduca en una o dos horas [F10]: sigue sin pausas hasta el paso 23.

### Paso 17 — Lleva el token corto al terminal

Cambio de sitio: del navegador al terminal.

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

Copia el texto largo del campo del token del paso 16. Pega el comando, pulsa Intro, pega el token y pulsa Intro.

```
read -rs CORTO
```

Qué hace: guarda el token corto en la memoria de esta ventana sin mostrarlo.

**Deberías ver:** nada mientras pegas y, tras Intro, el símbolo del terminal.
**Si ves otra cosa:** repite el paso; no pasa nada por hacerlo dos veces.

### Paso 18 — Guarda la dirección de la API de Meta

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
U=https://graph.facebook.com/v27.0
```

Qué hace: guarda la dirección de la API de Meta, en la versión v27.0 que usa la app [F45], para no repetirla.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** repite el paso.

### Paso 19 — Prepara los datos del canje (primera parte)

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
A=(--data-urlencode "client_id=$APP_ID" --data-urlencode "client_secret=$APP_SECRET")
```

Qué hace: prepara, sin enviarlos, el App ID y el App Secret que Meta pide para canjear el token.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** repite el paso.

### Paso 20 — Prepara los datos del canje (segunda parte)

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
A+=(--data-urlencode "fb_exchange_token=$CORTO" -d grant_type=fb_exchange_token)
```

Qué hace: añade el token corto y el tipo de operación (canje por uno de larga duración) [F11].

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** repite los pasos 19 y 20, en ese orden.

### Paso 21 — Canjea el token corto por uno de unos 60 días

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
R=$(curl -s -G "$U/oauth/access_token" "${A[@]}")
```

Qué hace: pide a Meta el token de usuario de larga duración y guarda la respuesta sin mostrarla. Meta manda
hacer este canje desde un servidor, no desde el navegador [F11]; por eso va en el VPS.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje (la respuesta se mira en el paso 22).
**Si ves otra cosa:** un mensaje de «curl» significa que no hubo conexión: repite el paso.

### Paso 22 — Comprueba que el canje salió bien

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
jq 'del(.access_token)' <<< "$R"
```

Qué hace: enseña la respuesta de Meta quitándole el token, para que puedas leerla sin mostrar el secreto.

**Deberías ver:** «"token_type": "bearer"» y «"expires_in"» con un número cercano a 5183944 (unos 60 días) [F11].
**Si ves otra cosa:** si sale «"error"», lee su «message» y cópialo en el chat (no lleva secretos). Causas
habituales: el token corto caducó (repite los pasos 16, 17, 19, 20 y 21), el App Secret se pegó mal (repite el paso 13 y
después los pasos 19 a 22) o en el explorador estaba elegida otra app (repite los pasos 14 a 22) [S20].

### Paso 23 — Guarda el token de larga duración

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
LARGO=$(jq -r .access_token <<< "$R")
```

Qué hace: saca el token de larga duración de la respuesta y lo guarda en la memoria de la ventana.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** repite el paso.

### Paso 24 — Pide a Meta tus páginas

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
P=$(curl -s -G "$U/me/accounts" --data-urlencode "access_token=$LARGO")
```

Qué hace: pide la lista de páginas que administras. Con el token de larga duración, Meta devuelve para cada
página su identificador y un token de página sin fecha de caducidad [F11]. La respuesta se guarda sin
mostrarla.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** un mensaje de «curl» = sin conexión: repite el paso.

### Paso 25 — Mira el identificador de la página y tus tareas en ella

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
jq '.data[] | {name, id, tasks}' <<< "$P"
```

Qué hace: enseña, de cada página, solo el nombre, el identificador y lo que tu cuenta puede hacer en ella (sin
el token).

**Deberías ver:** un bloque con «"name"» = el nombre de la página de la inmobiliaria, «"id"» = un número largo
(es el Page ID) y, dentro de «"tasks"», las palabras «"MESSAGING"» y «"MODERATE"» [F9][F14].
**Si ves otra cosa:**

- No sale nada o sale «"error"»: en el paso 16 no elegiste la página, o el token no vale. Repite los pasos 16
  y 17 y después los pasos 19 a 25.
- Sale la página pero falta «MESSAGING» o «MODERATE»: tu Facebook no tiene acceso completo a la página. Es
  Rama B: la inmobiliaria debe dártelo. Para aquí y dilo en el chat.

### Paso 26 — Lleva el Page ID al terminal

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

Selecciona en la pantalla el número de «"id"» de la página de la inmobiliaria (solo las cifras, sin comillas).
Pega el comando, pulsa Intro, pega el número y pulsa Intro.

```
read -r PAGE_ID
```

Qué hace: guarda el Page ID en la memoria de la ventana.

**Deberías ver:** el número mientras lo pegas y, tras Intro, el símbolo del terminal.
**Si ves otra cosa:** si pegaste comillas o espacios, repite el paso: tienen que ser solo cifras.

### Paso 27 — Aparta el token de la página

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
T=$(jq -r --arg i "$PAGE_ID" '.data[] | select(.id == $i) | .access_token' <<< "$P")
```

Qué hace: saca de la respuesta del paso 24 el token de la página cuyo identificador acabas de pegar y lo guarda
sin mostrarlo.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** repite el paso.

### Paso 28 — Pregunta a Meta por el estado del token de la página

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
D=$(curl -s -G "$U/debug_token" -d "input_token=$T" -d "access_token=$LARGO")
```

Qué hace: pide a Meta la ficha del token de la página (si es válido y cuándo caduca) [F13] y la guarda.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** un mensaje de «curl» = sin conexión: repite el paso.

### Paso 29 — Comprueba que el token vale y no caduca

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
jq '.data | {is_valid, expires_at, data_access_expires_at}' <<< "$D"
```

Qué hace: enseña tres datos de la ficha: si el token es válido, cuándo caduca y hasta cuándo da acceso a datos.

**Deberías ver:** «"is_valid": true» y «"expires_at": 0». El tercer dato será un número grande: es normal.
**Si ves otra cosa:**

- «"is_valid": false» o todo «null»: el Page ID del paso 26 no coincide con ninguna página. Repite los pasos
  25, 26, 27 y 28.
- «"expires_at"» con un número grande: ese token caduca. **No sigas**: dilo en el chat.

Dato sin verificar [S4]: Meta no escribe qué valor muestra un token sin caducidad (se espera 0), y sus propias
páginas se contradicen sobre si el token de página caduca. Por eso este paso existe.

### Paso 30 — Carga el secreto META_APP_SECRET en Cloudflare

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

⚠️ Cambia la configuración de producción (proyecto hamptonjersey de Cloudflare Pages). No tiene efecto hasta
el siguiente despliegue, que hace /avanzar después del paso 35.

```
npx wrangler pages secret put META_APP_SECRET --project-name hamptonjersey <<< "$APP_SECRET"
```

Qué hace: entrega a Cloudflare el App Secret que ya está en la memoria de la ventana (el mismo que Meta acaba
de aceptar en el paso 22), sin mostrarlo. La app lo usa para comprobar que cada aviso viene de Meta.

**Deberías ver:** una línea que termina en «Success! Uploaded secret META_APP_SECRET».
**Si ves otra cosa:** si wrangler pide iniciar sesión o da un error de permisos, no insistas: copia el error en
el chat. Si abre el aviso oculto «Enter a secret value:», pega ahí el App Secret y pulsa Intro.

Nota: la forma habitual es pegar el valor en el aviso oculto de wrangler. Aquí se le pasa desde la memoria de
la ventana para que el valor cargado sea exactamente el que Meta ya aceptó [S22].

### Paso 31 — Carga el secreto META_PAGE_ID en Cloudflare

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

⚠️ Cambia la configuración de producción, igual que el paso 30. Sin efecto hasta el despliegue del paso 35.

```
npx wrangler pages secret put META_PAGE_ID --project-name hamptonjersey <<< "$PAGE_ID"
```

Qué hace: entrega a Cloudflare el identificador de la página (solo cifras). La app lo usa para aceptar
únicamente los mensajes de esa página.

**Deberías ver:** una línea que termina en «Success! Uploaded secret META_PAGE_ID».
**Si ves otra cosa:** copia el error en el chat.

### Paso 32 — Carga el secreto META_PAGE_TOKEN en Cloudflare

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

⚠️ Cambia la configuración de producción, igual que el paso 30. Sin efecto hasta el despliegue del paso 35.

```
npx wrangler pages secret put META_PAGE_TOKEN --project-name hamptonjersey <<< "$T"
```

Qué hace: entrega a Cloudflare el token de la página, que la app usará para enviar las respuestas del equipo.
Se pasa desde la memoria porque es demasiado largo para copiarlo de la pantalla sin que se parta.

**Deberías ver:** una línea que termina en «Success! Uploaded secret META_PAGE_TOKEN».
**Si ves otra cosa:** copia el error en el chat.

### Paso 33 — Comprueba que los secretos están en Cloudflare

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
npx wrangler pages secret list --project-name hamptonjersey
```

Qué hace: enseña los nombres de los secretos del proyecto (nunca sus valores).

**Deberías ver:** entre otros, «META_APP_SECRET: Value Encrypted», «META_PAGE_ID: Value Encrypted»,
«META_PAGE_TOKEN: Value Encrypted» y «META_VERIFY_TOKEN: Value Encrypted».
**Si ves otra cosa:** si falta uno de los tres primeros, repite su paso (30, 31 o 32). Si falta
META_VERIFY_TOKEN, el tramo 0 no está hecho: dilo en el chat.

### Paso 34 — Borra los valores de la memoria del terminal

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
unset APP_ID APP_SECRET CORTO LARGO PAGE_ID T R P D A U
```

Qué hace: olvida el App Secret y los tokens que estaban en la memoria de esta ventana. Ya están donde tienen
que estar (Cloudflare).

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** cierra la ventana del terminal: el efecto es el mismo.

### Paso 35 — Avisa en el chat y espera el despliegue

Cambio de sitio: del terminal al chat.

📍 Chat con /avanzar.

Escribe «secretos de Meta cargados». /avanzar publica la app y te confirma el despliegue. Un secreto de
Cloudflare solo vale desde el siguiente despliegue.

**Deberías ver:** la confirmación de /avanzar de que el despliegue está hecho.
**Si ves otra cosa:** no empieces el tramo 2 hasta tener esa confirmación. Si registras el webhook antes, la app
contesta 503 a Meta y, tras una hora de fallos, Meta da de baja la suscripción de la página [F8].

---

## Tramo 2 — Prueba: registrar el webhook y un mensaje desde tu Facebook (pasos 36 a 46)

Requisitos: tramo 0 confirmado y despliegue del paso 35 confirmado.

### Paso 36 — Prepara la pregunta de prueba al webhook (primera parte)

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
H=(-d hub.mode=subscribe -d hub.challenge=12345)
```

Qué hace: prepara, sin enviarla, la misma pregunta que hará Meta para verificar la dirección, con el número de
prueba 12345.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** repite el paso.

### Paso 37 — Prepara la pregunta de prueba al webhook (segunda parte)

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
H+=(--data-urlencode "hub.verify_token=$(cat /root/.hampton-meta-verify-token)")
```

Qué hace: añade la clave de verificación leyéndola del archivo privado del VPS, sin mostrarla.

**Deberías ver:** el símbolo del terminal, sin ningún mensaje.
**Si ves otra cosa:** «No such file or directory» = /avanzar no ha dejado la copia de la clave (tramo 0): dilo
en el chat.

### Paso 38 — Pregunta al webhook como lo hará Meta

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

```
curl -s -w ' %{http_code}\n' -G "https://www.hamptonestatesjersey.com/api/meta/webhook" "${H[@]}"
```

Qué hace: llama a la dirección del webhook igual que Meta al verificarla [F8] y enseña la respuesta y su código.

**Deberías ver:** «12345 200».
**Si ves otra cosa:** mira el número final y dilo en el chat; no sigas hasta ver «12345 200».

- «404» = la entrada de mensajes está apagada (tramo 0 sin hacer o sin desplegar).
- «503» = falta un secreto o todavía no hubo despliegue.
- «403» = la clave de verificación no coincide con la cargada en Cloudflare.

### Paso 39 — Abre la pantalla de Messenger de tu app

Cambio de sitio: del terminal al navegador.

📍 Navegador — developers.facebook.com, panel de la app.

Entra en «Dashboard» › «Customize the Engage with customers on Messenger from Meta use case» › «Messenger API
Setup» y localiza la sección «Configure webhooks» [F3].

**Deberías ver:** dos campos vacíos: «Callback URL» y «Verify token».
**Si ves otra cosa:** si tu pantalla es la antigua («Products» › «Messenger» › «Settings»), los campos se
llaman igual y sirven igual [F8][S9].

### Paso 40 — Lee la clave de verificación

Cambio de sitio: del navegador al terminal.

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

⚠️ Este comando enseña un secreto en pantalla. No lo pegues en el chat ni lo dejes a la vista si grabas la
pantalla. Su único destino es el campo «Verify token» del paso 41.

```
cat /root/.hampton-meta-verify-token
```

Qué hace: enseña la clave de verificación para que puedas copiarla. Meta la pide una vez, al registrar la
dirección.

**Deberías ver:** una sola línea de letras y cifras. Selecciónala entera y cópiala.
**Si ves otra cosa:** «No such file or directory» = dilo en el chat (tramo 0).

### Paso 41 — Registra la dirección del webhook en Meta

Cambio de sitio: del terminal al navegador.

📍 Navegador — developers.facebook.com, panel de la app, sección «Configure webhooks».

⚠️ Desde este momento Meta puede empezar a llamar a la app de producción.

En «Callback URL» pega esta dirección:

https://www.hamptonestatesjersey.com/api/meta/webhook

En «Verify token» pega la clave del paso 40. Pulsa el botón de guardar o verificar de esa sección [F3].

**Deberías ver:** que Meta acepta la dirección: el panel indica si la verificación fue bien [F8].
**Si ves otra cosa:** si Meta dice que no pudo validar la dirección, vuelve al paso 38: si allí sale
«12345 200», la clave se pegó con un espacio o incompleta; repite los pasos 40 y 41. Qué hace el panel
exactamente cuando falla no está documentado [S11].

### Paso 42 — Suscribe el campo «messages» en la app

📍 Navegador — developers.facebook.com, panel de la app (misma sección).

En la lista de campos del webhook de esa sección, activa **solo** «messages» [F8]. No actives ningún otro:
la app no los usa y solo añaden tráfico.

**Deberías ver:** «messages» marcado como suscrito.
**Si ves otra cosa:** si en tu pantalla no hay lista de campos en «Configure webhooks», sigue con el paso 43:
puede que la pantalla nueva lo haga todo desde «Add Subscriptions» [S10]. Anótalo en el chat.

Hace falta la suscripción en los dos niveles, app y página: si falta una, no llega nada y Meta no avisa [F46].

### Paso 43 — Suscribe la página al campo «messages»

📍 Navegador — developers.facebook.com, panel de la app, sección «Generate access tokens».

⚠️ A partir de aquí Meta envía a la app cada mensaje que reciba la página. Si la app contesta mal durante una
hora seguida, Meta da de baja esta suscripción y hay que repetir este paso [F8]. Por eso solo se hace después
del despliegue del paso 35.

Junto a la página de la inmobiliaria pulsa «Add Subscriptions», marca «messages» y pulsa «Confirm» [F3].

**Deberías ver:** «messages» junto a la página, como campo suscrito.
**Si ves otra cosa:** si el botón no aparece, copia en el chat lo que ves en esa sección. Existe una
alternativa documentada por API [F8]; la prepara /avanzar contigo.

### Paso 44 — Manda un mensaje de prueba desde tu propio Facebook

📍 Navegador — Facebook, página de la inmobiliaria (https://www.facebook.com/hamptonestatesjsy/), con el mismo
Facebook con el que creaste la app.

Escribe a la página por Messenger (desde la propia página o buscando su nombre en Messenger) una frase de
prueba que lleve una tilde, una ñ y un emoji cualquiera; por ejemplo, que empiece por «Prueba de señal, año
nuevo».

**Deberías ver:** tu mensaje enviado en la ventana de Messenger.
**Si ves otra cosa:** si no encuentras cómo escribir a la página, dilo en el chat.

Tiene que ser tu cuenta (u otra con rol en la app): hasta que Meta apruebe la revisión, la app solo conversa
con cuentas que tienen rol de administrador, desarrollador o probador en ella [F15].

### Paso 45 — Comprueba que el mensaje llegó al panel

📍 Navegador — panel del equipo (el de siempre), apartado «Messages».

Abre «Messages», elige «Facebook» y mira la pestaña «Waiting».

**Deberías ver:** una conversación nueva llamada «Facebook user» seguida de cuatro cifras, con tu frase.
**Si ves otra cosa:** espera un minuto y recarga. Si sigue sin llegar, no cambies nada y dilo en el chat con
la hora del mensaje. Causas posibles, por orden:

1. La app está sin publicar. Dato sin verificar [S2]: Meta no dice si una app sin publicar recibe los mensajes
   de cuentas con rol. Alternativa documentada: publicar la app y repetir la prueba; se hace solo de acuerdo
   con /avanzar, porque publicar pide antes icono, aviso de privacidad y dirección de borrado.
2. La página reparte las conversaciones a otra app o a un asistente automático. Se mira en la página:
   Page Settings › Page Setup › Advanced Messaging › Connected apps; debe quedar el comportamiento por defecto
   y el asistente automático apagado [F36][S19].
3. Falta la suscripción en uno de los dos niveles (pasos 42 y 43).
4. En el panel de la app, la tarjeta de webhooks tiene un botón «Show recent errors» [F39]: copia en el chat lo
   que diga.

### Paso 46 — Avisa en el chat

📍 Chat con /avanzar.

Escribe «mensaje de prueba de Facebook recibido». Si lo autorizaste, /avanzar enciende entonces «responder
desde el panel» y te lo confirma.

**Deberías ver:** la confirmación de /avanzar. A partir de ahí, en la conversación del panel el botón «Send
reply» deja de estar bloqueado.
**Si ves otra cosa:** mientras el panel diga «Sending replies to Facebook is off», no se envía nada desde él.

**Hasta aquí llega lo que se puede adelantar sin esperar a Meta.** Con los tramos 1 y 2 hechos, el circuito
funciona entre cuentas con rol en la app. Para el público hace falta el tramo 3.

---

## Tramo 3 — Lento: verificación del negocio y revisión del permiso (pasos 47 a 68)

Plazos que da Meta: hasta 14 días hábiles la verificación del negocio [F20] y alrededor de una semana la
revisión de la app [F17]. Los pasos 47 a 53 no dependen de los tramos 1 y 2: con la Rama A del paso 1 se pueden
empezar el mismo día.

**Lo que no está claro y cómo se trata.** Las páginas de Meta se contradicen sobre si hace falta la revisión
cuando solo se atiende la página propia: una dice que no [F14] y otras dicen que, sin revisión, solo llegan
mensajes de cuentas con rol [F8][F15]. Esta guía planifica el camino largo y **no promete** que se pueda
evitar [S3]. El paso 58 es una prueba de un minuto que lo aclara.

### 3-A · Verificación del negocio

### Paso 47 — Mira qué ofrece el Security Center

📍 Navegador — business.facebook.com (Meta Business Suite), cuenta de empresa de la inmobiliaria.

Abre esta dirección y solo mira; **no pulses nada todavía**:

https://business.facebook.com/settings/security

**Deberías ver:** uno de estos dos textos: «Start verification» o «Ineligible for verification» [F21]. Dime en
el chat cuál.
**Si ves otra cosa:**

- Si no puedes abrir el Security Center, puede que te falte el acceso total a la cuenta de empresa [F20]: es
  Rama B (paso 1).
- Si sale «Ineligible for verification»: no se verifica desde aquí. Meta avisa por correo o desde el producto
  que lo exige [F20]. Salta al paso 54; lo esperable, sin que Meta lo diga expresamente [S6], es que la
  verificación se abra al pedir los permisos (paso 60) o desde App settings › Basic › Verification [F25].
  Cuando se abra, vuelve a los pasos 48 a 53.

La verificación del negocio no es «Meta Verified» ni da insignia: no hay que contratar nada de pago [F20].

### Paso 48 — Mira si «Jersey» está en la lista de países

📍 Navegador — business.facebook.com (Meta Business Suite), Settings › Business info.

En «Business details» pulsa «Edit», despliega la lista de países y busca «Jersey». **Cierra sin guardar** [F23].

**Deberías ver:** «Jersey» en la lista. Dime en el chat si está o no.
**Si ves otra cosa:** si no está, **no elijas Reino Unido por tu cuenta**: si el país del formulario no
coincide con el de los documentos puede haber rechazo. Para aquí y dilo en el chat. Dato sin verificar [S5]:
ninguna página de Meta publica la lista de países ni nombra Jersey.

### Paso 49 — Reúne con la inmobiliaria los datos y los documentos

📍 Fuera de pantalla — con la inmobiliaria.

Pide a la inmobiliaria, tal como figuran en sus papeles oficiales:

- Nombre legal exacto, dirección, teléfono y sitio web del negocio [F20].
- Un documento para el nombre legal: certificado o escritura de constitución, o registro o licencia del negocio.
- Un documento para la dirección o el teléfono: extracto bancario de empresa o factura de suministros a nombre
  legal del negocio (la factura no sirve para acreditar el nombre) [F22].
- Quién recibirá el código de confirmación (paso 53) y a qué teléfono o correo del negocio.

Los documentos tienen que estar vigentes, emitidos por la autoridad competente, legibles y en inglés (ya lo
están); se pueden tapar datos personales que no hagan falta [F22]. Tenlos preparados **siempre**: Meta puede
pedirlos aunque encuentre el negocio en sus registros.

**Deberías ver:** los cuatro datos y los dos documentos en tu poder, en archivos sin contraseña.
**Si ves otra cosa:** si el nombre legal del documento no es idéntico al que se va a escribir, resuélvelo con
la inmobiliaria antes de seguir. No guardes estos documentos en el repositorio.

Qué documento concreto de Jersey corresponde a cada tipo no lo dice Meta [S5].

### Paso 50 — Comprueba el sitio web que se va a declarar

📍 Navegador — el sitio web del negocio que irá en el formulario.

Ábrelo escribiendo la dirección con https:// delante y pulsa en unos cuantos enlaces del menú.

**Deberías ver:** la página carga con el candado del navegador y ningún enlace da error.
**Si ves otra cosa:** un sitio que no carga, sin https o con un enlace roto es motivo de rechazo publicado por
Meta [F24]: dilo en el chat antes de enviar nada.

### Paso 51 — Empieza la verificación y escribe los datos del negocio

📍 Navegador — business.facebook.com (Meta Business Suite), Security Center.

⚠️ Lo que escribas aquí no se puede corregir después sin repetir la verificación: nombre legal, país, teléfono,
sitio web [F23]. Escríbelo idéntico a los documentos.

Pulsa «Start verification» y rellena nombre legal, dirección, teléfono y sitio web [F20].

**Deberías ver:** la pantalla siguiente, donde Meta propone registros que coinciden con el negocio.
**Si ves otra cosa:** si el formulario pide algo que no tienes, no lo inventes: déjalo sin enviar y dilo en el
chat.

### Paso 52 — Confirma el registro o sube los documentos

📍 Navegador — business.facebook.com (misma pantalla).

Si Meta muestra el negocio correcto, elígelo. Si no, elige «My business isn't listed» o «None of these match»
y sube los dos documentos del paso 49 [F20].

**Deberías ver:** la pantalla para elegir el método de confirmación.
**Si ves otra cosa:** si un documento es rechazado al subirlo, mira que no tenga contraseña y que se lea el
nombre legal completo; si sigue, dilo en el chat.

### Paso 53 — Elige el método, mete el código y termina

📍 Navegador — business.facebook.com (misma pantalla), con la persona del paso 49 localizable.

Elige uno de los métodos que ofrezca la pantalla (correo, llamada, SMS, WhatsApp o verificación de dominio)
[F20], mete el código que reciba la inmobiliaria y pulsa el botón de terminar («Done»).

**Deberías ver:** el aviso de que el envío se ha recibido. La decisión puede tardar hasta 14 días hábiles y
Meta la notifica; el estado se consulta en el mismo Security Center [F20].
**Si ves otra cosa:**

- Si eliges correo, Meta puede pedir además prueba de que el dominio es del negocio [F22]: en ese caso es más
  directo el teléfono del negocio.
- No elijas «verificación de dominio» sin hablarlo en el chat: exige tocar el dominio de la web, que gestiona
  un tercero.
- Si la rechaza, vuelve al Security Center, lee el motivo y usa la opción de apelar o reenviar que ofrezca la
  pantalla [F24].

Mientras espera y después: **no edites** nombre legal, país, teléfono, web ni identificador fiscal del negocio.

### 3-B · Preparar y enviar la revisión de la app

### Paso 54 — Pide a /avanzar lo que la revisión necesita de la app

📍 Chat con /avanzar.

Escribe «prepara lo de la revisión de Meta». /avanzar te devolverá, con tu «sí» en lo que haga falta:

- <URL_PRIVACIDAD>: la dirección de una página fija con el aviso de privacidad. La de hoy,
  https://www.hamptonestatesjersey.com/#/privacy, se pinta con JavaScript, y Meta exige una dirección que sus
  robots puedan leer y que esté claramente rotulada como aviso de privacidad [F27][F28]. Lo seguro es una
  página fija [S12].
- <URL_BORRADO>: la dirección con las instrucciones para pedir el borrado de datos. Puede ser un apartado de
  esa misma página de privacidad [F29].
- El icono de la app: una imagen PNG de 1024 x 1024, sin logotipos ni nombres de Meta [F2][F3].
- <URL_DEL_PANEL> y <USUARIO_REVISOR>: por dónde entra el revisor de Meta al panel y con qué usuario de prueba
  (del panel, con datos ficticios; **nunca** una cuenta de Facebook) [F19][F42]. La <CLAVE_REVISOR> la pones tú
  y solo se escribe en el formulario de Meta.
- La confirmación de que «responder desde el panel» está encendido (paso 46).

**Deberías ver:** las direcciones y el usuario de prueba en el chat, y el icono en un archivo.
**Si ves otra cosa:** el acceso del revisor es una decisión pendiente (el panel solo se abre al equipo): no
envíes la revisión sin él, porque si Meta no puede entrar rechaza el envío entero [F18].

### Paso 55 — Rellena la ficha de la app

📍 Navegador — developers.facebook.com, panel de la app, «App settings» › «Basic».

Es un solo formulario con un solo botón de guardar. Rellena y guarda [F2][F3]. Los rótulos de los campos pueden
variar un poco en tu pantalla [S9]:

| Campo | Qué poner |
| --- | --- |
| App icon | El icono del paso 54. |
| Privacy Policy URL | <URL_PRIVACIDAD> |
| User data deletion | <URL_BORRADO>, como dirección de instrucciones (no hace falta «callback») [F29]. |
| Category | «Business and Pages» [S17]. |
| Contact email | <CORREO_DE_CONTACTO>, el mismo del paso 3. |

**Deberías ver:** la ficha guardada sin avisos en rojo.
**Si ves otra cosa:**

- Si exige «Terms of Service URL» o los datos de un «Data Protection Officer», no los inventes: dilo en el
  chat. Las páginas de Meta no coinciden en si son obligatorios [S17][S18].
- Si rechaza la dirección de privacidad, copia el aviso en el chat.

### Paso 56 — Comprueba que Meta puede leer el aviso de privacidad

📍 Navegador — developers.facebook.com.

Abre esta dirección, pega <URL_PRIVACIDAD> y pulsa el botón de depurar [F27]:

https://developers.facebook.com/tools/debug

**Deberías ver:** un código de respuesta «200» para esa dirección.
**Si ves otra cosa:** un enlace de privacidad roto cuenta como infracción [F27]: dilo en el chat. Que esta
herramienta muestre el código no se ha podido comprobar sin sesión [S12].

### Paso 57 — Contesta desde el panel a tu mensaje de prueba

📍 Navegador — panel del equipo, «Messages» › «Facebook».

Abre la conversación del paso 45, escribe una respuesta en «Reply» y pulsa «Send reply». Si han pasado más de
24 horas desde tu mensaje, escribe antes otro mensaje a la página desde tu Facebook (como en el paso 44): solo
se puede contestar dentro de las 24 horas siguientes al último mensaje de la persona [F9].

**Deberías ver:** en el panel, «Reply sent on Facebook.» y la conversación en «Answered»; en tu Messenger, la
respuesta enviada por la página.
**Si ves otra cosa:** si el panel dice «Facebook did not accept the reply (error» y un número, copia el número
en el chat: 190 = el token no vale; 200 = falta permiso o la app no puede escribir a esa cuenta; 10 = fuera de
plazo u otra app controla la conversación [F38].

Este paso cuenta además como la llamada de prueba de «pages_messaging». Meta exige al menos una llamada con
cada permiso antes de pedirlo, hecha en los 30 días anteriores al envío, y tarda hasta 2 días en registrarla
[F17].

### Paso 58 — Prueba opcional de un minuto: una cuenta sin ningún rol

📍 Navegador o móvil de otra persona — Facebook, página de la inmobiliaria.

Pide a alguien que **no** tenga ningún rol en la app, en la página ni en la cuenta de empresa que escriba un
mensaje a la página. Mira en el panel si aparece.

**Deberías ver:** lo esperado es que **no** llegue al panel (así lo dicen varias páginas de Meta) [F8][F15].
**Si ves otra cosa:** si llega, apúntalo en el chat con la hora. No cambies el plan por tu cuenta: /avanzar lo
valora contigo [S3]. En cualquier caso, ese mensaje hay que contestarlo desde la bandeja de Facebook.

### Paso 59 — Graba el vídeo de la revisión

📍 Tu ordenador — grabador de pantalla, con el panel y Messenger abiertos.

Graba siguiendo el guion de abajo. Requisitos de Meta: alta resolución (1080 o más), ancho de pantalla de 1440
o menos, sin sonido, con el ratón, y con la interfaz en inglés o con rótulos en inglés [F17]. El panel ya está
en inglés; añade los rótulos del guion.

⚠️ En el vídeo no pueden verse el App Secret, el campo «Verify token» ni ningún token.

**Guion (una grabación con todas las escenas, en este orden):**

| Escena | Qué se ve | Rótulo en inglés |
| --- | --- | --- |
| 1 | El panel sin sesión; entras con el usuario de prueba. | Staff sign in to the Hampton Estates panel (internal tool). |
| 2 | Panel de la app de Meta: «Generate access tokens» › «Connect», eliges la página y aceptas (la grabación del paso 9). | The Page admin connects our own Facebook Page and grants the permissions (pages_show_list, business_management). |
| 3 | Panel de la app de Meta: la página con el campo «messages» suscrito (paso 43). | pages_manage_metadata: our Page is subscribed to the "messages" webhook field. |
| 4 | Messenger: una cuenta con rol escribe a la página. | A customer writes to our Page in Messenger. |
| 5 | Panel: «Messages» › «Facebook» › «Waiting»; se abre la conversación. | The message arrives in our staff inbox through the webhook. |
| 6 | Panel: escribes en «Reply» y pulsas «Send reply»; sale «Reply sent on Facebook.». | pages_messaging: a team member writes the reply by hand and sends it. |
| 7 | Messenger: llega la respuesta de la página. | The customer receives the reply in Messenger. No automated replies. |

Las escenas 4 a 7 van seguidas, sin cortes y sin capturas fijas: Meta pide la grabación del mensaje saliendo
de la app y llegando a Messenger [F16].

**Deberías ver:** un archivo de vídeo en tu ordenador con las siete escenas.
**Si ves otra cosa / puntos sin verificar:**

- Meta pide enseñar «el inicio de sesión completo con Facebook» en el que se concede el permiso [F16]. El panel
  no tiene botón de Facebook: la página se conectó en el panel de Meta. Ninguna página dice cómo cumplirlo en
  ese caso [S7]. Esta guía enseña la concesión con la escena 2 y lo explica en las instrucciones del revisor.
  Alternativa si Meta lo rechaza: /avanzar añade al panel un botón mínimo de conexión y se graba de nuevo.
- Si no grabaste el paso 9, intenta repetir «Connect» solo para grabarlo; si la ventana ya no sale, graba la
  sección con la página ya conectada y dilo en el chat.
- No está escrito si Meta acepta el mismo vídeo en los cuatro permisos [S7]; si pide uno por permiso, se
  recorta este.
- No guardes el vídeo en el repositorio.

### Paso 60 — Añade los cuatro permisos a la revisión

📍 Navegador — developers.facebook.com, panel de la app, lista de permisos del caso de uso (la del paso 8).

En cada uno de estos cuatro permisos pulsa «Actions» › «+ Add to App Review» [F3]: «pages_messaging»,
«pages_manage_metadata», «pages_show_list» y «business_management». Van los cuatro en un solo envío, que es
más rápido que por separado [F18].

**Deberías ver:** los cuatro marcados como añadidos a la revisión.
**Si ves otra cosa:**

- Botón gris: Meta aún no ha registrado una llamada con ese permiso (hasta 2 días) [F17]. Espera; si a los 2
  días sigue gris, dilo en el chat: se puede hacer la llamada desde el explorador de la API [S16].
- Si aparece un aviso sobre la verificación del negocio, es normal: indica su estado; si falta, es el tramo
  3-A [F17].
- Si la pantalla obliga a añadir también «pages_read_engagement», añádelo y avisa en el chat [S8].
- Si pide «public_profile» en acceso avanzado, cópialo en el chat [S8].
- No pulses «Become a Tech Provider» ni rellenes ningún formulario de «Access Verification»: Meta lo retiró el
  9-oct-2026 y la app es del propio negocio [F43].

### Paso 61 — Abre el envío y repasa los ajustes de la app

📍 Navegador — developers.facebook.com, panel de la app, «Review» › «App Review».

Pulsa «Edit», abre «Complete App Settings» › «Review your app settings» y confirma icono, dirección de
privacidad, categoría y correo [F17]. Si pregunta «App Purpose», elige «Yourself or your own business». Si
pregunta por las plataformas de la app, elige sitio web.

**Deberías ver:** ese apartado marcado como completo.
**Si ves otra cosa:** si pregunta algo distinto, cópialo en el chat. «App Purpose» puede no aparecer en este
tipo de app [S9].

### Paso 62 — Pega las instrucciones para el revisor

📍 Navegador — developers.facebook.com (mismo envío), «Reviewer instructions» › «Provide reviewer instructions».

Pega este texto, cambia los tres valores marcados y pulsa «Done» [F17][F19]:

**PEGAR EN META** (no en el terminal):

```text
WHAT THIS APP IS
An internal staff inbox for our own Facebook Page (a real estate agency in Jersey).
Only our staff use it. There is no public sign-up and no Facebook Login button:
the Page was connected once by our administrator in the Meta App Dashboard.
That step is shown in the screen recording (scene 2).

HOW TO SIGN IN
1. Open <URL_DEL_PANEL>
2. Sign in with this test user of our panel (it is not a Facebook account):
   user: <USUARIO_REVISOR>
   password: <CLAVE_REVISOR>
3. Open the "Messages" section and choose "Facebook".

HOW TO TEST
4. From your test account, send a Messenger message to our Page:
   https://www.facebook.com/hamptonestatesjsy/
5. The conversation appears under "Waiting" within a few seconds. Open it.
6. Type a reply in the "Reply" box and press "Send reply".
   The panel shows "Reply sent on Facebook." and the status becomes "Answered".
7. Check Messenger: the reply arrives from our Page.

NOTES
- Every reply is written and sent by a person. There are no automated replies.
- Replies are only possible within 24 hours of the person's last message.
- pages_manage_metadata is used only to subscribe our Page to the "messages" webhook field.
- pages_show_list is used only to select our own Page when connecting it.
- business_management is requested only as a dependency of pages_messaging.
```

- <URL_DEL_PANEL> y <USUARIO_REVISOR>: los del paso 54.
- <CLAVE_REVISOR>: la que tú pusiste al usuario de prueba. No la escribas en ningún otro sitio.

**Deberías ver:** el apartado de instrucciones marcado como completo.
**Si ves otra cosa:** si el formulario tiene campos separados para usuario y clave, ponlos ahí y quítalos del
texto.

Punto sin verificar [S21]: no consta que el mensaje de la cuenta de prueba del revisor llegue al panel antes de
la aprobación (hasta entonces solo llegan los de cuentas con rol). Por eso el vídeo enseña el circuito completo.
Si /avanzar ajusta la forma de entrar al panel, ajustará también las líneas 1 a 3 del texto.

### Paso 63 — Permiso «pages_messaging»: descripción y vídeo

📍 Navegador — developers.facebook.com (mismo envío), permiso «pages_messaging».

Pega la descripción, sube el vídeo del paso 59 y marca la casilla de uso permitido [F17]. El formulario de
Meta habla de anuncios en la ayuda de este campo; parece un error suyo: describe el uso real [F16].

**PEGAR EN META** (no en el terminal):

```text
Hampton Estates is a real estate agency in Jersey. This app connects our own Facebook Page
to our internal staff inbox.
When a person sends a message to our Page in Messenger, it appears in the "Messages > Facebook"
screen of our staff panel.
A member of our team reads it, writes a reply by hand and presses "Send reply".
The app then sends that reply to the same person with the Send API (messaging_type RESPONSE).
We only reply to people who wrote to us first, within the standard 24-hour messaging window.
These are customer support messages about property enquiries.
There are no bots, no automated replies and no bulk or promotional messages.
Only our own staff use the app, and only for our own Page.
```

**Deberías ver:** el permiso con descripción y vídeo, sin avisos pendientes.
**Si ves otra cosa:** si pide más datos, cópialos en el chat.

### Paso 64 — Permiso «pages_manage_metadata»: descripción y vídeo

📍 Navegador — developers.facebook.com (mismo envío), permiso «pages_manage_metadata».

Pega la descripción, sube el mismo vídeo y marca la casilla. Cada permiso lleva su propio texto: Meta rechaza
los copiados y pegados [F17].

**PEGAR EN META** (no en el terminal):

```text
We use pages_manage_metadata for one purpose: to subscribe our own Facebook Page to this app's
webhook, field "messages".
That subscription delivers each incoming Messenger message to our staff inbox, where a team
member answers it by hand.
The subscription is shown in scene 3 of the screen recording.
We do not change any other Page setting and we do not read or edit Page content.
```

**Deberías ver:** el permiso con descripción y vídeo, sin avisos pendientes.
**Si ves otra cosa:** cópialo en el chat.

### Paso 65 — Permiso «pages_show_list»: descripción y vídeo

📍 Navegador — developers.facebook.com (mismo envío), permiso «pages_show_list».

Pega la descripción, sube el mismo vídeo y marca la casilla.

**PEGAR EN META** (no en el terminal):

```text
We use pages_show_list when an administrator of our business connects our Facebook Page
to the app (scene 2 of the screen recording).
It lets the app list the Pages that person manages, so that our own Page can be selected,
and it returns the Page ID that the webhook and the Send API need.
We do not display, store or use any other Page from that list.
It is also a dependency of pages_messaging.
```

**Deberías ver:** el permiso con descripción y vídeo, sin avisos pendientes.
**Si ves otra cosa:** cópialo en el chat.

### Paso 66 — Permiso «business_management»: descripción y vídeo

📍 Navegador — developers.facebook.com (mismo envío), permiso «business_management».

Pega la descripción, sube el mismo vídeo y marca la casilla. Meta pide decir expresamente que es una
dependencia de «pages_messaging» [F14][F16].

**PEGAR EN META** (no en el terminal):

```text
Main permission: pages_messaging. We request business_management only as its dependency
for the "Engage with customers on Messenger" use case.
Our Facebook Page and this app belong to the same business portfolio.
The app has no advertising features: it does not read or change ad accounts, ads data
or any other business asset.
Its only function is the Messenger staff inbox described under pages_messaging.
```

**Deberías ver:** el permiso con descripción y vídeo, sin avisos pendientes.
**Si ves otra cosa:** la ayuda de Meta para la grabación de este permiso está escrita para anuncios, que la app
no tiene; es un riesgo de rechazo conocido y la única salida documentada es esta declaración [F16].

#### Texto de reserva (no es un paso)

Solo si la pantalla te obligó a añadir «pages_read_engagement» (paso 60), usa para ese permiso este texto:

**PEGAR EN META** (no en el terminal):

```text
Requested only because the dashboard requires it as a dependency of business_management
and pages_messaging.
The app receives messages through the "messages" webhook and replies with the Send API.
It does not read Page posts, comments, followers or insights.
```

### Paso 67 — Contesta las preguntas sobre el tratamiento de datos, si aparecen

📍 Navegador — developers.facebook.com (mismo envío), «data handling questions».

Si el envío las muestra, **no las contestes de memoria**: copia las preguntas en el chat (no llevan secretos) y
/avanzar prepara las respuestas contigo y con la inmobiliaria. Preguntan quién trata los datos por encargo (el
proveedor técnico y el alojamiento, Cloudflare), en qué países, y quién es el responsable y su país [F47].

**Deberías ver:** el apartado completo, o ningún apartado con ese nombre.
**Si ves otra cosa:** Meta recomienda consultarlas con quien lleve lo legal [F47]; si hay dudas, no envíes.

Debe existir un acuerdo escrito entre la inmobiliaria y el proveedor técnico sobre estos datos: Meta puede
pedirlo [F28].

### Paso 68 — Envía la revisión

📍 Navegador — developers.facebook.com (mismo envío).

⚠️ Después de enviar, **no cambies nada** en «App settings» (direcciones, icono, categoría): puede obligar a
revisar de nuevo [F17]. Antes de pulsar, comprueba: página de Facebook publicada y con sus datos de contacto
[F19][F40], webhook funcionando (paso 45) y verificación del negocio enviada o aprobada.

Pulsa «Submit for Review» y acepta los términos.

**Deberías ver:** el envío hecho y pendiente de la decisión de Meta. La decisión suele llegar en una semana
[F17], a menudo en dos o tres días [F50], al correo de contacto y a los avisos («Alerts») de la app.
**Si ves otra cosa:** si el botón está gris, falta algún apartado: mira cuál marca la pantalla. Si Meta rechaza
el envío, copia el motivo en el chat; hay un límite de envíos por mes [F18].

---

## Tramo 4 — Cuando Meta apruebe (pasos 69 a 71)

### Paso 69 — Avisa en el chat de la respuesta de Meta

📍 Chat con /avanzar.

Escribe «Meta ha aprobado la revisión» (o copia el motivo si la rechazó), y di también el estado de la
verificación del negocio.

**Deberías ver:** la confirmación de /avanzar de que la app está lista para abrirse al público.
**Si ves otra cosa:** si Meta aprobó solo algunos permisos, di cuáles; no publiques todavía.

### Paso 70 — Publica la app

📍 Navegador — developers.facebook.com, panel de la app, «Publish» en el menú de la izquierda.

⚠️ Abre la app al público: desde aquí llegan al panel los mensajes de cualquier persona. Se hace después de la
aprobación, no antes [S11].

Pulsa el botón de abajo a la derecha, que puede llamarse «Go live» o «Publish» [F26][F3].

**Deberías ver:** la app en estado publicado.
**Si ves otra cosa:** si antes pide completar el «Data Use Checkup», complétalo ese mismo día [F31]. Si pide
algún dato de la ficha, es el paso 55.

### Paso 71 — Prueba final con una cuenta sin rol

📍 Móvil o navegador de otra persona — Facebook, página de la inmobiliaria; y tú en el panel del equipo.

Repite el paso 58: una persona sin ningún rol escribe a la página, tú abres la conversación en «Messages» ›
«Facebook» y le contestas con «Send reply».

**Deberías ver:** su mensaje en «Waiting»; tras contestar, «Reply sent on Facebook.»; y en su Messenger, tu
respuesta.
**Si ves otra cosa:** dilo en el chat con la hora. Si el panel da «error 200», la app aún no está abierta al
público para ese permiso [F38].

### Después: lo que hay que mantener

- **Cada año:** el «Data Use Checkup». Meta avisa 60, 30, 10 y 3 días antes; si no se hace a tiempo desactiva
  la app, sin prórroga [F31].
- **Si la app deja de contestar más de una hora** (una caída, un secreto cambiado): Meta da de baja la
  suscripción. Hay que repetir el paso 43 y revisar en la bandeja de Facebook los mensajes de ese rato, que no
  se reenvían [F8].
- **Si el panel da «error 190»:** el token de la página dejó de valer (por ejemplo, cambio de contraseña de tu
  Facebook o pérdida de tu acceso a la página) [F13]. Se repiten los pasos 11 a 29, 32, 34 y 35.
- **Lo que se conteste desde la bandeja de Facebook** no aparece en el panel: hay que marcar la conversación
  con «Mark handled» a mano.
- **Normas de uso:** contestar solo dentro de las 24 horas; dejar de escribir a quien lo pida; no pedir ni dar
  datos bancarios por Messenger [F40].
- **El usuario de prueba del revisor** tiene que seguir funcionando: Meta puede volver a entrar y, si no
  puede, desactivar la app [F49].
- **90 días sin actividad** pueden dejar la app inactiva y sin tokens [F32].
- **No cambies** los datos legales del negocio en Meta sin contar con que habrá que verificar de nuevo [F23].
- **Mejora posible:** Meta recomienda para producción un token ligado al negocio y no a una persona («system
  user») [S23]; se puede estudiar cuando todo funcione.

---

## Verificación final

Todo el objetivo está logrado cuando se cumplen las tres:

**1. La dirección del webhook contesta bien.** Repite los pasos 36, 37 y 38.

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

**Deberías ver:** «12345 200».

**2. Los cuatro secretos están en Cloudflare.** Haz primero el paso 11 (entrar en la carpeta) y repite el paso
33.

**Deberías ver:** «META_APP_SECRET», «META_PAGE_ID», «META_PAGE_TOKEN» y «META_VERIFY_TOKEN», cada uno con
«Value Encrypted».

**3. El circuito completo funciona con el público.** Es el paso 71.

**Deberías ver:** el mensaje de una persona sin ningún rol en «Messages» › «Facebook» › «Waiting» y, tras
«Send reply», el aviso «Reply sent on Facebook.» y la respuesta en su Messenger.

Si falla la 1 o la 2, es de los tramos 0 a 2. Si solo falla la 3, falta la aprobación o la publicación (tramos
3 y 4).

---

## Deshacer

**No ejecutes nada de esta sección salvo que quieras dar marcha atrás.** Cada apartado es independiente.

### Deshacer A — Que Meta deje de enviar mensajes a la app

📍 Navegador — developers.facebook.com, panel de la app, sección «Generate access tokens».

Abre «Add Subscriptions» de la página, desmarca «messages» y confirma. La forma exacta de quitar la
suscripción no está documentada [S10]: si no encuentras cómo, dilo en el chat.

**Deberías ver:** la página sin el campo «messages». Los mensajes siguen llegando a la bandeja de Facebook.

### Deshacer B — Apagar la entrada de mensajes en la app

📍 Chat con /avanzar.

Escribe «apaga la entrada de mensajes de Facebook». /avanzar apaga el interruptor y publica.

**Deberías ver:** la confirmación de /avanzar. Después, el paso 38 da «404».

⚠️ Haz antes el Deshacer A: con la entrada apagada y la página suscrita, Meta acumula fallos y a la hora da de
baja la suscripción.

### Deshacer C — Quitar de Cloudflare los tres secretos

📍 Terminal del VPS por SSH — usuario root — carpeta /root/HamptonJersey/.worktrees/avanzar.

⚠️ Sin estos secretos la app deja de aceptar mensajes de Facebook desde el siguiente despliegue. Cada comando
pide confirmación. Haz primero el paso 11 (entrar en la carpeta): fuera de ella, el comando no usa la
herramienta del proyecto.

```
npx wrangler pages secret delete META_PAGE_TOKEN --project-name hamptonjersey
```

Qué hace: borra el token de la página; el panel ya no podrá enviar respuestas.

```
npx wrangler pages secret delete META_PAGE_ID --project-name hamptonjersey
```

Qué hace: borra el identificador de la página.

```
npx wrangler pages secret delete META_APP_SECRET --project-name hamptonjersey
```

Qué hace: borra el App Secret; la app ya no podrá comprobar la firma de Meta.

**Deberías ver:** tras cada uno, una línea que termina en «Success! Deleted secret» y el nombre.
Después avisa en el chat para que /avanzar publique.

### Deshacer D — Si el App Secret o un token se vio donde no debía

📍 Chat con /avanzar, antes de tocar nada.

Dilo en el chat (sin pegar el valor). Lo documentado:

- El App Secret lo puede restablecer solo un administrador de la app, en «App settings» › «Basic» [F2]. Al
  cambiarlo, la app rechaza todos los avisos hasta cargar el nuevo (pasos 11 a 13, 30, 34 y 35); hay que
  hacerlo seguido, por la regla de la hora.
- Un token deja de valer si la persona que lo generó cambia su contraseña de Facebook o retira la
  autorización a la app [F13]. No hay un botón documentado para anular un solo token [S4]. Después se genera
  otro (pasos 11 a 29, 32, 34 y 35).
- Meta anula sola los tokens que detecta publicados en un repositorio público [F13].

### Deshacer E — La app, la verificación y la revisión

- El caso de uso de la app no se puede quitar [F1]. Cómo borrar la app entera no está en la documentación
  leída: si hiciera falta, dilo en el chat. Una app sin uso no causa daño.
- La verificación del negocio y la revisión de la app, una vez enviadas, no tienen marcha atrás documentada:
  solo esperar la decisión, apelar o reenviar [F24].
- Despublicar la app (deshacer el paso 70) no está documentado para este tipo de app [S11]: dilo en el chat.

---

## Fuentes

Estado: «verificado el 25-nov-2026» = la frase se leyó ese día en la página oficial y un segundo lector la
confirmó. «sin verificar: comprobar en pantalla» = no hay frase oficial que lo afirme, o las páginas se
contradicen, o solo se ve con sesión iniciada.

### Verificadas

| Ref | Dato de Meta | URL oficial | Estado |
| --- | --- | --- | --- |
| F1 | Crear la app: asistente de cinco pantallas, caso de uso de Messenger, caso de uso irreversible, opciones de la pantalla «Business», registro previo como desarrollador | https://developers.facebook.com/documentation/development/create-an-app | verificado el 25-nov-2026 |
| F2 | Nombre e icono sin marcas de Meta; el App Secret está en «Basic settings», solo un administrador lo restablece | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings | verificado el 25-nov-2026 |
| F3 | Caso de uso de Messenger: «Customize», permisos obligatorios, «Messenger API Setup», «Connect», «Configure webhooks», «Add Subscriptions», «Add to App Review», requisitos y botón de publicar, régimen de proveedor para datos de otros negocios | https://developers.facebook.com/documentation/development/create-an-app/messenger-use-case | verificado el 25-nov-2026 |
| F4 | Registro de desarrollador: términos, códigos al móvil y al correo, ocupación | https://developers.facebook.com/documentation/development/register | verificado el 25-nov-2026 |
| F5 | Acceso total («full access», antes «full control») y acceso parcial «Apps and integrations» | https://www.facebook.com/business/help/442345745885606 | verificado el 25-nov-2026 |
| F6 | Añadir la página a la cuenta de empresa: «Pages» bajo «Accounts» › «+ Add» › «Add an existing Facebook Page» | https://www.facebook.com/business/help/720478807965744 | verificado el 25-nov-2026 |
| F8 | Webhooks de Messenger: verificación por GET, clave elegida por el desarrollador, respuesta en 5 segundos, baja de la suscripción tras 1 hora de fallos, nombre antiguo de la pantalla, alternativa por API y por Business Suite, acceso estándar y avanzado | https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks | verificado el 25-nov-2026 |
| F9 | Page ID y tareas con /me/accounts; respuesta dentro de 24 horas | https://developers.facebook.com/documentation/business-messaging/messenger-platform/get-started | verificado el 25-nov-2026 |
| F10 | Tokens: el corto dura una o dos horas, el largo unos 60 días; el token de página va ligado a página, persona y app | https://developers.facebook.com/documentation/facebook-login/guides/access-tokens | verificado el 25-nov-2026 |
| F11 | Canje por token de larga duración desde un servidor; el token de página que sale de él no tiene fecha de caducidad | https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived | verificado el 25-nov-2026 |
| F13 | Comprobación de tokens (debug_token); error 190 por caducidad, cambio de contraseña o retirada de la autorización; anulación de tokens publicados en repositorios públicos | https://developers.facebook.com/docs/facebook-login/access-tokens/debugging-and-error-handling y https://developers.facebook.com/documentation/facebook-login/access-tokens/security | verificado el 25-nov-2026 |
| F14 | Visión general de Messenger: permisos que se piden, tareas MESSAGING y MODERATE, business_management como dependencia, frase «Not required if you only send and receive messages for your own Facebook Page» | https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview | verificado el 25-nov-2026 |
| F15 | Hasta aprobar la revisión, la app solo conversa con cuentas con rol de administrador, desarrollador o probador | https://developers.facebook.com/documentation/business-messaging/messenger-platform/getting-started/quick-start | verificado el 25-nov-2026 |
| F16 | Referencia de permisos: qué debe enseñar la grabación de cada permiso, pedir permisos de más es motivo de rechazo, dependencias | https://developers.facebook.com/documentation/development/permissions | verificado el 25-nov-2026 |
| F17 | Guía de envío a revisión: una descripción propia y una grabación por permiso, requisitos del vídeo, una llamada por permiso en los 30 días previos (registro en 2 días), «App Purpose», plazo de una semana, no cambiar ajustes después | https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review/submission-guide | verificado el 25-nov-2026 |
| F18 | Revisión de la app: límites de envíos, un solo envío con todos los permisos, rechazo si Meta no puede entrar | https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/app-review | verificado el 25-nov-2026 |
| F19 | Revisión de Messenger: página publicada, webhook que responde 200, usuario y clave para el revisor | https://developers.facebook.com/documentation/business-messaging/messenger-platform/app-review | verificado el 25-nov-2026 |
| F20 | Verificación del negocio: Security Center, acceso total, datos, métodos de confirmación, hasta 14 días hábiles, no es Meta Verified | https://www.facebook.com/business/help/2058515294227817 | verificado el 25-nov-2026 |
| F21 | Security Center muestra «Start verification» o «Ineligible for verification» | https://www.facebook.com/business/help/1095661473946872 | verificado el 25-nov-2026 |
| F22 | Documentos admitidos, idiomas, factura solo para dirección y teléfono, prueba de dominio si se elige correo | https://www.facebook.com/business/help/159334372093366 | verificado el 25-nov-2026 |
| F23 | Editar nombre legal, país, teléfono, web o identificador fiscal obliga a verificar de nuevo; ruta «Business info» › «Business details» › «Edit» | https://www.facebook.com/business/help/322526208728282 | verificado el 25-nov-2026 |
| F24 | Motivos de rechazo de la verificación y apelación | https://www.facebook.com/business/help/2342133782492969 | verificado el 25-nov-2026 |
| F25 | Solo un administrador del negocio completa la verificación; entrada «Settings › Basic › Verification» (redacción antigua) | https://developers.facebook.com/documentation/development/release/business-verification | verificado el 25-nov-2026 |
| F26 | Publicar: «Publish › Go live» | https://developers.facebook.com/documentation/development/release | verificado el 25-nov-2026 |
| F27 | Aviso de privacidad: enlace vivo y legible por los robots de Meta, página «clearly marked as a privacy policy», política propia, comprobación con el Sharing Debugger | https://developers.facebook.com/documentation/development/terms-and-policies/privacy-policy | verificado el 25-nov-2026 |
| F28 | Términos de la plataforma: dirección de privacidad pública y accesible «including by our crawlers»; qué debe explicar el aviso; acuerdo escrito con proveedores | https://developers.facebook.com/terms/ | verificado el 25-nov-2026 |
| F29 | Dirección de borrado de datos: vale una de instrucciones, que puede ser un apartado del aviso de privacidad | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/data-deletion-callback y https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings | verificado el 25-nov-2026 |
| F31 | Data Use Checkup anual, sin prórroga; puede exigirse antes de publicar | https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/data-use-checkup | verificado el 25-nov-2026 |
| F32 | App inactiva tras 90 días sin inicios de sesión, llamadas ni webhooks | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/app-states | verificado el 25-nov-2026 |
| F34 | Human Agent: amplía la respuesta manual a 7 días; exige revisión y verificación del negocio | https://developers.facebook.com/documentation/development/features-reference/human-agent | verificado el 25-nov-2026 |
| F36 | Reparto de conversaciones: con una sola app conectada, comportamiento por defecto | https://developers.facebook.com/documentation/business-messaging/messenger-platform/conversation-routing | verificado el 25-nov-2026 |
| F37 | «Require App Secret»: si se activa, las llamadas sin prueba del secreto fallan | https://developers.facebook.com/docs/graph-api/guides/secure-requests/ | verificado el 25-nov-2026 |
| F38 | Códigos de error al enviar (10, 100, 190, 200, 551, 613) | https://developers.facebook.com/documentation/business-messaging/messenger-platform/error-codes | verificado el 25-nov-2026 |
| F39 | Botón «Show recent errors» en la tarjeta de webhooks (página de 2025) | https://developers.facebook.com/documentation/business-messaging/messenger-platform/faq | verificado el 25-nov-2026 |
| F40 | Políticas: datos de contacto en la página, respetar a quien pide no recibir mensajes, no pedir datos de pago | https://developers.facebook.com/devpolicy/ | verificado el 25-nov-2026 |
| F42 | Errores frecuentes: no dar una cuenta de Facebook inventada al revisor | https://developers.facebook.com/docs/app-review/submission-guide/common-mistakes | verificado el 25-nov-2026 |
| F43 | «Access Verification» retirada el 9-oct-2026; la verificación del negocio y la revisión siguen igual | https://developers.facebook.com/blog/post/2026/10/09/retiring-access-verification-for-tech-provider-apps | verificado el 25-nov-2026 |
| F44 | Explorador de la API: muestra las apps en las que tienes rol y permite obtener tokens de la app elegida | https://developers.facebook.com/docs/graph-api/guides/explorer | verificado el 25-nov-2026 |
| F45 | Versión v27.0 de la API (introducida el 4-nov-2026) | https://developers.facebook.com/documentation/development/graph-api/changelog | verificado el 25-nov-2026 |
| F46 | Solo llegan los campos suscritos a la vez en la app y en la página | https://developers.facebook.com/docs/graph-api/reference/page/subscribed_apps/ | verificado el 25-nov-2026 |
| F47 | Preguntas de tratamiento de datos: encargados, países, responsable | https://developers.facebook.com/docs/resp-plat-initiatives/individual-processes/data-handling-questions/questions-preview | verificado el 25-nov-2026 |
| F48 | La cuenta de empresa puede exigir la verificación en dos pasos a sus miembros | https://www.facebook.com/business/help/280940009201586 | verificado el 25-nov-2026 |
| F49 | Revisiones posteriores: si Meta no puede entrar a probar la app, puede desactivarla | https://developers.facebook.com/documentation/resp-plat-initiatives/individual-processes/ongoing-reviews | verificado el 25-nov-2026 |
| F50 | Plazo de la revisión: menos de una semana, a menudo 2 o 3 días | https://developers.facebook.com/docs/resp-plat-initiatives/app-review/introduction | verificado el 25-nov-2026 |

### Sin verificar

| Ref | Dato | URL oficial más cercana | Estado |
| --- | --- | --- | --- |
| S1 | Nombre del botón para mostrar el App Secret y si pide la contraseña | https://developers.facebook.com/documentation/facebook-login/security | sin verificar: comprobar en pantalla |
| S2 | Si una app sin publicar recibe los mensajes de cuentas con rol | https://developers.facebook.com/documentation/business-messaging/messenger-platform/webhooks | sin verificar: comprobar en pantalla |
| S3 | Si atender solo la página propia exige la revisión (las páginas oficiales se contradicen) | https://developers.facebook.com/documentation/business-messaging/messenger-platform/overview | sin verificar: comprobar en pantalla |
| S4 | Qué valor muestra un token sin caducidad; si el token de página caduca (páginas contradictorias); cómo anular un solo token | https://developers.facebook.com/documentation/pages-api/overview | sin verificar: comprobar en pantalla |
| S5 | Si «Jersey» está en la lista de países y qué documentos de Jersey se aceptan | https://www.facebook.com/business/help/159334372093366 | sin verificar: comprobar en pantalla |
| S6 | Que con «Ineligible for verification» la verificación se abra desde la app | https://www.facebook.com/business/help/2058515294227817 | sin verificar: comprobar en pantalla |
| S7 | Cómo cumplir la grabación del «inicio de sesión con Facebook» sin botón de Facebook en el panel; si vale un mismo vídeo para todos los permisos | https://developers.facebook.com/docs/app-review/submission-guide/screen-recordings | sin verificar: comprobar en pantalla |
| S8 | Si el panel obliga a pedir «pages_read_engagement» o acceso avanzado de «public_profile» | https://developers.facebook.com/documentation/development/permissions | sin verificar: comprobar en pantalla |
| S9 | Qué distribución de pantalla muestra hoy el panel de la app y si aparece «App Purpose» | https://developers.facebook.com/documentation/development/create-an-app/messenger-use-case | sin verificar: comprobar en pantalla |
| S10 | Dónde se suscribe el campo a nivel de app en la pantalla nueva; si «Add Subscriptions» equivale a la llamada por API; cómo se quita | https://developers.facebook.com/documentation/development/create-an-app/messenger-use-case | sin verificar: comprobar en pantalla |
| S11 | Qué hace el panel cuando falla la verificación de la dirección; que publicar vaya después de la revisión en este tipo de app; cómo despublicar | https://developers.facebook.com/documentation/development/release | sin verificar: comprobar en pantalla |
| S12 | Si el robot de Meta lee una dirección con «#/privacy»; si el Sharing Debugger muestra el código de respuesta | https://developers.facebook.com/documentation/sharing/webmasters/web-crawlers | sin verificar: comprobar en pantalla |
| S13 | Rótulos «People» e «Invite people» de los ajustes de la cuenta de empresa | https://www.facebook.com/business/help/442345745885606 | sin verificar: comprobar en pantalla |
| S14 | Si la cuenta de empresa aparece en la pantalla «Business» con acceso parcial | https://developers.facebook.com/documentation/development/create-an-app | sin verificar: comprobar en pantalla |
| S15 | Que convenga crear la app en la cuenta de empresa dueña de la página (recomendación razonada) | https://developers.facebook.com/documentation/business-messaging/messenger-platform/introduction/general-best-practices | sin verificar: comprobar en pantalla |
| S16 | Rótulos «Add a Permission» y «Generate Access Token» del explorador; qué llamada registra «business_management» | https://developers.facebook.com/docs/graph-api/guides/explorer | sin verificar: comprobar en pantalla |
| S17 | Categorías disponibles (página de 2020) y si el panel exige «Terms of Service URL» | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/app-categories | sin verificar: comprobar en pantalla |
| S18 | Si el panel exige el contacto de un delegado de protección de datos a un negocio de Jersey | https://developers.facebook.com/documentation/development/create-an-app/app-dashboard/basic-settings | sin verificar: comprobar en pantalla |
| S19 | Que exista hoy «Page Settings › Advanced Messaging» con ese nombre | https://developers.facebook.com/documentation/business-messaging/messenger-platform/policy | sin verificar: comprobar en pantalla |
| S20 | Que el canje exija que el token corto sea de la misma app | https://developers.facebook.com/documentation/facebook-login/guides/access-tokens/get-long-lived | sin verificar: comprobar en pantalla |
| S21 | Si el mensaje de la cuenta de prueba del revisor llega antes de la aprobación | https://developers.facebook.com/documentation/business-messaging/messenger-platform/app-review | sin verificar: comprobar en pantalla |
| S23 | Token de «system user» para producción (recomendado por Meta; permisos del diálogo sin ver) | https://developers.facebook.com/documentation/business-messaging/messenger-platform/introduction/general-best-practices | sin verificar: comprobar en pantalla |

### No son datos de Meta

- [S22] Los pasos 30 a 33 y el Deshacer C usan wrangler 4.148.0. Que acepte el valor por la entrada del comando
  y los textos «Success! Uploaded secret», «Value Encrypted» y «Success! Deleted secret» se han leído en el
  código de esa versión; **no se han ejecutado** contra Cloudflare.
- Las respuestas 404, 503 y 403 del webhook y los rótulos del panel («Messages», «Facebook», «Waiting», «Send
  reply», «Reply sent on Facebook.») salen del código de la app, comprobado el 25-nov-2026.
