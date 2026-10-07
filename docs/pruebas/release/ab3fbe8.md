# Registro de pruebas, commit ab3fbe8 (build 234)

Build de producción compilado el 7 oct 2026 a las 08:12, subido a App Store Connect a las 08:14 y procesado a las 08:20. Compilado con `ATTO_RELEASE_GATE_OVERRIDE=emergency`: desde cd048a4 (build 233, registro en cd048a4.md) solo cambian los efectos de los mensajes y dos estilos que aplican únicamente en Android. El código de llamadas no cambió.

David, 7 oct: "no podemos dejar ningún error vigente", sobre los hallazgos de la prueba de efectos del 6 oct.

| ID | Estado | Evidencia |
|---|---|---|
| L-FRIA-UNA | OK | 4f10baa.md; sin cambios en el código de llamadas |
| L-FRIA-DOS | OK | 4f10baa.md |
| L-FRIA-RAPIDA | OK | 4f10baa.md |
| L-ABIERTA | OK | b6577ca.md |
| L-BLUETOOTH | OK | 4f10baa.md; sin cambios en el motor de audio |
| L-BLOQUEADA | OK | 4f10baa.md |
| L-DIGITO-IOS | OK | 4f10baa.md |
| L-COLGAR-ATTO | OK | b6577ca.md |
| L-COLGAR-OTRO | OK | 4f10baa.md |
| L-RECHAZAR | OK | 4f10baa.md |
| L-RECHAZAR-DOS | OK | 4f10baa.md |
| L-PERDIDA | OK | 4f10baa.md |
| L-SILENCIO | OK | 4f10baa.md |
| M-LISTA-VIVO | OK | 7 oct 09:09, emulador Android: el primer mensaje del simulador apareció en la lista abierta, con su contador de no leídos |
| M-CHAT-VIVO | OK | 7 oct 09:10 a 09:13: cuatro mensajes entre simulador y emulador con el chat abierto en ambos, cada uno llegó una vez y en vivo |
| M-RECONEXION | OK | 4f10baa.md |
| M-PUSH-CUENTA | OK | b6577ca.md |
| M-PUSH-REPETIDO | OK | 4f10baa.md |
| M-CAMBIO-CHAT | OK | 4f10baa.md |
| M-EFECTOS | OK | 7 oct 09:10 a 09:13, ver abajo; en teléfonos reales, cd048a4.md |
| P-PUBLICAR | OK | 4f10baa.md |
| C-BORRAR | OK | 4f10baa.md |

## Un efecto arranca una sola vez por mensaje (10c145b)

Segundo "teléfono" de cada lado, porque el iPhone de David no estaba al alcance y el Samsung estaba desconectado: simulador "iPhone 17 ATTO" (compilación de depuración del mismo commit, cuenta de prueba 299) y emulador Android `atto_android15` (APK del perfil preview, cuenta de prueba 298). Evidencia en `.build-out/evidencia-234/`: grabaciones de los dos y el evento `messages_effect_played` (PostHog, y el registro de Metro para iOS).

| Prueba | Efecto | Quien envía | Quien recibe |
|---|---|---|---|
| iOS a Android | pantalla, confeti | iOS 1 vez (09:10:27) | Android 1 vez (09:10:27) |
| Android a iOS | pantalla, foco | Android 1 vez (09:12:16) | iOS 1 vez (09:12:15) |
| iOS a Android | burbuja, golpe | iOS 1 vez (09:12:59) | Android 1 vez (09:13:00) |
| Android a iOS | burbuja, fuerte | Android 1 vez | iOS 1 vez (09:13:40) |

Antes del arreglo (6 oct, iPhone y Samsung reales) un efecto de pantalla arrancaba 5 veces en el iPhone que envía, 3 en el iPhone que recibe y 4 en el Android que envía.

Las reglas nuevas (`nextScreenEffect`, `effectIdsOf`, `isFreshForEffect`) tienen ocho pruebas unitarias; la suite completa pasa (358).

## Solo Android (no afecta a este build de iOS)

* La cabecera del chat muestra avatar, nombre y estrella (437ab87). Antes: avatar recortado y sin nombre.
* La hora de cada mensaje se dibuja una sola vez (ab3fbe8). Antes: dos copias superpuestas.

Ambas vistas en el emulador, con capturas del antes y el después.

## Lo que falta para pasarlo al grupo público

Este registro se escribió con el 234 solo en el grupo interno. Falta repetir un efecto de pantalla en el iPhone de David con el build de prueba fix28 (mismo código de iOS): al enviar y al recibir, un solo `messages_effect_played`. No se hizo porque David estaba usando el teléfono y luego salió con él.
