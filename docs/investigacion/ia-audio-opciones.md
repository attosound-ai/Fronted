# IA de audio para el editor de ATTO: separación de stems y limpieza de ruido

Fecha: 19 de septiembre de 2026. Objetivo: paridad con SoundLab (voz, 4 o 6 stems, supresión de ruido, todo en el dispositivo) sin cuotas por minuto y con el audio del usuario privado.

## 1. Qué hace SoundLab en realidad

SoundLab ofrece "4 stems, 6 stems o un modelo afinado para un solo stem" en local, app de 181 MB, iOS 16 o superior (`https://apps.apple.com/us/app/soundlab-audio-editor/id1450417400`). Ese trío coincide con `htdemucs`, `htdemucs_6s` y `htdemucs_ft` de Meta: la referencia es Demucs v4 en Core ML más un supresor tipo DeepFilterNet.

## 2. Separación en el dispositivo (iOS)

**Demucs y HTDemucs en Core ML.** Core ML no soporta tensores complejos: todos los ports hacen la STFT en Swift con Accelerate y sólo la red va a Core ML. Proyectos:

* `mazut` (`https://github.com/milosmitar/mazut`): `htdemucs_6s` en SwiftUI para iOS y macOS, fp32 de 142 MB, int8 de 37 MB validado; fp16 rompe la rama temporal.
* `john-rocky/CoreML-Models` (`https://github.com/john-rocky/CoreML-Models`): `htdemucs` de 4 stems, `.mlpackage` de 80 MB, con script de conversión.
* `demucs-onnx` y los repos `StemSplitio` (`https://huggingface.co/StemSplitio/htdemucs-onnx`, `https://stemsplit.io/blog/htdemucs-ft-onnx-export`): `htdemucs` en 316 MB (166 MB en fp16), la bolsa `htdemucs_ft` en 1.26 GB; corre en onnxruntime con CoreML EP desde iOS 13 (`https://onnxruntime.ai/docs/execution-providers/CoreML-ExecutionProvider.html`). En CPU de M4 Pro `htdemucs` procesa 7.8 s de audio en 1.6 s con 1.1 GB de RAM; la bolsa `ft` necesita 88 s por canción de 3 min y 4 GB. La primera compilación Core ML del grafo tardó más de 5 minutos.
* `mlx-demucs` (`https://github.com/lextoumbourou/mlx-demucs`): 38 veces tiempo real en Apple Silicon, pero sólo macOS.

No hay benchmark publicado de HTDemucs en iPhone 15 Pro. Extrapolando el dato de M4 Pro, estimamos factor de tiempo real 0.3 a 1.0 en el A17 Pro (clip de 3 min en 1 a 3 min), pico de memoria cercano a 1 GB para `htdemucs` y demasiado para la bolsa `ft`. Hay que medirlo en un spike.

**Spleeter.** `fwcd/spleeter-pytorch` convierte la parte no FFT a Core ML (`https://github.com/fwcd/spleeter-pytorch`), pero rinde 5.9 dB SDR frente a 9.0 de HTDemucs y Deezer sólo licencia el código (`https://github.com/deezer/spleeter`). Descartado.

**APIs de Apple.** No hay separación en AVFoundation ni en Speech. El Stem Splitter de Logic Pro es interno y exige M1 (`https://support.apple.com/guide/logicpro-ipad/extract-vocal-instrumental-stems-stem-lpip1b60ada3/ipados`).

**Licencias.** El código de Demucs es MIT, pero el mantenedor escribió en el issue 327: "The model weights are not covered by the MIT license, and are provided only for scientific purposes" (`https://github.com/facebookresearch/demucs/issues/327`), por entrenarse con MUSDB. Los mirrors de Hugging Face que etiquetan `htdemucs` como MIT no tienen autoridad. Aplica igual en servidor y en dispositivo. Alternativas limpias: Mel Band RoFormer de KimberleyJSN (MIT, sólo voz, 8.42 dB SDR de voz frente a 8.38 de `htdemucs_ft` según ZFTurbo, `https://huggingface.co/KimberleyJSN/melbandroformer`, `https://github.com/ZFTurbo/Music-Source-Separation-Training`) y KUIELab MDX Net (MIT, 4 stems, 7.5 dB, `https://github.com/kuielab/mdx-net-submission`). Resumen de licencias: `https://github.com/galenoferreira/xeon_split_audio/blob/main/docs/research/model-licenses.md`.

## 3. Separación en servidor

**Demucs en CPU.** El README oficial indica 1.5 veces la duración del clip en CPU (`https://github.com/facebookresearch/demucs`); el port ONNX en C++ de Mixxx baja a 21 s por minuto de audio (`https://mixxx.org/news/2025-10-27-gsoc2025-demucs-to-onnx-dhunstack/`). En Railway con 4 vCPU asumimos factor 0.7 a 1.5: un clip de 3 min tarda 2 a 5 min con `htdemucs` y 4 veces más con `htdemucs_ft`. RAM: 1.1 GB con ONNX, 2 a 4 GB con PyTorch en clips de 10 min (7 GB por hora, `https://github.com/facebookresearch/demucs/issues/498`). Railway: 20 USD por vCPU y 10 USD por GB al mes, por uso (`https://railway.com/pricing`); 4 vCPU y 4 GB a plena carga cuestan 0.0028 USD por minuto de reloj, unos 0.003 USD por minuto de audio. El coste real es la latencia, no el dinero.

**GPU bajo demanda.** Replicate T4 a 0.000225 USD/s (`https://replicate.com/pricing`), `cjwbw/demucs` cuesta unos 0.023 USD por ejecución (`https://replicate.com/cjwbw/demucs`). Modal T4 0.000164 y L4 0.000222 USD/s (`https://modal.com/pricing`). RunPod L4 serverless 0.49 USD/h (`https://www.runpod.io/pricing`). La bolsa `ft` en T4 tarda 16 s por canción de 3 min: 0.003 a 0.005 USD por clip más arranque en frío de 20 a 60 s. El audio sale de nuestra infraestructura.

**APIs comerciales.** Music.ai: voz 0.07 USD/min, limpieza de stems 0.07, supresión de ruido 0.05, retención de 48 h en el plan gratuito (`https://music.ai/pricing/`). LALAL.AI: Pro 15 USD/mes con 250 min y API, recargas a 0.067 USD/min; declara no entrenar con archivos (`https://www.lalal.ai/pricing/`, `https://www.lalal.ai/privacy-policy/`). AudioShake: precio por ventas, céntimos por minuto en API (`https://www.audioshake.ai/`). Voice.ai es consumo con créditos, sin API clara (`https://voice.ai/pricing`). Todas envían audio de personas encarceladas a terceros; descartadas.

## 4. Supresión de ruido

* **RNNoise** (BSD, 85 KB, C puro, 48 kHz, tramas de 10 ms): corre en cualquier iPhone con un núcleo; calidad básica, falla con ruido no estacionario (`https://www.forasoft.com/learn/ai-for-video-engineering/articles-ai/real-time-noise-suppression-krisp-rnnoise-deepfilternet`).
* **DeepFilterNet 2 y 3** (MIT o Apache 2.0, 2.3 M parámetros, 8.5 MB en ONNX, 48 kHz): PESQ 3.17 en VoiceBank DEMAND para DFN3 frente a 3.08 de DFN2 y 2.73 de PercepNet (`https://arxiv.org/abs/2305.08227`, `https://arxiv.org/abs/2110.05588`); factor de tiempo real 0.19 en un hilo de portátil. Para iOS existe `DeepFilterNet-mlx` con grafo Core ML con estado para iOS 17 o superior, 34.9 veces tiempo real y 0.26 ms por salto (`https://github.com/kylehowells/DeepFilterNet-mlx`); ONNX en `https://huggingface.co/soniqo/DeepFilterNet3-ONNX`. Un clip de 3 min se limpia en 5 a 10 s en el iPhone o 30 a 40 s en un vCPU.
* **Apple Voice Isolation**: `AVCaptureDevice.MicrophoneMode.voiceIsolation` sólo actúa sobre la captura en vivo y lo activa el usuario desde el Centro de Control (`https://developer.apple.com/documentation/avfoundation/avcapturedevice/microphonemode/voiceisolation`); `setVoiceProcessingEnabled` exige render en dispositivo, no funciona en modo manual sobre archivos (`https://developer.apple.com/documentation/avfaudio/avaudioionode/setvoiceprocessingenabled(_:)`). Sirve para grabar mejor, no para limpiar clips.
* **Krisp SDK**: licencia por ventas sin precio público, sin versión iOS de consumo (`https://krisp.ai/pricing/`). Descartado.

Llamadas a 8 kHz: ambos modelos trabajan a 48 kHz; hay que remuestrear y sólo limpian la banda hasta 4 kHz. Quitan siseo y fondo, no recuperan agudos ni arreglan artefactos de códec.

## 5. Tabla comparativa

| Candidato | Calidad | 3 min de clip | Coste/min | Sin red | Descarga | Licencia | Integración |
|---|---|---|---|---|---|---|---|
| htdemucs Core ML en iPhone | 9.0 dB SDR | 1 a 3 min (estimado, medir) | 0 | Sí | 80 a 166 MB | Pesos sólo investigación | Módulo Swift nativo, STFT con vDSP |
| htdemucs_ft Core ML en iPhone | 9.2 dB SDR | 4 a 12 min, 4 GB | 0 | Sí | 1.26 GB | Pesos sólo investigación | Inviable en móvil |
| htdemucs en Railway CPU 4 vCPU | 9.0 dB SDR | 2 a 5 min | 0.003 USD | No | 0 | Pesos sólo investigación | Worker Python, Kafka, MinIO |
| Mel Band RoFormer voz en servidor | 8.4 dB SDR voz | 3 a 8 min en CPU | 0.005 USD | No | 0 | MIT | Worker Python, Kafka, MinIO |
| KUIELab MDX Net en servidor | 7.5 dB SDR | 1 a 3 min | 0.002 USD | No | 0 | MIT | Worker Python, Kafka, MinIO |
| GPU Modal o Replicate T4 | 9.2 dB SDR | 20 a 80 s con arranque | 0.001 a 0.002 USD | No | 0 | Igual que el modelo | Cliente HTTP desde el worker |
| Music.ai API | Comercial | 30 a 90 s | 0.07 USD | No | 0 | Comercial, 48 h retención | Cliente HTTP |
| LALAL.AI API | Comercial | 30 a 90 s | 0.06 a 0.07 USD | No | 0 | Comercial, no entrena | Cliente HTTP |
| DeepFilterNet3 Core ML en iPhone | PESQ 3.17 | 5 a 10 s | 0 | Sí | 8.5 MB | MIT o Apache 2.0 | Módulo Swift nativo |
| RNNoise en iPhone | Básica | 2 a 4 s | 0 | Sí | 85 KB | BSD | Módulo C nativo |
| Apple Voice Isolation | Buena en vivo | No aplica | 0 | Sí | 0 | Sistema | Sólo captura, no archivos |

## 6. Plan recomendado

**Denoise: primero y en el dispositivo.** DeepFilterNet3 en Core ML dentro de un módulo Expo nativo (Swift), con RNNoise de respaldo en iOS 16. Privado, gratis, 8.5 MB, cubre el caso principal de ATTO (voz). Esfuerzo: 4 a 6 días (módulo, remuestreo 8 y 48 kHz, UI de rango, pruebas con llamadas reales).

**Separación: primero en servidor, después en dispositivo.** Bloqueo previo: la licencia de los pesos de Demucs (escribir a Meta o usar pesos MIT). Plan:

1. Worker Python `audio-ai-service` en Railway (4 vCPU, 8 GB), mismo patrón que el pipeline actual: evento Kafka `audio.separate.requested`, descarga de MinIO, inferencia ONNX Runtime con `htdemucs` (o Mel Band RoFormer y MDX Net si Meta no autoriza), stems a MinIO, evento de completado, push. Clip de 3 min en 2 a 5 min, coste despreciable, el audio no sale de nuestra infraestructura. Esfuerzo: 6 a 8 días con cola, progreso y mezclador de stems.
2. Spike de 3 días en iPhone 15 Pro con el port Core ML de `mazut` o el `.mlpackage` de 80 MB: medir tiempo, memoria y calor. Si el factor baja de 1.0 y la memoria de 1.5 GB, pasar la separación al dispositivo con modelo descargable bajo demanda. Esfuerzo: 10 a 14 días (STFT en vDSP, troceo y solapado, descarga y caché; dispositivos antiguos siguen en servidor).
3. Sin GPU ni API comercial salvo que la cola se dispare; entonces Modal T4 (0.002 USD/min) desde el mismo worker.

Total: 10 a 14 días para la primera entrega (denoise en dispositivo más separación en servidor) y 13 a 17 días más para separación en el dispositivo.
