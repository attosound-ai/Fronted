# SoundLab: inventario y mapa hacia el editor de ATTO

Fecha: 19 de septiembre de 2026. App de referencia: SoundLab (com.castpeer.audioroom.ios), versión Pro, explorada en el iPhone de David con WebDriverAgent. Capturas en `docs/investigacion/soundlab/`.

Regla de producto (David): el flujo de ATTO se mantiene (crear proyecto y entrar al editor). El editor de ATTO adopta el layout, las funcionalidades, los gestos y las animaciones del editor de SoundLab, con los colores y las formas de botón de ATTO. Se conserva el botón de grabar la llamada. Las herramientas que SoundLab tiene fuera del editor se embeben dentro del nuestro. Los tips del tutorial se replican: se muestran una sola vez y hay un botón para volver a verlos.

## 1. El editor (pantalla principal)

Layout vertical, de arriba abajo (coordenadas en puntos sobre 430 x 932):

1. **Barra superior** (y 59): cerrar y guardar (izquierda), agregar pista y quitar pista (centro), configuración y compartir (derecha, compartir en verde).
2. **Barra de acciones sobre clips** (y 109): Insert o Replace (cambia según haya selección), Split New, Split, Join, Duplicate. Se atenúan cuando no aplican.
3. **Regla de tiempo** (y 148, 30 pt) con botón para plegar el panel avanzado de pista a la izquierda (x 55).
4. **Área de pistas** (y 178 a 782). Cada pista mide 150 pt de alto y tiene a la izquierda un panel de 110 pt con: nombre de la pista (botón, abre menú), slider de ganancia con etiqueta "Gain: 0dB", slider de pan con etiqueta "Pan: Center", fila Mute, ícono de herramientas (menú de pista) y Solo. A la derecha la forma de onda, centrada en la línea media, cian sobre fondo casi negro. Línea de reproducción roja vertical.
5. **Fila de zoom** (y 741): botón de automatización de volumen (centro), zoom out y zoom in (derecha).
6. **Barra de edición de selección** (y 789): Copy, Cut, Paste, Effect (resaltado), Remove, Silence, Trim.
7. **Transporte** (y 839): Play grande redondo, vúmetros L y R, Undo, Redo, grabadora en línea, Loop, Master Effects.
8. **Lectura de estado** (y 892): "Start 00:00:03.0", "End 00:00:08.3", "Play Head 00:00:03.0". Sin selección dice "No Selection".

### Menú de pista (ícono de herramientas)
Rename Track, Remove Track, Manual Input Gain, Manual Input Pan, Move Track Up, Move Track Down.

### Agregar pista
Hoja "Create New Track": Select from Local Library, Select from Files App, Instant Recording, Text To Speech, Cancel.

### Grabación instantánea
Popover anclado abajo: reloj grande estilo digital, botón "Tap to Record" que pasa a "Stop Recording", vúmetro de segmentos verde a rojo, botón cerrar. Al parar crea la pista "Recording" y aparecen los tips.

### Grabadora en línea (overdub)
Barra sobre la barra de edición: "Start Record", contador 00:00, vúmetro, botón de ajustes de overdub (Input Device, Output Device, Mic Live Monitoring ON u OFF, Overdub Monitor Volume). Graba sobre la pista escuchando las demás.

### Gestos (texto literal de los tips de SoundLab, a replicar)
1. "Tap a track to select it and position the selection line. Drag the line to select range. Drag the edges of the range to expand or shrink it. Double tap on a track or clip to select all. Tap on an empty area to clear the selection."
2. "After you select a range, click Effect button to choose from more than 25 range effects. Range effect means the effect will apply only to the selected range, not to the entire track."
3. "All editing operations can be Undo or Redo an unlimited number of times. This is very useful when you are fine tuning effect parameters: you can Undo imperfect results and tweak parameters until you are satisfied."
4. "Long pressing the middle of a clip to move it on the timeline of the track. Dragging on the blank area of the track can move all clips within the track."
5. "Pinch the waveform with two fingers or click zoom buttons to zoom in or out, scroll the view to change view port position, please note that this only moves the view port and does not alter the actual audio."

Comportamiento observado: el toque coloca la línea de selección (naranja) y mueve el cabezal; arrastrar desde la línea crea un rango con borde naranja y relleno gris translúcido; el pellizco hace zoom continuo alrededor del punto; el zoom no altera el audio.

### Automatización de volumen (Pro)
Panel inferior "Track 1: Recording" con la onda ampliada y la envolvente. Ayuda literal: "Tap the waveform to add control points. Drag control points to shape the volume envelope. Drag control points off the edge to delete them." Es no destructiva.

### Efectos de rango (hoja a media pantalla, cuadrícula de dos columnas, 30 efectos)
AI Vocal Separator, AI Stem Separator, De essing, AI Noise Suppression, 10 Bands Equalizer, Reverb Pro, Bass Boost, Amplify, Compressor, Change Pitch, Change Tempo, Normalize, Fade In, Fade Out, Phaser, Repeat, Censor Bleep, Reverse, Echo, Tape Delay, Paulstretch, Silence Remover, Noise Generator, Denoise, Center Cut, Wahwah.

Patrón de cada efecto (ejemplo Reverb Pro): diálogo centrado con columna de presets a la izquierda (Custom, Vocal I, Vocal II, Bathroom, Small Room I y II, Medium Room, Large Room), sliders con etiqueta y valor numérico a la derecha (Room Size, Pre Delay, Reverberance, HfDamping, Tone Low, Tone High, Wet Gain, Dry Gain, Stereo Width) y tres botones abajo: Cancel, Preview, Apply. Preview reproduce 3 o 5 segundos según la preferencia.

### Master Effects (hoja inferior, tres pestañas)
- Tune: Pitch con flechas de 0.01 y slider con reset; Tempo igual.
- Reverb: Disable, Small Room, Medium Room, Large Room, Medium Hall, Large Hall, Plate, Medium Chamber, Large Chamber, Cathedral, Large Room 2, Medium Hall 2, Medium Hall 3, Large Hall 2; Dry Wet con reset.
- Equalizer: Disable, Pop, Dance, Blues, Classical, Jazz, Electronic, Rock; diez bandas de 32 Hz a 16 kHz con valor en dB.

### Compartir (Exporter, hoja casi completa)
Formato: AAC, ALAC, MP3, FLAC, WAV. Calidad: Low 64 kbps, Medium 128 kbps, High 256 kbps (48 kHz 32 bits). Sample rate y canales. Metadatos: Title, Author, ISRC, Cover Art, File Name. Botón "Mixdown" en verde.

### Configuración (menú)
User Help, Set all tips as unread, User support website, Preference, Cancel. Preference: Timeline Marker (Timecode o Second), Effect Preview Length (3 o 5 s), Reduce UI Animation, Show Track Index, Keep Playing on Zoom.

### Guardar y cerrar
Pide título del proyecto: Save, Discard, Cancel.

## 2. Fuera del editor (a embeber en el nuestro)

- **Home**: New Project, Vocal Separator, Stem Separator, Recording Studio, Video Composer, Noise Reducer, Quick Recorder, Import File, Recent Projects, Tutorials. Pestañas Home, Projects, Files, Mine.
- **Recording Studio**: reloj, dispositivo de entrada con vúmetro, Mic Live Monitoring, Input Gain, Limiter, Reverb; Backing Track (archivo, play, volumen), Mix Into Recording, Reverb; botón rojo de grabar; formato; dispositivo de salida con vúmetro.
- **Quick Recorder**: reloj, dispositivo de entrada, formato (AAC, ALAC, WAV), 44.1 o 48 kHz, estéreo o mono, 128, 256 o 320 kbps, Tap to Record.
- **Vocal Separator y Stem Separator**: abrir archivo, reproducir original, modelo estándar con salida WAV 16 bits, Separate, salidas Vocals e Instrumental (o stems) con exportar y reproducir. Procesa en el dispositivo con un modelo de IA descargable ("AI Model Storage" en Mine).
- **Noise Reducer**: abrir archivo, Process File, archivo reducido con exportar y reproducir.
- **Video Composer**: fuente de audio, fuente de video, video mezclado, modo de mezcla (Video Mute, Equal Mix, Video Louder), Export.
- **Import File**: Import from Files, Extract Audio from Video, Import from Music Library, Import via Wi Fi, Import Project Archive.
- **Projects**: lista con menú por proyecto: Open, Share Project Archive, Archive to iCloud, Archive to External, Edit Project Info, Delete.

## 3. Qué tiene hoy el editor de ATTO

Carriles con clips, forma de onda, cabezal, regla, pellizco para zoom, toque para seleccionar clip, split, duplicar, borrar, deshacer y rehacer, importar, grabar (micrófono y llamada), efectos no destructivos por clip (EQ, compresor, reverb con presets de Apple, delay, pitch y tempo) renderizados en el dispositivo con AVAudioUnit, mezclador por carril (ganancia, mute, solo), transmisión a la llamada, exportación en el servidor con ffmpeg.

## 4. Brechas (lo que falta para "quedar igual")

| Área | SoundLab | ATTO hoy | Brecha |
| --- | --- | --- | --- |
| Selección | línea, rango arrastrable con bordes, doble toque, toque en vacío limpia | selección por clip | modelo de selección por rango dentro del clip |
| Acciones de rango | Copy, Cut, Paste, Remove, Silence, Trim | borrar clip | portapapeles de audio y las cuatro operaciones de rango |
| Acciones de clip | Insert o Replace, Split New, Join, Move Up y Down | split, duplicar | split a nueva pista, join, insertar y reemplazar, reordenar pistas |
| Mover clips | mantener pulsado y arrastrar; arrastrar en vacío mueve todos | arrastre de bordes | gesto de mover con retención |
| Panel de pista | nombre, gain y pan con sliders, Mute, Solo, menú | panel de carril con gain, mute, solo | pan, renombrar, sliders en el panel, menú por pista |
| Efectos | 30 efectos con presets, Preview y Apply sobre rango | 5 familias sobre el clip | efectos de rango, catálogo ampliado, vista previa |
| Automatización de volumen | envolvente con puntos | no | nuevo |
| Master Effects | pitch, tempo, reverb, EQ de 10 bandas globales | no | nuevo, sobre la mezcla |
| Grabación | instantánea, en línea con overdub y monitoreo, estudio con backing track | mic y llamada | overdub con monitoreo, ajustes de entrada |
| Loop | reproduce el rango en bucle | no | nuevo |
| Exportar | formatos, calidad, metadatos, portada | WAV en servidor | selector de formato y metadatos |
| Zoom | pellizco y botones, mantiene reproducción | pellizco | botones y preferencia |
| Herramientas de IA | separación de voz y stems, reducción de ruido en el dispositivo | no | modelos en el dispositivo o en el servidor (investigar) |
| Tutorial | tips una vez, opción de reiniciar | no | nuevo |

## 5. Principio de arquitectura (David, 19 de septiembre)

Todo componente que pueda ser nativo se hace nativo; el editor tiene que sentirse fluido y rápido.

- Forma de onda, regla y rango: módulo Expo en Swift que dibuja con Core Graphics o Metal dentro de un scroll nativo; zoom por pellizco y desplazamiento en el hilo de UI.
- Gestos: gesture handler y Reanimated con worklets; nada pasa por JS mientras el dedo está en la pantalla.
- Controles: UISlider para ganancia y pan, UISegmentedControl para selectores, menú contextual nativo de iOS para el menú de pista, hoja nativa para todas las hojas, vúmetros alimentados desde el motor de audio.
- Audio: reproducción, loop, vista previa de efectos y grabación en el motor nativo existente.

## 5. Plan por fases (propuesta)

1. **Esqueleto y gestos**: nuevo layout del editor con las cuatro barras, panel de pista con gain y pan, selección por línea y rango, doble toque, mover clips con retención, zoom con botones, lectura de Start, End y Play Head, tips del tutorial con botón para repetirlos.
2. **Edición de rango**: Copy, Cut, Paste, Remove, Silence, Trim, Split, Split New, Join, Duplicate, Insert y Replace, con deshacer y rehacer ilimitados.
3. **Efectos**: hoja de efectos a media pantalla con el catálogo y el diálogo de presets, sliders, Preview y Apply sobre rango. Primero los que ya existen en el dispositivo (EQ, compresor, reverb, delay, pitch, tempo, fade, normalize, amplify, reverse, repeat, silence), después el resto.
4. **Master Effects, loop y automatización de volumen.**
5. **Grabación** (decisión de David, 19 de septiembre): tocar grabar abre un bottom sheet con todos los controles y monitores de la grabación en un solo lugar, como el estudio de SoundLab: reloj, vúmetros de entrada y salida, dispositivo de entrada, monitoreo en vivo, ganancia de entrada, limitador, reverb de monitoreo, pista de fondo con volumen y mezcla, formato, y overdub sobre las pistas existentes. Al parar, la toma se escucha y se decide: ponerla en la pista, grabar de nuevo o descartarla. El botón de grabar la llamada se mantiene donde está y sigue su propio flujo.
6. **Exportar**: formato, calidad, metadatos y portada.
7. **Herramientas embebidas**: separación de voz y stems, reducción de ruido, extraer audio de video, importar de biblioteca y archivos, y el compositor de video, cada una como acción dentro del editor. Requiere investigación de modelos (separación y ruido) para elegir dispositivo o servidor.
8. **Videos tutoriales**: grabados controlando el teléfono, con marco de iPhone y zooms, uno por gesto o herramienta.

## 6. Auditoría estricta de paridad (19 de septiembre, incluye lo que desbloquea Pro)

Pro de SoundLab desbloquea, según su propia pantalla Mine: edición multipista de 16 pistas, los 25+ efectos, acceso total a las herramientas de IA, automatización de volumen y exportación sin pérdida. Todo eso está contemplado abajo.

### 6.1 Editor, pantalla por pantalla

| SoundLab | ATTO | Dónde |
| --- | --- | --- |
| Barra superior: cerrar, agregar pista, quitar pista, ajustes, compartir | listo | StudioTopBar |
| Cerrar pregunta Guardar, Descartar, Cancelar | listo | Alert nativa; Descartar devuelve el proyecto al estado en que se abrió |
| Barra de clip: Insert o Replace, Split New, Split, Join, Duplicate | listo | ClipActionsBar y el reductor |
| Regla con etiquetas y botón para plegar el panel | listo | vista nativa AttoTimelineView |
| Pistas altas con panel a la izquierda | listo | TrackPanel, 160 pt |
| Nombre de pista que abre el menú | listo | hoja nativa de pista |
| Slider de ganancia con su valor | listo | UISlider nativo |
| Slider de pan con su valor | listo | UISlider nativo |
| Mute, herramientas y Solo | listo | fila propia, llave junto al nombre |
| Menú de pista: renombrar, quitar, ganancia manual, pan manual, subir, bajar | listo | hoja nativa con nombre, color, pan, subir, bajar y eliminar |
| Crear pista: biblioteca local, archivos, grabación instantánea, texto a voz | parcial | archivos y grabación listos; biblioteca de música y texto a voz pendientes |
| Fila de zoom: automatización, alejar, acercar | listo | ZoomRow |
| Barra de rango: Copy, Cut, Paste, Effect, Remove, Silence, Trim | listo | RangeActionsBar |
| Transporte: Play, vúmetros L y R, Undo, Redo, grabadora, Loop, Master Effects | listo | TransportBar |
| Lectura Start, End, Play Head y "No Selection" | listo | StatusReadout en el hilo de UI |
| Selección: línea al tocar, rango al arrastrar, bordes, doble toque, vacío limpia | listo | gestos nativos |
| Mover clip con retención, arrastrar vacío mueve la pista | listo | onClipMove y onTrackDrag |
| Pellizco para zoom alrededor del punto | listo | nativo |
| Deshacer y rehacer ilimitados | listo | pila del reductor |
| Grabadora en línea con overdub y monitoreo | listo | hoja de grabación, decisión de David |
| Automatización de volumen con puntos de control | listo | AutomationPanel, se aplica en la mezcla |
| Master Effects: Tune, Reverb, Equalizer | listo | MasterEffectsSheet, se aplica en el export |
| Loop del rango | listo | TransportBar |
| Exportador: formato, calidad, frecuencia, canales, título, autor, ISRC, portada, nombre | listo | ExporterSheet y encodePlan en el backend |
| Menú de configuración: ayuda, marcar los tips como no leídos, soporte, preferencias | listo | hoja de ajustes estilo Settings |
| Preferencias: marcador de la regla, duración de la vista previa, reducir animación, mostrar número de pista, seguir reproduciendo al hacer zoom | listo salvo el marcador | las cinco están en la hoja; el formato de la regla necesita un prop nuevo en la vista nativa |
| Tips del tutorial una vez con botón para repetirlos | listo | se marcan vistos al aparecer |

### 6.2 Los 30 efectos de rango

Listos en el dispositivo (26): silence, remove, trim, reverse, repeat, fade in, fade out, amplify, normalize, bass boost, ecualizador de 10 bandas, compresor, de essing, echo, tape delay, phaser, wahwah, change pitch, change tempo, paulstretch, censor bleep, noise generator, silence remover, center cut, denoise (la reducción de ruido de IA usa esta puerta espectral) y reverb pro con sus presets.

Pendientes (2): AI Vocal Separator y AI Stem Separator. Necesitan un worker de servidor o un modelo descargable en el dispositivo; el análisis con costos, licencias y tiempos está en `ia-audio-opciones.md`. Es el único bloque de SoundLab que hoy no podemos igualar sin esa decisión.

### 6.3 Herramientas que SoundLab tiene fuera del editor

| Herramienta | ATTO | Nota |
| --- | --- | --- |
| Recording Studio | listo | es nuestra hoja de grabación: reloj, vúmetros, dispositivo, monitoreo, ganancia, limitador, reverb, overdub |
| Quick Recorder | listo | la misma hoja, con el paso de escucha antes de poner la toma |
| Noise Reducer | listo | efecto denoise sobre el rango o sobre la pista completa |
| Import File: desde Archivos | listo | selector de documentos |
| Import File: extraer audio de un video | listo | el video pasa por el convertidor nativo y entra solo su pista de audio |
| Import File: biblioteca de música | pendiente | requiere el selector de la biblioteca de iOS y no funciona con canciones protegidas |
| Import File: por Wi Fi y archivo de proyecto | no aplica | nuestros proyectos viven en el servidor y se abren desde cualquier dispositivo |
| Vocal Separator y Stem Separator | pendiente | mismo bloqueo que los dos efectos de IA |
| Video Composer | pendiente | decisión de producto: mezclar audio sobre un video para publicarlo |
| Tutoriales en video | pendiente | grabarlos controlando el teléfono, con marco de iPhone y zooms |
| Projects: abrir, editar información, borrar | listo | pantalla de proyectos, ahora también lista las pistas con su nombre y color |
| Projects: archivo a iCloud o externo, compartir archivo de proyecto | no aplica | equivalente nuestro: el proyecto ya está en la nube y el mix se publica al feed |

### 6.4 Lo que desbloquea Pro

| Pro de SoundLab | ATTO |
| --- | --- |
| Edición multipista, 16 pistas | listo, sin tope de 16 |
| Todos los efectos, 25+ | listo, 26 de 28; faltan los dos separadores de IA |
| Herramientas de IA, acceso total | parcial: reducción de ruido lista, separación pendiente |
| Automatización de volumen | listo |
| Exportación sin pérdida | listo: WAV, ALAC y FLAC, con AAC y MP3 para archivos pequeños |
