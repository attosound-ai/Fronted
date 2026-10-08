# Registro de pruebas, commit 6ab3a5b (build 240)

Build de producción compilado el 7 oct 2026 de 19:18 a 19:39, subido a las 19:41 y procesado a las 19:44. La liberación al grupo Public Beta espera el visto bueno de David (ver al final). Compilado con `ATTO_RELEASE_GATE_OVERRIDE=emergency`: desde 95163ac (build 236, registro en 95163ac.md) cambian los comentarios, los mensajes eliminados, el parche del menú de mensajes, la consulta del número de puente, dos textos y la dirección de los videos patrocinados. El código de llamadas no cambió (`git diff 95163ac..6ab3a5b` vacío en callAudio, calls, telephony, components/call, hooks y modules).

Los builds 237 a 239 no llegaron a nadie: el 237 se detuvo a mitad para incluir el arreglo de los comentarios, el 238 no existe (el contador remoto saltó) y el 239 (16e39a3) se compiló y no se subió, porque la revisión de la telemetría destapó cuatro fallos más. El 240 lleva todo.

David, 7 oct: "no podemos dejar ningún error vigente".

Esta vez no se usó el iPhone de David: estuvo desbloqueado, en uso, toda la tarde. Todo se miró en el simulador "iPhone 17 ATTO" (cuenta de prueba 300, la 301 actúa por la API), recompilado a las 19:55 de este mismo commit para que llevara el parche nativo del menú. Evidencia en `.build-out/evidencia-240/`.

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
| M-LISTA-VIVO | OK | 7 oct 20:00, simulador: con la lista abierta, la fila pasó a "1 sin leer" 2,6 s después del envío (mensaje a0310538); `lista_en_vivo_1_sin_leer.png` |
| M-CHAT-VIVO | OK | 7 oct 20:00, simulador: con el chat abierto, el mensaje a535b772 llegó a los 2,0 s y aparece una sola vez (también 3 s después); `chat_en_vivo_una_vez.png` |
| M-RECONEXION | OK | 95163ac.md (7 oct 11:38, iPhone de David); el camino de reconexión no cambió |
| M-PUSH-CUENTA | OK | b6577ca.md |
| M-PUSH-REPETIDO | OK | 4f10baa.md |
| M-CAMBIO-CHAT | OK | 4f10baa.md |
| M-EFECTOS | OK | 95163ac.md y cd048a4.md; los efectos no cambiaron |
| P-PUBLICAR | OK | 4f10baa.md |
| C-BORRAR | OK | 4f10baa.md |
| M-MENU-BORRADO | OK | 7 oct 19:57, simulador con el parche: menú abierto, la otra cuenta borra el mensaje 2053c3fa, se cierra el menú y la app sigue; sin el parche el mismo paso la cerró a las 17:05 (`antes_cierre_sin_parche_17_05.ips`) |
| F-COMENTARIO | OK | 7 oct 18:15, simulador a través del proxy de mala conexión: publicando, fallido, reintento y descarte; captura en Descargas |
| F-CONTADOR | OK | 7 oct 18:32, producción: 20 de 20 publicaciones del feed coinciden con su lista (`contador/ver.py`); 18:53, simulador: de 4 a 1 al borrar un comentario con dos respuestas |
| A-NUMERO | OK | 7 oct 18:47, simulador, cuenta no creadora: sin fila de número, una petición y ningún reclamo en 24 s (`registro_proxy_ajustes.txt`) |

## Qué se corrigió y cómo se comprobó

### Un comentario que no se pudo enviar se queda a la vista (16e39a3)

Cliente, 7 oct 17:19 (video): dos comentarios desaparecieron tras 15 s de espera. El servidor nunca los recibió (registro del gateway: todo lo que llegó se respondió en 10 a 50 ms); la app los quitaba en silencio. Ahora quedan en la lista con "No se pudo publicar", Reintentar y Eliminar, y se puede seguir escribiendo mientras uno va en camino. Visto en el simulador a través de un proxy que deja la petición sin respuesta: publicando, fallido, un segundo comentario con el primero fallido, reintento con éxito y descarte.

### El número de comentarios es el de la lista (backend 2b33bc5, front 1672d82)

Una publicación mostraba 3 con 1 comentario. Borrar restaba uno al número guardado, pero ese número se vuelve a contar desde la tabla cada diez minutos y esa cuenta incluía los borrados. Ahora hay una sola definición para todas las cuentas y borrar vuelve a contar. La lista devuelve todas las respuestas (antes tres) y una respuesta a una respuesta cuelga del comentario.

| Dónde | Antes | Ahora |
|---|---|---|
| Producción, feed de 20 publicaciones | 19 coinciden; la del cliente 3 con 1 real | 20 coinciden; la del cliente 1 |
| Servicio social, 9 pruebas sobre PostgreSQL real | las 9 fallan | las 9 pasan |
| App, borrar un comentario con dos respuestas | baja 1 | baja 3 de una vez (de 4 a 1) y queda en 1 |

### Mensaje eliminado como en WhatsApp (1758713, backend aaf8a78)

El globo dice "Este mensaje fue eliminado" o "Eliminaste este mensaje" con la hora, y la lista de chats lo dice cuando era el último. Visto en español en el simulador, en vivo con la lista abierta (`lista_dice_mensaje_eliminado.png`). De paso, "Hoy", "Ayer" y "Leído" siguen el idioma.

### La app ya no se cierra si se borra un mensaje con su menú abierto (47a4ce6)

Sentry REACT-NATIVE-5V: iOS pide la vista del globo para animar el cierre del menú, y esa vista ya no está en pantalla. El parche nativo devuelve vacío en ese caso. Antes y después en el mismo simulador: a las 17:05 sin el parche se cerró (`BUG_IN_CLIENT_OF_TARGETED_PREVIEW__VIEW_IS_NOT_IN_A_WINDOW`); a las 19:57 con el parche el mismo paso deja la app abierta y el globo como eliminado. El menú normal sigue igual: abrir y cerrar tocando fuera, y abrir y elegir Copiar.

### El número de puente se pregunta una vez (backend 516ec2a, front 865b5a8)

Ajustes preguntaba cada 4 s mientras estuviera abierto y reclamaba cada vez; una cuenta que no es de creador veía "en preparación" para siempre (50 rechazos 403 de una sola cuenta en tres días). El servidor responde ahora `unavailable` y las versiones ya publicadas ocultan la fila; la app nueva deja de preguntar. 19 pruebas en pagos y 13 en la app.

### Textos (865b5a8, 1672d82)

La tarjeta de Ajustes decía "Listener" con la app en español: la clave no existía en ningún idioma. Ahora "Oyente". "Ver todos los 1 comentarios" pasa a "Ver 1 comentario". Vistos en el simulador.

### Videos patrocinados por streaming (6ab3a5b)

El panel guarda la dirección entera del archivo y la app solo optimizaba ids: los seis anuncios se reproducían con su archivo original (19,9 y 31,7 MB los dos mayores), sin carátula, y el 2 % terminaba en error. Ahora van por streaming adaptativo con carátula, en la nube en la que viva cada uno. Contra Cloudinary los seis responden con 3 a 5 calidades. En el simulador Samsung carga en 1,5 s y Accesify en 1,1 s, sin errores. La regla es solo para anuncios: un video del chat sigue reproduciendo su propio archivo (hay prueba que lo fija).

## Pruebas unitarias

402 en verde en la app (`bash scripts/test-timeline.sh`), 35 nuevas en esta ronda. 78 en el servicio social y 128 en pagos.

## Qué falta

1. Liberar el 240 al grupo Public Beta: espera el visto bueno de David.
2. Nada de esto se miró en un iPhone real. El único cambio nativo es el parche del menú, visto en el simulador con el mismo código Swift.
3. Los comentarios de prueba nunca salieron del proxy. La excepción fue el primer intento de las 18:10, que llegó a una publicación real durante un minuto y se borró; desde entonces se comprueba por dónde va el tráfico antes de escribir.
