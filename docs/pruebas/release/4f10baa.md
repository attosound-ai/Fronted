# Registro de pruebas, commit 4f10baa (build 229), salida de emergencia

David pidió compilar y dejar el build en revisión de Apple antes de salir con el teléfono (4 oct 2026). El build se compila con `ATTO_RELEASE_GATE_OVERRIDE=emergency` y se agrega SOLO al grupo interno; no va a Public Beta hasta que los casos PENDIENTE de abajo pasen en el teléfono.

Cambios desde 71675f0 (registro completo en 71675f0.md, 17 de 22 OK en fix8): motor de audio fijo en 48 kHz (AirPods a media velocidad), alarmas de audio, resumen de desajustes corregido, aviso de número falso en el registro.

| ID | Estado | Evidencia |
|---|---|---|
| L-FRIA-UNA | OK | fix8 (71675f0), sin cambios de llamada después salvo el formato de audio |
| L-FRIA-DOS | OK | fix8; fix10 contestó en frío con dos cuentas en las 7 corridas de tonos |
| L-FRIA-RAPIDA | OK | fix8 |
| L-ABIERTA | OK | fix8 |
| L-BLUETOOTH | OK | fix10 (9a63c77): sin audífonos, AirPods toda la llamada, entran a mitad x2, llamada siguiente con salto A2DP 48k a HFP 24k x2, David se los quita a mitad de toma: tomas exactas 1000/500 Hz, ~48000 fps medidos, motor sin reinicio, David oyó todo bien |
| L-BLOQUEADA | OK | build 229 de TestFlight, 5 oct 05:10 UTC: David contestó con el teléfono bloqueado (camino frío, 7,1 s), dígito 1 enviado, grabadora abierta, toma grabada y colocada, 70 s estable hasta el cuelgue remoto |
| L-DIGITO-IOS | OK | fix8 y las 7 corridas de fix10 (dígito 1 abre el editor) |
| L-COLGAR-ATTO | OK | fix8: 2,3 / 1,6 / 1,4 s |
| L-COLGAR-OTRO | OK | fix8 y fix10 (todas las corridas cuelgan desde Twilio) |
| L-RECHAZAR | OK | fix8, 0,9 s |
| L-RECHAZAR-DOS | OK | fix8, hermana canceled 0,9 s después |
| L-PERDIDA | OK | fix8 |
| L-SILENCIO | OK | fix8, 16 de 16 s con tono tras silenciar |
| M-LISTA-VIVO | OK | fix8, 0,8 s |
| M-CHAT-VIVO | OK | fix8, 2,3 s, una vez |
| M-RECONEXION | OK | fix8, 17,1 min, 1,9 s |
| M-PUSH-CUENTA | OK | build 229: push para 280 con 281 activa, David lo tocó: messages_push_tap_handled switched_then_opened, cambio 281 a 280, un solo /chat y un solo join; captura con los mensajes de 280 a la derecha |
| M-PUSH-REPETIDO | OK | build 229: el segundo aviso del mismo toque dio replay_skipped; después llamada en frío, cambio automático a 281 y dos cambios manuales: ningún /chat, feed en pantalla |
| M-CAMBIO-CHAT | OK | fix8 |
| M-EFECTOS | PENDIENTE | necesita el Samsung |
| P-PUBLICAR | OK | fix8 |
| C-BORRAR | OK | backend, escaneo limpio |

Sobre el binario 229 mismo (TestFlight, 5 oct 2026): contestar en frío con dos cuentas 12,5 s y 13,6 s; teléfono bloqueado con AirPods (motor 48000, hardware 24000, ~47976 fps medidos, call_engine_rate_summary clean, sin alarmas); rechazar 0,5 s con la hermana canceled; colgar desde ATTO 1,6 s; silenciar transmitiendo 17 de 17 s con tono.

Hallazgo nuevo, no bloquea (ya existía): los borradores del chat se guardan por conversación y no por cuenta, y el texto cargado por la edición vieja queda como borrador.
