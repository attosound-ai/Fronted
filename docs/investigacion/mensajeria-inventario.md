# Mensajería ATTO: inventario contra WhatsApp, Telegram e iMessage

Fecha: 21 de septiembre de 2026. Objetivo: replicar en el chat de ATTO la experiencia completa de las tres apps de referencia (layout, contraste, funciones y sobre todo animaciones), usando componentes nativos de iOS siempre que exista uno. Estilo ATTO: blanco y negro, sin líneas divisorias.

Leyenda de estado en ATTO: ✅ existe, 🟡 existe a medias, ❌ no existe, ⛔ fuera de alcance del chat (requiere infraestructura nueva: llamadas, cifrado, pagos).

## 1. Lo que ATTO tiene hoy

Frontend `src/features/messages` (5.140 líneas, sobre `react-native-gifted-chat` 3.3). Backend `chat-service` (Elixir, Phoenix Channels, Cassandra). Eventos en tiempo real: `new_message`, `typing`, `messages_read`, `message_history`, `reaction_added`, `reaction_removed`, `message_edited`, `message_deleted`, `conversation_updated`, `new_notification`.

| Capacidad | Estado | Nota |
|---|---|---|
| Lista de conversaciones con último mensaje y no leídos | ✅ | `ConversationList` |
| Chat 1 a 1 con texto | ✅ | `content_type` solo `text` en el backend |
| Respuesta a un mensaje (reply) | ✅ | `reply_to_id`, `reply_to_content`, `reply_to_sender` |
| Editar y borrar mensaje | ✅ | con eventos en vivo |
| Reacciones con emoji | ✅ | `ReactionBar`, `ReactionPicker` |
| Indicador de escribiendo | ✅ | tres puntos animados |
| Leído y entregado | 🟡 | `is_read` por conversación, sin marca por mensaje ni hora |
| Menú contextual del mensaje | 🟡 | `MessageContextMenu` en JS, no el nativo de iOS |
| Fondos de pantalla del chat | ✅ | `WallpaperPickerSheet` |
| Audio y video en mensajes | 🟡 | reproductores existen (`AudioMessagePlayer`, `VideoMessagePlayer`) pero el backend solo acepta texto y el compositor no adjunta |
| Búsqueda de usuarios para nuevo chat | ✅ | `NewMessageScreen` |
| Grupos | ❌ | modelo 1 a 1 (`participant_id`) |
| Notas de voz | ❌ | |
| Fotos, videos, archivos, ubicación, contactos | ❌ | |
| Stickers, GIF | ❌ | |
| Notas de voz transcritas | ❌ | |
| Mensajes fijados, favoritos, archivados | ❌ | |
| Estados o historias | ❌ | |
| Llamadas de voz y video dentro del chat | ⛔ | las llamadas de ATTO son otra cosa (bridge) |
| Cifrado de extremo a extremo | ⛔ | |

## 2. Catálogo de funciones de referencia

### 2.1 Lista de conversaciones

| Función | WhatsApp | Telegram | iMessage | ATTO | Fase |
|---|---|---|---|---|---|
| Buscar en conversaciones y mensajes | ✅ | ✅ (con filtros de chats, medios, enlaces) | ✅ | ❌ | 2 |
| Filtros de lista (no leídos, favoritos, grupos) | ✅ pastillas | ✅ carpetas con pestañas deslizables | 🟡 (no leídos, conocidos, desconocidos) | ❌ | 2 |
| Deslizar para archivar, fijar, silenciar, borrar | ✅ | ✅ | ✅ (fijar, ocultar alertas, borrar) | ❌ | 1 |
| Chats fijados arriba | ✅ | ✅ | ✅ (círculos grandes) | ❌ | 2 |
| Archivados | ✅ | ✅ | ❌ | ❌ | 2 |
| Avatar con estado en línea | ❌ | ✅ punto verde | ❌ | ❌ | 2 |
| Vista previa del último mensaje con tipo (📷, 🎤, ✓✓) | ✅ | ✅ | ✅ | 🟡 | 1 |
| Contador de no leídos, silenciado en gris | ✅ | ✅ | ✅ punto azul | ✅ | 1 |
| Borrador guardado y marcado en la lista | ✅ | ✅ (etiqueta Borrador en rojo) | ❌ | ❌ | 1 |
| Selección múltiple con modo edición | ✅ | ✅ | ✅ | ❌ | 2 |
| Pull to search (Telegram) | ❌ | ✅ | ✅ (barra al arrastrar) | ❌ | 2 |
| Título grande que se encoge al hacer scroll | ❌ | ❌ | ✅ nativo | ❌ | 1 |

### 2.2 Pantalla de chat

| Función | WhatsApp | Telegram | iMessage | ATTO | Fase |
|---|---|---|---|---|---|
| Burbujas con cola | ✅ | ✅ | ✅ | 🟡 | 1 |
| Agrupación de burbujas consecutivas del mismo autor (esquinas) | ✅ | ✅ | ✅ | ❌ | 1 |
| Hora dentro de la burbuja | ✅ | ✅ | ❌ (arrastrar para ver) | ✅ | 1 |
| Arrastrar la lista a la izquierda para ver horas (iMessage) | ❌ | ❌ | ✅ | ❌ | 1 |
| Separadores de fecha flotantes que se pegan arriba | ✅ | ✅ | ✅ | 🟡 | 1 |
| Deslizar burbuja para responder | ✅ | ✅ | ✅ | ❌ | 1 |
| Doble toque para reaccionar | ❌ | ✅ (configurable) | ✅ (doble toque abre Tapback) | ❌ | 1 |
| Mantener pulsado: menú contextual nativo con vista previa | ✅ (UIContextMenu) | ✅ (menú propio con desenfoque) | ✅ (UIContextMenu con Tapback) | 🟡 JS | 1 |
| Barra de reacciones sobre el menú | ✅ | ✅ | ✅ (Tapback, cualquier emoji desde iOS 17) | ✅ | 1 |
| Reacciones agrupadas bajo la burbuja con contador | ✅ | ✅ | ✅ | 🟡 | 1 |
| Tocar reacción abre lista de quién reaccionó | ✅ | ✅ | ✅ | ❌ | 2 |
| Respuesta citada con salto al original al tocar | ✅ | ✅ | ✅ | 🟡 | 1 |
| Resaltado del mensaje al saltar | ✅ | ✅ (parpadeo) | ✅ | ❌ | 1 |
| Reenviar a varios chats | ✅ | ✅ | ✅ | ❌ | 2 |
| Copiar, borrar para mí y para todos | ✅ | ✅ | ✅ (deshacer envío 2 min) | 🟡 | 1 |
| Editar con etiqueta Editado e historial | ✅ 15 min | ✅ 48 h | ✅ 15 min, 5 veces, con historial | ✅ | 1 |
| Fijar mensaje en el chat con banda arriba | ✅ | ✅ | ✅ | ❌ | 2 |
| Destacar (estrella) | ✅ | ✅ (guardados) | ❌ | ❌ | 2 |
| Selección múltiple de mensajes | ✅ | ✅ | ✅ | ❌ | 2 |
| Enlaces con vista previa | ✅ | ✅ | ✅ (tarjeta rica) | ❌ | 2 |
| Menciones @ | ✅ grupos | ✅ | ✅ grupos | ❌ | 3 |
| Estado de entrega por mensaje (reloj, ✓, ✓✓, ✓✓ azul) | ✅ | ✅ | ✅ (Entregado, Leído con hora) | 🟡 | 1 |
| Leído con hora | ✅ (info del mensaje) | ✅ | ✅ bajo la última burbuja | ❌ | 1 |
| Indicador de escribiendo | ✅ en cabecera | ✅ en cabecera con animación | ✅ burbuja con puntos | ✅ | 1 |
| Botón flotante para ir al final con contador | ✅ | ✅ | ❌ | ❌ | 1 |
| Cargar historial al llegar arriba sin salto | ✅ | ✅ | ✅ | 🟡 | 1 |
| Efectos de mensaje (globos, confeti, láser, slam, invisible) | ❌ | ✅ (efectos de emoji animado) | ✅ | ❌ | 3 |
| Texto con formato (negrita, cursiva, tachado, mono, spoiler) | ✅ markdown | ✅ editor completo | ✅ (desde iOS 18) | ❌ | 2 |
| Emoji grande cuando el mensaje es solo emoji | ✅ | ✅ (animado) | ✅ | ❌ | 1 |
| Stickers y GIF | ✅ | ✅ | ✅ | ❌ | 3 |
| Fotos y videos con visor a pantalla completa y zoom | ✅ | ✅ | ✅ | ❌ | 2 |
| Álbum de varias fotos en una burbuja | ✅ | ✅ | ✅ | ❌ | 2 |
| Foto de ver una vez | ✅ | ✅ | ❌ | ❌ | 3 |
| Archivos y documentos | ✅ | ✅ | ✅ | ❌ | 3 |
| Ubicación y ubicación en vivo | ✅ | ✅ | ✅ (Find My) | ❌ | 3 |
| Contactos | ✅ | ✅ | ✅ | ❌ | 3 |
| Encuestas | ✅ | ✅ | ✅ (iOS 18) | ❌ | 3 |
| Notas de voz con onda, velocidad y transcripción | ✅ | ✅ | ✅ | ❌ | 2 |
| Mensaje de audio que se reproduce con el teléfono en la oreja | ✅ | ✅ | ✅ | ❌ | 2 |
| Video mensaje circular | ❌ | ✅ | ❌ | ❌ | 3 |
| Cámara desde el compositor | ✅ | ✅ | ✅ | ❌ | 2 |
| Programar envío | ❌ | ✅ | ✅ (iOS 18) | ❌ | 3 |
| Mensajes temporales | ✅ | ✅ | ❌ | ❌ | 3 |
| Traducción | ✅ | ✅ | ✅ (iOS 26) | ❌ | 3 |
| Fondo de chat, con desenfoque y modo oscuro | ✅ | ✅ | ✅ (iOS 26) | ✅ | 1 |
| Cabecera con avatar y nombre que abre el perfil | ✅ | ✅ (avatar que se agranda) | ✅ | ✅ | 1 |
| Info del chat: medios, enlaces, docs compartidos | ✅ | ✅ | ✅ | ❌ | 2 |

### 2.3 Compositor

| Función | WhatsApp | Telegram | iMessage | ATTO | Fase |
|---|---|---|---|---|---|
| Campo que crece hasta N líneas | ✅ | ✅ | ✅ | ✅ | 1 |
| Botón que cambia de micrófono a enviar | ✅ | ✅ | ✅ (audio a flecha) | 🟡 | 1 |
| Teclado que se cierra arrastrando la lista | ✅ | ✅ | ✅ | 🟡 | 1 |
| Vista previa de la respuesta y edición sobre el campo | ✅ | ✅ | ✅ | 🟡 | 1 |
| Adjuntos con hoja nativa (Fotos, Cámara, Documento, Ubicación, Contacto) | ✅ | ✅ | ✅ (menú +) | ❌ | 2 |
| Selector de fotos embebido bajo el teclado | ✅ | ✅ | ✅ | ❌ | 2 |
| Grabar nota de voz manteniendo pulsado, deslizar para cancelar, bloquear | ✅ | ✅ | ✅ | ❌ | 2 |
| Emoji nativo y stickers | ✅ | ✅ | ✅ | 🟡 (teclado del sistema) | 1 |
| Borrador por chat | ✅ | ✅ | ✅ | ❌ | 1 |
| Escribir en formato | ✅ | ✅ | ✅ | ❌ | 2 |

### 2.4 Otras superficies

| Función | WhatsApp | Telegram | iMessage | ATTO | Fase |
|---|---|---|---|---|---|
| Grupos con roles, descripción, admins | ✅ | ✅ | ✅ | ❌ | 3 |
| Canales y comunidades | ✅ | ✅ | ❌ | ❌ | fuera |
| Estados e historias | ✅ | ✅ | ❌ | ❌ | fuera del chat |
| Notificaciones con respuesta rápida y vista de burbuja | ✅ | ✅ | ✅ | 🟡 | 2 |
| Silenciar por tiempo | ✅ | ✅ | ✅ | ❌ | 2 |
| Bloquear y reportar | ✅ | ✅ | ✅ | 🟡 | 2 |
| Confirmaciones de lectura configurables | ✅ | ✅ | ✅ | ❌ | 2 |
| Última vez y en línea | ✅ | ✅ | ❌ | ❌ | 2 |
| Bots, pagos, mini apps | ❌ | ✅ | Apple Cash | ❌ | fuera |

## 3. Catálogo de animaciones (lo que da la sensación de fluidez)

Cada animación se anota con su curva y duración aproximada y con cómo se logra en React Native con Reanimated 4 y componentes nativos.

| # | Animación | Referencia | Cómo | Fase |
|---|---|---|---|---|
| A1 | La burbuja enviada nace en el compositor y viaja a su sitio en la lista (spring, ~350 ms) | iMessage, Telegram | Medir la posición del texto en el compositor, montar la burbuja con `entering` personalizado que interpola desde ese origen (translateY + scale) | 1 |
| A2 | Burbuja recibida entra desde abajo con fade y ligero scale (~250 ms) | Las tres | `entering={FadeInDown.springify()}` con `layout` animado | 1 |
| A3 | Las demás burbujas se desplazan hacia arriba con spring cuando llega una nueva (sin salto) | Las tres | `layout={LinearTransition.springify()}` en las filas, lista invertida | 1 |
| A4 | Deslizar para responder: la burbuja sigue el dedo con resistencia, aparece icono de respuesta con pop y háptico al cruzar el umbral, vuelve con spring | Las tres | `Gesture.Pan` con `activeOffsetX`, `withSpring`, `Haptics.impact` en el umbral | 1 |
| A5 | Mantener pulsado: la burbuja se agranda un poco con háptico, el fondo se desenfoca, aparece el menú nativo con vista previa | iMessage, WhatsApp | `UIContextMenu` nativo (react-native-ios-context-menu) con `previewConfig`, reacciones como vista auxiliar | 1 |
| A6 | Reacción: el emoji salta desde la barra hasta la esquina de la burbuja y rebota (~400 ms) | Las tres | Overlay con `withSequence(withSpring(1.4), withSpring(1))` y trayectoria interpolada | 1 |
| A7 | Doble toque para reaccionar con corazón que late | iMessage | `Gesture.Tap().numberOfTaps(2)` | 1 |
| A8 | Puntos de escribiendo con rebote escalonado y burbuja que aparece y desaparece con scale | iMessage | Ya existe el punto; falta la burbuja con `entering/exiting` | 1 |
| A9 | Entregado y Leído que se desvanecen y aparecen bajo la última burbuja; check que pasa de uno a dos con fade | iMessage, WhatsApp | `Animated.Text` con `FadeIn` y `LayoutAnimation` para el texto de estado | 1 |
| A10 | Separador de fecha que se pega arriba, aparece al hacer scroll y se esconde solo (~1 s después) | WhatsApp, Telegram | Fecha flotante fuera de la lista, alimentada por `onViewableItemsChanged`, con `withDelay` para ocultarse | 1 |
| A11 | Botón "ir al final" que aparece con scale cuando te alejas 2 pantallas, con contador de nuevos | WhatsApp, Telegram | `FadeIn`/`ZoomIn` con estado derivado del scroll | 1 |
| A12 | Teclado interactivo: la lista y el compositor siguen el dedo al cerrarlo; sin salto al abrirlo | Las tres | `keyboardDismissMode="interactive"` y `react-native-keyboard-controller` (`KeyboardStickyView`, `useReanimatedKeyboardAnimation`) | 1 |
| A13 | El botón de enviar aparece con rotación y scale al escribir el primer carácter, y vuelve a micrófono al borrar | WhatsApp, iMessage | `withSpring` en scale y rotate sobre dos iconos superpuestos | 1 |
| A14 | El campo crece por línea con spring, no de golpe | Las tres | `onContentSizeChange` con `withSpring` en la altura | 1 |
| A15 | Arrastrar la lista a la izquierda revela las horas a la derecha de cada burbuja, con resistencia | iMessage | `Gesture.Pan` global sobre la lista con translateX en burbujas y horas en capa separada | 1 |
| A16 | Burbujas contiguas cambian de esquinas con animación cuando llega la siguiente | iMessage, Telegram | Radios animados con `useAnimatedStyle` según posición en el grupo | 1 |
| A17 | Pull to refresh y carga de historial arriba sin que la lista salte | Las tres | `maintainVisibleContentPosition` en `FlatList` | 1 |
| A18 | Deslizar una conversación en la lista: acciones nativas con háptico y "swipe completo" | Las tres | `SwipeableRow` de Reanimated, o `UIContextualAction` vía lista nativa | 1 |
| A19 | Título grande que se encoge al hacer scroll en la lista (large title) | iMessage | `headerLargeTitle` de la pila nativa (`react-native-screens`) | 1 |
| A20 | Transición a la pantalla de chat con el avatar que se mueve a la cabecera | Telegram | Shared element (`react-native-screens` `sharedTransitionTag` de Reanimated) | 2 |
| A21 | Grabación de voz: el micrófono crece bajo el dedo, aparece "desliza para cancelar" con flecha que oscila, candado que sube para bloquear, onda de audio en vivo | WhatsApp, Telegram | Gesto compuesto con `withRepeat` para la flecha, `withSpring` para el candado, niveles desde `expo-audio` | 2 |
| A22 | Nota de voz reproduciéndose: onda que se rellena y punto que avanza | WhatsApp | Barras con `scaleY` en driver nativo (como el feed) | 2 |
| A23 | Emoji solo: burbuja transparente, emoji grande con pop y, si es animado, se anima una vez | Las tres | Detección de texto solo emoji; `ZoomIn` | 1 |
| A24 | Resaltado del mensaje al saltar a él: el fondo pulsa dos veces | Telegram, WhatsApp | `withSequence` de opacidad en una capa detrás de la burbuja | 1 |
| A25 | Borrado: la burbuja se contrae y las demás cierran el hueco | Las tres | `exiting={FadeOut}` con `layout` en vecinos | 1 |
| A26 | Efectos de pantalla completa (globos, confeti) | iMessage | Lottie o partículas con Skia | 3 |
| A27 | Selector de reacción que abre con las opciones en cascada (stagger) | iMessage, WhatsApp | `entering` con `delay(i * 30)` | 1 |
| A28 | Vista previa de foto desde la burbuja a pantalla completa con zoom y arrastrar para cerrar | Las tres | `react-native-zoom-reanimated` (ya está) + transición modal con `presentation: transparentModal` | 2 |


## 3b. Observado en vivo en el iPhone de David (21 de septiembre de 2026, iOS 26)

Grabado a 24 cuadros por segundo con el stream del driver. Tiempos aproximados.

### Telegram, chat "Mensajes guardados"
- **Entrar al chat:** el teclado de búsqueda se recoge hacia abajo y la pantalla del chat entra con push nativo desde la derecha mientras la lista anterior se desplaza un 30 % a la izquierda y se oscurece. Nada que inventar: es `UINavigationController`, lo da la pila nativa.
- **Compositor vacío:** clip de adjuntos a la izquierda, campo con icono de sticker y reloj (programar), micrófono a la derecha. **Al escribir la primera letra** (unos 130 ms): el micrófono se convierte en el botón azul de enviar con un cambio de escala y fundido; el reloj desaparece; el resto no se mueve.
- **Enviar** (unos 250 ms): el texto del campo se queda quieto, el campo se vacía con un fundido a "Message", la burbuja nueva aparece justo sobre el compositor y sube con resorte hasta su sitio; el botón de enviar vuelve a micrófono; la burbuja anterior aplana su esquina inferior derecha para formar grupo con la nueva.
- **El campo crece** una línea por vez con resorte, nunca de golpe.
- **Deslizar para responder:** es hacia la **izquierda**. La burbuja se mueve con el dedo y con resistencia, a la derecha aparece la flecha de respuesta creciendo; al soltar, la burbuja vuelve con resorte y sube el panel "Reply to…" sobre el campo junto con el teclado.
- **Panel de stickers:** reemplaza al teclado con un deslizamiento hacia arriba y fundido cruzado.
- **Color de burbuja:** un degradado que cambia de tono según la posición de la burbuja en pantalla mientras haces scroll.
- **Píldora de fecha "Today"** sobre las burbujas, con fondo translúcido.

### iMessage, chat contigo mismo
- **Cabecera:** avatar grande con el nombre debajo; al tirar de la lista hacia abajo, la cabecera se estira (rubber band) y al hacer scroll se encoge.
- **Compositor:** botón "+" a la izquierda, cápsula con línea de asunto y campo, micrófono dentro del campo. Al escribir, el micrófono se convierte en flecha azul.
- **Enviar:** la burbuja azul nace sobre el compositor y sube a su sitio con resorte; después aparece "Read 12:17 AM" bajo la última burbuja con fundido.
- **Recoger el teclado:** interactivo: el teclado y el compositor siguen el dedo mientras la lista se desplaza.
- **Mantener pulsado una burbuja:** háptico, la burbuja se eleva y el resto se desenfoca; aparece la barra Tapback (❤️ 👍 👎 😂 ‼️ ❓ y un botón de emoji) sobre la burbuja y el menú nativo debajo (Reply, Attach Sticker, Edit, Undo Send, Copy, Translate, Select, Speak, More). La barra entra con resorte y ligero escalonado.
- **Doble toque:** aparece solo la barra Tapback sobre la burbuja, con resorte (sin menú).
- **Arrastrar la lista a la izquierda:** las horas aparecen a la derecha de cada burbuja deslizándose desde el borde, con resistencia, y vuelven al soltar.
- **Mantener pulsado enviar:** el botón se apaga, el compositor se desenfoca, y toda la pantalla pasa a "Send with effect" sobre fondo oscuro desenfocado: segmento Burbuja / Pantalla, lista Slam, Loud, Gentle, Invisible Ink con un selector vertical deslizable, la burbuja en vista previa abajo y una X para cancelar.

### WhatsApp
Quedó bloqueado con Face ID al reabrirlo; pendiente de grabar cuando David lo desbloquee. De la lista de chats (capturada antes del bloqueo): título grande "Chats", barra "Ask Meta AI or Search", pastillas de filtro (All, Unread, Favorites, Groups), filas con avatar, nombre, hora a la derecha, vista previa con ✓✓ y pin, contador verde, barra de pestañas de cristal (Updates, Calls, Communities, Chats, You).

## 7. Fondos de pantalla (pedido de David)

Los tres tienen catálogos de fondos: WhatsApp (patrones de doodles con color de fondo elegible y modo oscuro), Telegram (patrones vectoriales sobre degradados de 4 puntos que se animan al enviar un mensaje, y fondos por chat), iMessage en iOS 26 (fondos por conversación con desenfoque y color). Para ATTO: ampliar `WallpaperPickerSheet` con
1. una familia de patrones tipo doodle en blanco sobre negro, con opacidad ajustable,
2. degradados de 4 puntos que rotan con resorte al enviar (como Telegram),
3. desenfoque y velo configurables desde el admin (ya existe `overlayOpacity`),
4. fondo por conversación además del global.

### Decisión de David (21 de septiembre): responder y marcar mensajes se copian de iMessage
- **Responder:** al elegir Responder, el mensaje original se desplaza arriba, el resto del hilo se atenúa, y sobre el compositor queda el original con una línea curva que lo conecta con el campo. El mensaje enviado como respuesta muestra el original citado en pequeño encima, unido por la misma línea, y tocarlo abre la vista del hilo de esa respuesta.
- **Marcar:** Tapback: mantener pulsado o doble toque abre la barra de reacciones sobre la burbuja (corazón, pulgar arriba, pulgar abajo, ja ja, !!, ?, y emoji libre), la reacción elegida queda pegada a la esquina superior de la burbuja con un pequeño globo, y el resto de la pantalla se desenfoca mientras la barra está abierta.
- Estado en ATTO al cierre de esta sesión: deslizar responde (con el original dentro de la cápsula, estilo Telegram); falta el modo respuesta de iMessage (fase 1b). Tapback: el menú nativo abre con toque largo; la barra de reacciones sobre la burbuja es el `ReactionPicker` existente, falta anclarla a la burbuja con el desenfoque de fondo (fase 1b).

## 4. Componentes nativos de iOS que usaremos

| Necesidad | Componente nativo | Paquete |
|---|---|---|
| Menú contextual con vista previa y háptico | UIContextMenuInteraction | react-native-ios-context-menu (ya usado en el feed) |
| Acciones al deslizar en la lista | UISwipeActionsConfiguration | vía Reanimated Swipeable (equivalente visual) |
| Título grande | UINavigationBar large title | react-native-screens `headerLargeTitle` |
| Barra de búsqueda | UISearchController | react-native-screens `headerSearchBarOptions` |
| Teclado interactivo | UIScrollViewKeyboardDismissMode.interactive | RN + react-native-keyboard-controller |
| Hoja de adjuntos | UISheetPresentationController | BottomSheet de ATTO (TrueSheet) |
| Selector de fotos | PHPickerViewController | expo-image-picker (limitado) |
| Cámara | UIImagePickerController / AVFoundation | expo-camera |
| Documentos | UIDocumentPickerViewController | expo-document-picker |
| Emoji y stickers | teclado del sistema, y Memoji vía UIKit | nativo |
| Háptica | UIImpactFeedbackGenerator, UISelectionFeedbackGenerator | expo-haptics (ya usado) |
| Vista previa de enlaces | LPLinkView | módulo local pequeño o react-native-link-preview |
| Reproductor de video en burbuja | AVPlayerViewController | expo-video |
| Transcripción de voz | SFSpeechRecognizer | módulo local (ya tenemos speech en atto-audio-transcode) |
| Compartir hacia fuera | UIActivityViewController | RN Share |
| Alertas y confirmaciones | UIAlertController | RN Alert (ya) |
| Menús de opciones | UIMenu | react-native-ios-context-menu como menú de botón |
| Blur | UIVisualEffectView | expo-blur (ya) |

## 5. Backend: qué debe crecer

1. Tipos de contenido: `image`, `video`, `audio`, `file`, `location`, `contact`, `sticker`. Hoy solo `text`. Los adjuntos van a Cloudinary (imágenes, video) y a minio (audio), con `metadata` (ancho, alto, duración, onda, nombre).
2. Estado por mensaje: `delivered_at` y `read_at` por mensaje (hoy es por conversación), y evento `message_delivered`.
3. Presencia: `online`, `last_seen_at` (Phoenix Presence, ya viene con Phoenix).
4. Borradores: locales (MMKV), no backend.
5. Fijados, favoritos, archivados y silenciados: columnas en `conversations` y en `messages`.
6. Reenviar: `forwarded_from`.
7. Grupos: modelo de participantes (fase 3).
8. Búsqueda: índice en Cassandra no sirve; usar el índice de contenido existente o Meilisearch (fase 2).

Antes de tocar el backend hay que arreglar su build (`COPY mix.exs mix.lock ./` en el Dockerfile) y desplegar en una ventana con prueba.

## 6. Fases propuestas

Fase 1, fluidez y base (todo lo marcado 1). Solo frontend, sin cambios de backend salvo `read_at` por mensaje. Reemplaza GiftedChat por una lista propia (`FlatList` invertida con `maintainVisibleContentPosition`) para controlar cada animación. Entregable: el chat se siente como iMessage al escribir, enviar, recibir, responder, reaccionar y navegar.

Fase 2, contenido y organización (marcado 2): fotos, video, notas de voz con transcripción, adjuntos nativos, vista previa de enlaces, búsqueda, filtros, fijados, archivados, silenciar, presencia, reenviar, info del chat, notificaciones con respuesta rápida.

Fase 3, extras (marcado 3): grupos, stickers y GIF, efectos, formato, encuestas, programar, temporales, ubicación, contactos, archivos, ver una vez, traducción.

Fuera: llamadas dentro del chat, cifrado de extremo a extremo, canales, comunidades, pagos y bots.

## 8. Slack (pedido de David: todas sus funciones)

Slack es mensajería de trabajo: la mayoría de sus funciones son de organización, no de fluidez. Lo que aporta al chat de ATTO, ordenado por lo que tiene sentido en una app de artistas, y con fase.

| Función | Slack | Para ATTO | Fase |
|---|---|---|---|
| **Hilos por mensaje** (responder en hilo, contador "3 replies", avatares de quienes respondieron, "Threads" como vista propia con lo pendiente) | ✅ | Sí. Es la función que más cambia el modelo: cada mensaje puede ser raíz de un hilo. Backend: `thread_root_id`, contador y última respuesta en el mensaje raíz, vista "Hilos" con los que sigues | 2 |
| Reacciones con emoji, agrupadas con contador, y "reacciones rápidas" configurables | ✅ | Ya casi lo tenemos; añadir las 3 rápidas al menú | 1 |
| Menciones @usuario y @canal con autocompletado, y vista "Menciones" | ✅ | Sí en grupos; en 1 a 1 no aplica | 3 |
| Fijar y guardar mensajes ("Save for later" con recordatorio) | ✅ | Sí: fijados por chat y guardados personales | 2 |
| Recordatorios sobre un mensaje ("Remind me in 1 hour") | ✅ | Sí, con notificación local | 2 |
| Editar y eliminar con historial | ✅ | Ya | 1 |
| Formato de texto (negrita, cursiva, tachado, código, bloque de código, listas, citas, enlaces) | ✅ editor WYSIWYG | Sí, markdown ligero al escribir y al mostrar | 2 |
| Adjuntos: fotos, archivos, audio, video, grabar clip de audio o video desde el compositor | ✅ | Igual que la fase 2 de las otras apps | 2 |
| Notas de voz y video con transcripción | ✅ | Fase 2 | 2 |
| Enlaces con vista previa (unfurl) | ✅ | Fase 2 | 2 |
| Canales públicos y privados, DMs de grupo | ✅ | Grupos sí; canales públicos no aplican al modelo de ATTO | 3 |
| Huddles (llamada de voz ligera dentro del chat, con pantalla compartida) | ✅ | ⛔ ATTO tiene llamadas propias por bridge | fuera |
| Estado ("🍕 Almorzando", no molestar por horas, en línea) | ✅ | Sí: estado corto en el perfil y presencia | 2 |
| Búsqueda global con filtros (de:, en:, antes:, tiene:) | ✅ | Fase 2 con filtros básicos | 2 |
| Marcar como no leído, y "Unreads" como vista | ✅ | Sí | 2 |
| Programar envío | ✅ | Igual que iMessage 18 | 3 |
| Reenviar y compartir mensaje a otro chat | ✅ | Fase 2 | 2 |
| Copiar enlace a un mensaje y saltar a él | ✅ | Sí, con resaltado al saltar (ya en fase 1) | 2 |
| Deslizar mensaje para responder en hilo | ✅ | Ya, deslizar responde | 1 |
| Mantener pulsado: menú con reacciones rápidas arriba y acciones abajo | ✅ | Ya (nativo) | 1 |
| Indicador "está escribiendo" en el hilo y en el canal | ✅ | Ya | 1 |
| Notificaciones por palabra clave, silenciar por canal y por tiempo | ✅ | Silenciar sí; palabras clave no | 2 |
| Encuestas y flujos (Workflow Builder), bots, integraciones, lista de tareas, canvas | ✅ | ⛔ | fuera |
| Perfil rápido al tocar el avatar (tarjeta con estado y botón de mensaje) | ✅ | Sí | 1 |
| Día separador flotante, botón "nuevos mensajes" y línea "Nuevo" sobre los no leídos | ✅ | Píldora y botón ya; la línea "New" sobre el primer no leído se agrega | 1 |
| Modo oscuro, temas | ✅ | ATTO ya es negro | 1 |

Barrido en vivo de Slack (21 de septiembre, iPhone de David): la lista de inicio es una pila de secciones plegables (Sin leer, Canales, Mensajes directos) con accesos arriba (Lectura rápida, Hilos, Juntas, Más tarde). En el canal, una píldora "1 sin leer" flota bajo la cabecera con flecha para saltar al primer no leído. Mantener pulsado un mensaje abre una hoja nativa a media altura: fila de reacciones rápidas (cinco emoji y +), tres acciones grandes (Responder, Adelante, Guardar), lista (Leer en voz alta, Marcar como no leído, Recordarme, Recibir notificaciones de respuesta, Copiar enlace, Copiar mensaje, Más acciones, Eliminar). El hilo es una pantalla propia con el mensaje raíz arriba, "Responder en hilo", "Guardar", "Reenviar", y en el compositor un interruptor "También enviar a <canal>" y botón de formato. El compositor del canal: "+" de adjuntos a la izquierda y "Grabar clip de audio" a la derecha. Las tres cosas propias de Slack que valen la pena copiar tal cual: la fila de respuestas bajo el mensaje raíz ("2 replies · Last reply 3 min ago" con avatares), la vista Hilos como bandeja, y "Save for later" con recordatorio.

## 9. Geometría medida (21 de septiembre de 2026, sesión de investigación)

Medido sobre capturas reales a 3x en el iPhone de pruebas y sobre el código fuente público, no de memoria.

### 9.1 Colita de iMessage (iOS 26, burbuja enviada "Hola")
Filas de píxeles de `ref-im2.png` (1290 x 2796): borde derecho máximo en x 1228, base de la burbuja en y 1787, punta de la colita en (1201, 1809).
- La burbuja conserva su esquina redonda completa (radio 18 a 20 pt). La colita NO sale por fuera del borde derecho: cuelga DEBAJO de la esquina.
- Cae 7,5 pt por debajo de la base. La punta queda 9 pt hacia dentro del borde derecho.
- Borde exterior: arranca en el arco de la esquina a 1,3 pt sobre la base y 11,3 pt hacia dentro, baja casi vertical con una leve curva hacia fuera hasta la punta.
- Borde interior: diagonal ligeramente cóncava desde la punta hasta la base, a 21 pt hacia dentro del borde. Pasa por (17 pt hacia dentro, 3,3 pt bajo la base).
- Hay una esquina visible donde el arco se encuentra con la colita (a las 5 en punto); no es un error, iMessage la tiene.
- El CSS "canónico" que circula por internet (`:before` 20 x 25 con `border-bottom-left-radius: 16px 14px` a `right: -7px`, `:after` 26 x 25 con radio 10 a `right: -26px`) es la forma antigua: pone la punta 7 pt fuera del borde. No coincide con iOS 26.
- Implementación en `MessageRow.tsx` (`Tail`): svg de 24 x 30 solapado 24 pt sobre el borde y 8 pt por debajo de la base, trazo `M(E-19,B-0.5) L(E-18,B) A18 18 (E-11.3,B-1.3) Q(E-9.5,B+4) (E-9,B+7.5) Q(E-19,B+3.25) (E-21,B) Z`, espejado para el lado ajeno. En burbujas con degradado dorado el svg repite el degradado en coordenadas de la burbuja (`gradientUnits="userSpaceOnUse"`) para que no se vea un parche.

### 9.2 Colita de Telegram (código fuente `ChatMessageBubbleImages.swift`)
- Imagen base de 33 pt de diámetro. Colita = mitad inferior de una elipse de 27 x 17 en (24, 16) menos un recorte elíptico de 23 x 21 en (33, 14).
- Resultado: la colita vive en la última fila de la burbuja, mide unos 8,5 pt de alto, la punta queda SOBRE la base 4,7 pt más allá del borde, borde superior cóncavo (recorte) y borde inferior convexo (elipse).
- Solo la última burbuja de la racha lleva colita (`drawTail` según `neighbors`); las esquinas interiores de la racha usan `minCornerRadius`.
- Con radio menor de 14 pt (`minRadiusForFullTailCorner`) la esquina se cuadra en vez de curvarse.

### 9.3 Reacciones
- WhatsApp: pastilla oscura con borde del color del fondo, colgando del borde inferior de la burbuja, en la esquina del lado exterior, solapando 4 a 6 pt. Su colita está en la esquina SUPERIOR, por eso no chocan.
- Telegram: pastillas dentro de la burbuja, debajo del texto, alineadas al lado interior.
- iMessage: Tapback en la esquina SUPERIOR del lado interior, solapando el borde.
- Decisión ATTO (David, 21 sep): abajo como WhatsApp, pero como nuestra colita es la de iMessage (esquina inferior exterior), la pastilla cuelga del lado INTERIOR (precedente Telegram) con 6 pt de solape, nunca sobre la hora ni los ticks. Pastilla oscura siempre; la propia se marca con anillo blanco (una pastilla blanca desaparece sobre burbujas blancas). El "Read" va debajo de la colita (margen 10 pt).

### 9.4 Liquid Glass (HIG de Apple, iOS 26)
- El vidrio va en la capa de navegación y controles (barras, botones flotantes, hojas, menús). Nunca en la capa de contenido: listas, tarjetas, burbujas.
- No apilar vidrio sobre vidrio. Tintar solo acciones principales. Contraste mínimo 4,5:1; sobre fondos cargados añadir degradado o velo.
- Variante `regular` por defecto; `clear` solo sobre medios ricos con contenido encima brillante.
- En ATTO: cabecera del chat (atrás, cápsula del nombre con avatar, llamada) en vidrio; burbujas y lista sin vidrio.

### 9.5 Composer multilínea de Telegram (capturas de David, 21 sep 01:43)
- Con una sola línea: botón de IA y clip a la izquierda en fila, campo en cápsula, emoji y enviar a la derecha.
- Con dos o más líneas: los botones de la izquierda se apilan en una cápsula VERTICAL (IA arriba, clip abajo) pegada al borde izquierdo, el campo crece hacia arriba y aparece un icono de expandir (cuatro esquinas) arriba a la derecha del campo.
- Tocar expandir abre un editor a pantalla completa: botón cerrar arriba a la izquierda, deshacer y rehacer en una cápsula arriba a la derecha, el texto ocupa toda la pantalla, y una barra inferior con IA, más, lista, tabla, clip, emoji y el botón de enviar azul.
- Pendiente: estudiarlo en vivo (transición de una a dos líneas, animación de la cápsula vertical, apertura del editor) cuando el teléfono vuelva a estar libre. Entra en la fase 1 del composer.

## 10. Estado al cierre de la sesión del 21 de septiembre (madrugada)

Hecho en código (commits `0b20366`, `8d9ec98`, `bc8244e` y siguientes en front; `f2785e8` en backend; `186352c` en atto-web desplegado):
- Hilo nativo con agrupación, colita medida de iMessage (con degradado continuo en burbujas doradas), deslizar para responder, arrastre para ver horas, Tapback, menú nativo, leído con hora, línea de "Mensajes nuevos".
- Reacciones colgando del lado interior, sin tapar hora ni ticks; "Read" debajo.
- Cabecera con avatar dentro de la cápsula de vidrio; pulsación larga con menú nativo (perfil, fondo del chat).
- Fondos: tres clases (imagen, degradado, patrón), giro del degradado al enviar, fondo por conversación, página de administración y catálogo sembrado (Studio, Hearts, Signal, Night, Ember, Graphite).
- Lista: deslizar para fijar, silenciar y archivar; fijados primero; borradores por conversación con etiqueta en la lista.

Pendiente de verificar en el iPhone (el teléfono estuvo ocupado por otra sesión): colita nueva en mensajes propios y recibidos, reacción interior, giro del fondo al enviar, menú de la cabecera, acciones de deslizar en la lista, borrador en la lista, línea de mensajes nuevos.

Pendiente de construir: composer multilínea de Telegram (cápsula vertical de botones, expandir a editor completo), medios y notas de voz, hilos de Slack, búsqueda, presencia, `read_at` por mensaje en el backend, Dockerfile de chat-service (`COPY mix.exs mix.lock ./`).

### 9.6 Medidas de burbujas (capturas a 3x, 21 sep)
| | iMessage (enviado "Hola") | Telegram ("Hola prueba" / "Otra") | ATTO (dorado, una línea) |
|---|---|---|---|
| Alto de burbuja | 41 pt (más 8 pt de colita por debajo) | 31 pt / 36 pt | 57 pt (la hora va en su propia fila dentro de la burbuja) |
| Relleno lateral | 15,7 pt | 11,7 pt | 12 pt |
| Altura de mayúscula del texto | 13,7 pt (fuente de unos 17 pt) | | |
| Separación entre burbujas agrupadas | | 2,3 pt | 2 pt |
| Colita | cuelga 8 pt bajo la base, punta 9 pt hacia dentro | 10 pt de alto, sale 4,7 pt del borde, punta sobre la base | igual que iMessage |

Conclusión: la burbuja de ATTO es más alta que las dos porque pone la hora en una segunda fila; WhatsApp y Telegram la meten en la misma línea del texto cuando cabe (la hora flota a la derecha del último renglón). Es la siguiente mejora de densidad: hora en línea con el texto cuando el último renglón deja sitio.

### 9.7 Composer de Telegram: de vacío a primer carácter (medido a 13 fps, 21 sep 02:24)
- Vacío: cápsula de vidrio con el campo y un icono de temporizador a la derecha; fuera de la cápsula, un botón circular de vidrio con el micrófono; a la izquierda, clip de vidrio.
- Primer carácter (unos 220 ms, ease out): el botón azul de enviar nace como un punto dentro del extremo derecho de la cápsula y escala hasta 1 (0,9 a los 190 ms); la cápsula se estira hacia la derecha para envolverlo; el micrófono se desliza a la derecha y se desvanece a la vez; el temporizador se funde con el icono de emoji.
- Último carácter borrado: lo inverso en unos 175 ms.
- ATTO (`ChatComposer.tsx`): mismos tiempos, misma disposición (más de vidrio, cápsula de vidrio con emoji y enviar dentro, micrófono de vidrio fuera), barra y cabecera sin fondo propio para que el fondo de pantalla sea continuo.
- Deslizar para responder ahora con las constantes de Telegram (`ChatSwipeToReplyRecognizer.swift`, aportadas por la sesión futem-app-71): umbral 45 pt ajeno y 60 pt propio, goma `umbral + (1 − 1/(exceso·0,4/100 + 1))·100`, háptico heavy una sola vez, decisión al soltar.

### 9.8 Botones del composer por app (lo que ATTO ya muestra)
| Botón | WhatsApp | Telegram | iMessage | Slack | ATTO |
|---|---|---|---|---|---|
| Adjuntar (+ o clip) | ✅ | ✅ | ✅ (+) | ✅ | ✅ hoja nativa con foto, cámara, archivo, ubicación, contacto, audio de proyecto (en desarrollo, con telemetría) |
| Cámara directa | ✅ | ❌ | ✅ dentro de + | ❌ | dentro de + |
| Emoji o stickers | ✅ | ✅ | ✅ | ✅ | ✅ tira rápida de 12 emojis |
| Nota de voz | ✅ | ✅ | ✅ | ✅ | ✅ botón de vidrio (en desarrollo) |
| Enviar | ✅ | ✅ | ✅ | ✅ | ✅ nace dentro de la cápsula |
| Expandir editor | ❌ | ✅ | ❌ | ❌ | ✅ |
| Deshacer y rehacer | ❌ | ✅ (editor) | ❌ | ❌ | ✅ (editor) |
| Mención @ | ❌ | ✅ tecleando @ | ❌ | ✅ | ✅ (editor) |
| Lista | ❌ | ❌ | ❌ | ✅ | ✅ (editor) |
| Formato (negrita, cursiva, código) | ✅ tecleando | ✅ menú | ❌ | ✅ barra | pendiente |
