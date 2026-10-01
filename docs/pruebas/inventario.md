# Inventario de pruebas de ATTO

Última actualización: 30 de septiembre de 2026. Dueño: quien toque el código.

Este documento existe por una razón: arreglábamos una cosa y se rompía otra, y lo descubría el cliente en una llamada real. Aquí queda escrito qué puede hacer una persona con la app, qué combinaciones la rompen y cómo se comprueba cada una. Nada se da por bueno si no está en esta lista con su prueba.

## Reglas

1. **Probado significa visto, no supuesto.** Un caso está probado cuando alguien lo ejecutó en el build que se va a entregar y vio el resultado esperado. Que compile no es una prueba.
2. **Cada fallo del cliente entra aquí el mismo día**, con su causa, y deja una prueba que lo habría detectado. Si la lógica es pura, la prueba es automática. Si depende del teléfono, queda como escenario de dispositivo o manual.
3. **Antes de cambiar algo se lee su sección** y después del cambio se vuelve a correr completa, no solo el caso que se arregló.
4. **Se intenta romper antes de entregar.** Para cada cambio se recorre la lista "Cómo romperla" de su área.
5. **Antes de subir a TestFlight** pasan las pruebas automáticas (`npm run test:timeline`), el recorrido de dispositivo de las áreas tocadas y, si se tocó algo de llamadas, una llamada real.
6. **Lo que no se pudo probar se dice**, con nombre y motivo, en el mensaje de entrega.

## Las tres capas

| Capa | Qué cubre | Cómo se corre |
|---|---|---|
| A. Automática | Decisiones puras: límites, reglas, modelos de estado | `npm run test:timeline` (233 pruebas, 22 archivos; falla si existe un archivo de pruebas sin registrar) |
| D. Dispositivo con guion | Pantallas y gestos en el iPhone real, con capturas | WebDriverAgent y los guiones `at.sh`, `hold.sh` del scratchpad |
| M. Manual con llamada real | Audio de llamadas, Bluetooth, pantalla bloqueada | Dos teléfonos; guion al final de este documento |

Estado de cada escenario: **OK** (probado en el build indicado), **NUEVO** (arreglado, falta probarlo en dispositivo), **SIN PROBAR** (nunca se ha comprobado), **FALLA** (fallo conocido y abierto).

## 1. Llamadas entrantes

Origen de casi todos los incidentes. Variables que se combinan: estado de la app (abierta, en segundo plano, teléfono bloqueado, app cerrada), dónde se marca el dígito (teclado de ATTO, pantalla de llamada de iOS), salida de audio (auricular, altavoz, Bluetooth) y cuándo cambia.

| ID | Escenario | Esperado | Capa | Estado |
|---|---|---|---|---|
| L01 | Contestar con la app abierta, dígito en el teclado de ATTO | Teclado sobre el feed, al marcar se abre la grabadora | A + M | OK automática (callLandingModel), manual sep 23 |
| L02 | Contestar con el teléfono bloqueado, dígito en la pantalla de iOS, luego abrir ATTO | No aparece el teclado, se abre la grabadora | A + M | NUEVO. Fallo del cliente del 30 de sep: esperó el dígito 15 minutos |
| L03 | Contestar bloqueado, no marcar nada, abrir ATTO | Aparece el teclado de ATTO | M | SIN PROBAR |
| L04 | App cerrada del todo, entra la llamada | Suena, se contesta, hay audio en ambos sentidos | M | OK sep 23 (build 10) |
| L05 | Dígito en ATTO, la app muere y se relanza en plena llamada | La app recuerda el dígito, no vuelve a pedirlo | A + M | NUEVO (el dígito se guarda en nativo) |
| L06 | Llamada de más de 2 minutos sin dígito registrado | Se asume aceptada, abre la grabadora | A | OK automática (callAcceptance) |
| L07 | Bluetooth conectado ANTES de contestar | Voz clara en ambos sentidos | M | OK sep 25 (24 kHz) |
| L08 | Conectar Bluetooth A MITAD de llamada | Voz clara en ambos sentidos tras el cambio | M | FALLA o sin causa probada. Sep 30: "sueno como robot". Red limpia. Ahora queda diagnóstico del motor tras cada cambio |
| L09 | Quitar Bluetooth a mitad de llamada | El audio pasa al teléfono sin cortes largos | M | SIN PROBAR |
| L10 | Cambiar a altavoz desde el selector de iOS | Se queda en altavoz | M | OK b154 |
| L11 | Colgar desde ATTO y desde la pantalla de iOS | La llamada termina, la barra verde desaparece | M | SIN PROBAR recientemente |
| L12 | Segunda llamada apenas termina la primera | Contesta y abre la grabadora de nuevo | M | OK sep 30 (llamada 2 del cliente) |
| L13 | Bloquear el teléfono con la llamada activa 3 minutos | La llamada sigue viva | M | OK tras el arreglo del 22 de sep |
| L14 | Wifi a datos móviles en plena llamada | La llamada se recupera | M | SIN PROBAR |
| L15 | Cambio de cuenta (representante a creador) con llamada entrando | Contesta la cuenta correcta | M | OK tras el incidente de cambio de cuenta |

**Cómo romperla:** contestar desde el reloj o los audífonos; marcar el dígito dos veces; abrir y cerrar el teclado antes de marcar; conectar y quitar los audífonos tres veces seguidas; recibir una notificación o una alarma durante la llamada; poner la app en segundo plano y volver diez veces.

## 2. Grabar durante la llamada

| ID | Escenario | Esperado | Capa | Estado |
|---|---|---|---|---|
| G01 | Toma con "otra persona" encendida y "mi voz" apagada (por defecto) | La hoja lo dice con palabras; la toma solo tiene a la otra persona | D + M | NUEVO. Antes decía "Recording your mic and the call" |
| G02 | Toma con las dos voces | La toma tiene las dos | M | SIN PROBAR |
| G03 | Toma con solo mi voz | La toma solo tiene mi voz | M | SIN PROBAR |
| G04 | Ninguna voz encendida | No deja grabar y explica por qué | D | NUEVO |
| G05 | Nadie habla durante la toma | Onda plana y, a los 4 s, aviso de que no entra sonido | M | NUEVO |
| G06 | Grabar, colocar, publicar | La publicación sale y el clip SIGUE en el proyecto | A + M | NUEVO. Fallo del 30 de sep |
| G07 | Grabar, publicar, cerrar el editor y tocar Descartar | No se borra lo publicado. Si hay audio nuevo sin publicar, avisa cuántas grabaciones y cuánto duran, y pide confirmar aparte | A + M | NUEVO (closePlan) |
| G08 | Cerrar el editor sin haber cambiado nada | Cierra sin preguntar | A + D | NUEVO |
| G09 | Toma de más de 10 minutos | Se guarda completa | M | SIN PROBAR |
| G10 | La llamada se cae en plena toma | La toma hasta ese punto se conserva | M | SIN PROBAR |
| G11 | Grabar sobre un proyecto que ya tiene pistas | La toma cae en la pista y posición elegidas | M | OK sep 23 |

**Cómo romperla:** tocar grabar dos veces rápido; cerrar la hoja mientras graba; cambiar los interruptores justo antes de grabar; publicar y volver al editor de inmediato; Descartar en cada combinación.

## 3. Reproducir y transmitir en la llamada

| ID | Escenario | Esperado | Capa | Estado |
|---|---|---|---|---|
| R01 | Reproducir un proyecto de menos de 30 min con transmisión encendida | La otra persona lo oye | M | OK sep 23 (llamada grabada en el puente) |
| R02 | Proyecto de 30 a 90 min | Reproduce | M | OK build 226 (límite subido a 90 min) |
| R03 | Proyecto de más de 90 min | Mensaje claro con el límite | D | SIN PROBAR |
| R04 | Transmisión apagada | Yo lo oigo, la otra persona no | M | OK |
| R05 | Reproducir, pausar, mover la línea, reproducir | Retoma donde se indicó | M | SIN PROBAR recientemente |

## 4. Editor

| ID | Escenario | Esperado | Capa | Estado |
|---|---|---|---|---|
| E01 | Deslizar sobre espacio vacío o sobre un clip | Mueve la vista, con inercia | D | OK sep 29 |
| E02 | Mantener presionado un clip y arrastrar | Mueve el clip | D | OK sep 29 |
| E03 | Mantener presionado sin mover | No crea paso de deshacer | D | OK sep 29 |
| E04 | Botón atenuado | Dice por qué, con icono de advertencia | D | OK sep 29 |
| E05 | Zoom: ajustar todo el proyecto, máximo detalle | Onda visible en ambos extremos | A + D | OK build 226 |
| E06 | Reproducir 41 min a zoom máximo 5 min | Memoria estable | D | OK build 226 (266 a 309 MB) |
| E07 | Importar audio de más de 50 MB que al convertir cabe | Sube con progreso | D | OK sep 29 |
| E08 | Importar audio que no cabe ni convertido | Mensaje con tamaño, límite y minutos | D | OK sep 29 |
| E09 | Onda de un audio importado | Sin pico falso al inicio | A | OK automática; falta verlo en dispositivo |
| E10 | Aplicar Amplify y deshacer | Cambia y vuelve | D | OK sep 29 |
| E11 | Tocar un efecto bloqueado | El aviso nombra el efecto | D | NUEVO (compilado, falta verlo) |
| E12 | Exportar mezcla que no cabe en una publicación | Avisa antes, ofrece AAC o solo el tramo | A + D | OK sep 29 |
| E13 | Publicar AAC | Llega como .m4a y se reproduce | D | OK sep 29 |

**Cómo romperla:** proyectos de 0 clips, de 1 clip de 2 segundos y de 60 minutos; cortar en el borde exacto de un clip; pegar sin haber copiado; deshacer veinte veces; girar el teléfono; salir a mitad de una importación.

## 5. Publicar

| ID | Escenario | Esperado | Capa | Estado |
|---|---|---|---|---|
| P01 | Publicar video corto | Vuelve al feed al instante, franja con porcentaje, "Publicado", el post se reproduce | D | OK sep 29 |
| P02 | Video 4K HDR de 150 MB | Se comprime en el teléfono y se publica | D | OK sep 29 (15.8 MB, 30 s) |
| P03 | Video de más de 6 minutos | Aviso al elegirlo | A + D | OK sep 29 |
| P04 | Cerrar la app a mitad de la subida | Al volver: "interrumpido" con Reintentar | A + D | OK sep 29 |
| P05 | El archivo ya no existe al reintentar | Lo dice y ofrece Descartar | D | OK sep 29 |
| P06 | Sin conexión durante la subida | Error claro a los 60 s, Reintentar | D | SIN PROBAR |
| P07 | Live Activity: anillo en la isla, aviso al salir de la app | Se ve y se actualiza | D | OK sep 29 (anillo); estado final sin capturar |
| P08 | Dos publicaciones seguidas | Salen en orden, dos franjas | D | SIN PROBAR |
| P09 | Publicar audio desde una llamada activa | Sale y el proyecto queda intacto | M | NUEVO (ver G06) |

## 6. Lo que este inventario todavía no cubre

Mensajes, registro, pagos, perfil y notificaciones no tienen escenarios escritos. Se agregan la primera vez que se toque cada área, antes de tocarla.

## Guion de la prueba con llamada real (30 de septiembre)

Dos teléfonos: el que llama (A) y el iPhone con ATTO (B). Anotar la hora de cada paso para cruzarla con la telemetría.

1. **L02.** B bloqueado. A llama. Contestar desde la pantalla bloqueada y marcar el dígito ahí mismo. Hablar 20 segundos. Desbloquear y abrir ATTO. Esperado: sin teclado, se abre la grabadora.
2. **G01 y G05.** En la grabadora abrir la hoja de toma. Leer qué dice que va a grabar. Grabar 10 segundos SIN que A hable. Esperado: onda plana y aviso de que no entra sonido.
3. **G02.** Encender "Grabar mi voz". Grabar 10 segundos hablando los dos. Escuchar la toma: deben estar las dos voces.
4. **G06 y G07.** Colocar la toma, publicar. Volver al editor, cerrarlo. Si pregunta, tocar Descartar. Esperado: el clip sigue en el proyecto.
5. **L08.** Sin colgar, conectar unos audífonos Bluetooth. Preguntar a A cómo se oye durante 30 segundos. Luego quitarlos y preguntar de nuevo.
6. **L01.** Colgar. A llama otra vez con ATTO abierta. Marcar el dígito en el teclado de ATTO. Esperado: se abre la grabadora.
7. **L03.** Colgar. A llama, contestar bloqueado y NO marcar. Abrir ATTO. Esperado: aparece el teclado.
8. **L13.** Con la llamada activa, bloquear el teléfono 3 minutos. Esperado: la llamada sigue.
