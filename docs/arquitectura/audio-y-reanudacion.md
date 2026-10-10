# Audio de llamadas y vuelta a la app: diseño de raíz (10 oct 2026)

Origen: dos reportes del cliente (New Post muerto el 9 oct, llamada con Larry en
silencio el 10 oct). Los dos pasan por el mismo lugar: el rearmado de toda la app
al volver tras más de 2 min, y una sesión de audio que cualquier parte de la app
puede reescribir. Este documento es el contrato; cada pieza se prueba contra él.

## Hechos medidos

* 64 de 172 llamadas conectadas en 30 días pasaron por la sesión de video
  (Playback / MoviePlayback). Casi todas se recuperaron por el reclaim de JS; la
  de Larry no: los callbacks del motor quedaron congelados en 17 durante 36 s.
* El motor de voz es `AttoAudioEngineDevice` (VoiceProcessingIO + dos
  AVAudioEngine en render manual), en el parche de Twilio. Ninguna ruta lo
  reinicia si cambia la categoría con el formato fijo en 48 kHz
  (`handleValidRouteChange` solo actúa si cambia el formato). La recuperación tras
  `mediaServicesWereReset` arranca un unit nulo y nunca reconfigura la sesión.
* Más de 30 escritores de la sesión: 21 llamadas de JS en 9 archivos, expo-audio
  (setAudioMode, grabadora, fin de interrupción, reset), expo-video, atto-recorder,
  el propio motor (llama `setActive:YES` por su cuenta), RNDeviceInfo (override de
  altavoz). Cuatro rutas latentes más pueden quitar el micrófono a una llamada:
  nota de voz durante la llamada, `SimpleRecordingScreen.tsx:406`, atto-recorder
  armado (`activateSession(allowDuringCall: true)`), observadores de expo-audio.
* El rearmado: unas 80 vueltas por semana; el 43 % saca al usuario de lo que
  estaba haciendo (chat, editor, borrador). La pantalla negra que lo motivó (junio,
  build 56) nunca se midió como drawable purgado y no hay rastro de ella desde el
  build 59. El feed y el gate de versión solo se refrescan hoy porque el rearmado
  los vuelve a montar.

## Reglas (fuentes: Apple DTS foro 758386, WWDC16 230, Signal AudioSession,
## Telegram ManagedAudioSession, WebRTC RTCAudioSession y audio_device_ios)

1. Durante una llamada de CallKit la sesión es de la llamada. Nadie más cambia
   categoría, modo ni activación. Los reproductores se mezclan en la sesión tal
   como está; las grabaciones que no son de la llamada se rechazan.
2. Un solo dueño decide (árbitro). Prioridad: llamada > grabación > reproducción.
   Una petición de menor prioridad no escribe; se registra.
3. El motor de voz se vigila a sí mismo y se cura: si los callbacks dejan de
   avanzar, la categoría deja de ser PlayAndRecord o el unit deja de correr con una
   llamada conectada, reafirma la sesión y reconstruye el unit, con límite y espera.
4. Volver a la app nunca destruye la navegación. Se refresca lo que está viejo
   (feed, versión mínima, socket) y, solo si se mide una pantalla negra, se
   repintan las vistas; el rearmado queda como último recurso medido.
5. Todo lo anterior emite telemetría propia y tiene alarma.

## Piezas

### 2. Motor que se cura solo (parche de Twilio, `AttoAudioEngineDevice.m`)
* Vigilante en cola propia cada 250 ms, armado al capturar, desarmado al parar y
  en `setEnabled:NO`. Elegible solo con contexto, activación de CallKit (bandera
  puesta por los dos proveedores), sin interrupción, llamada conectada, no en
  espera, y 1 s después de activar.
* Detecta: contador de captura sin moverse 1000 ms; categoría distinta de
  PlayAndRecord o entrada `none`; `IsRunning == 0`. El caso CategoryChange del
  observador de ruta lo evalúa al instante.
* Escalera: L0 reafirmar sesión (solo si está mal, conservando opciones), L1
  reconstruir el unit, L2 `TVOAudioDeviceReinitialize`. 3 intentos por contexto,
  espera 1, 2, 4 s, reinicio del contador tras 10 s sanos. Interruptor remoto.
* `mediaServicesWereReset` con llamada viva: reconfigurar sesión y reconstruir.
* Telemetría: `call_audio_stall_detected`, `call_audio_heal_attempt`,
  `call_audio_heal_result`, `call_audio_heal_exhausted`, anillo persistido.
* Fallos inyectables (solo cuentas de prueba) para probarlo en el teléfono.

### 1. Dueño único de la sesión (módulo local `atto-audio-session`)
* Clase nativa visible por `NSClassFromString`, sin dependencias entre pods.
  Estado de llamada alimentado por los dos proveedores de CallKit y por
  CXCallObserver. Política pura en Swift, probada con un arnés propio.
* Se conectan: expo-video, expo-audio (setAudioMode, grabadora, fin de
  interrupción, reset), atto-recorder, y la reafirmación del motor.
* JS: nota de voz bloqueada durante una llamada; `SimpleRecordingScreen` no
  escribe Playback con la llamada viva.

### 3. Volver sin rearmar
* `getWindowHealth()` nativo (fracción de píxeles claros de la ventana real).
* Escalones: repintar capas, recrear solo las vistas de video, y como último
  recurso el rearmado actual (nunca con llamada ni modal), con evento.
* Al volver tras más de 2 min: invalidar feed y versión mínima, comprobar socket.

## Lo que no puede romperse (cada build se prueba contra esta lista)

Feed y posts de audio con el interruptor en silencio y mezclando con Spotify;
notas de voz; timeline; grabadora de estudio (monitoreo, 48 kHz, Bluetooth);
en llamada: transmitir (📡), mezcla, DTMF, campana de colgar; auricular por
defecto, altavoz, selector de ruta, AirPods sin eco ni cambio de tasa; contestar
desde bloqueo y en frío (dos proveedores); tono de llamada; nota de video con
sonido; tras cada llamada vuelve el altavoz, se apaga el indicador de micrófono y
vuelve el modo silencio. Más los casos de `docs/pruebas/release/CASOS_CRITICOS.txt`.
