# Registro de pruebas, commit aff91bf (salida de emergencia)

26 oct 2026. Binario probado: ipa de prueba `atto-prueba-aff91bf` (preview de aff91bf, informa build 244), en el iPhone 15 Pro Max de David, cuentas westcol 281 y david.espejo 280.

**Esta versión sale con `ATTO_RELEASE_GATE_OVERRIDE=emergency`, por decisión de David (26 oct 2026, "Subir ya, de emergencia").** Se le explicó antes que el control pide los 33 casos críticos y que esta es la primera build con Xcode 27 y mínimo iOS 16, lo que cambia la capa nativa de las llamadas. Los 33 casos de `CASOS_CRITICOS.txt` NO se repitieron en esta versión; su última evidencia es la del registro de e825e44 (build 244). Si algo de llamadas falla en esta build, el primer sospechoso es el cambio de Xcode 27 y de iOS 16 (93ec2c5, aa4bbed, 350d754).

Desde e825e44 (build 244) entran:

| Commit | Cambio | Prueba |
|---|---|---|
| 8e1b914 | La cabecera ya no queda sin logo cuando una imagen remota falla (Cloudinary da9vymoah deshabilitada) | David: probado y confirmado |
| a6abfe9 | Un post abierto desde una notificación o desde guardados muestra sus contadores | 26 oct 14:45 UTC: push de me gusta de la QA 307 en el post 6adf671eefc6bc677c7ee9f4 de westcol, app en segundo plano, abrió el post con 1 me gusta (`messages_push_tap_handled` opened) |
| 258e4e5 | Un video que se sube o falló ya no desaparece del chat; "escribiendo" se ve con el teclado abierto | David: probado y confirmado |
| 93ec2c5, aa4bbed, 350d754 | Xcode 27: pods a iOS 16, menú contextual y expo-router con subtitle en iOS 16, app con mínimo iOS 16.0 | Compila y abre; casos críticos no repetidos (ver arriba) |
| e5dc194 | La copia de EAS reintenta la descarga de FFmpeg y frena si falta | El ipa de prueba enlazó FFmpeg |
| aff91bf | El toque de un push con la app cerrada espera a que carguen las cuentas (antes abría el feed; 29 de 59 toques perdidos en 30 días) | 26 oct 17:41 UTC: comentario de la QA 307, app cerrada del todo, abrió el post con 2 comentarios y 1 me gusta. David: "funcionó perfecto" |

La QA 307 (qapush2bac3e) se borró a las 17:44 UTC por la ruta de operador, con su me gusta y sus dos comentarios quitados antes (registrada en account_deletions).
