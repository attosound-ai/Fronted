import AVFoundation
import Foundation

/// Text to speech rendered to a file, the way SoundLab's "Text To Speech"
/// track source works: pick a voice, type the line, get audio you can place on
/// the timeline. AVSpeechSynthesizer writes buffers offline, so nothing is
/// played out loud and nothing touches the audio session.
enum AttoSpeechRenderer {
  struct Voice {
    let identifier: String
    let name: String
    let language: String
    let quality: String
  }

  static func voices() -> [Voice] {
    AVSpeechSynthesisVoice.speechVoices().map { voice in
      let quality: String
      switch voice.quality {
      case .premium: quality = "premium"
      case .enhanced: quality = "enhanced"
      default: quality = "default"
      }
      return Voice(
        identifier: voice.identifier,
        name: voice.name,
        language: voice.language,
        quality: quality)
    }
  }

  /// Writes `text` to a canonical CAF and answers its path and duration.
  /// `rate` and `pitch` follow AVSpeechUtterance: rate 0 to 1 around 0.5,
  /// pitch 0.5 to 2.
  static func render(
    text: String,
    voiceId: String?,
    language: String?,
    rate: Float?,
    pitch: Float?,
    outputPath: String,
    completion: @escaping (Result<(path: String, durationSec: Double, sampleRate: Double), Error>) -> Void
  ) {
    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else {
      completion(.failure(AttoProcessError(AttoProcessError.input, "The text is empty")))
      return
    }
    let utterance = AVSpeechUtterance(string: trimmed)
    if let voiceId, let voice = AVSpeechSynthesisVoice(identifier: voiceId) {
      utterance.voice = voice
    } else if let language, let voice = AVSpeechSynthesisVoice(language: language) {
      utterance.voice = voice
    }
    if let rate { utterance.rate = max(0.1, min(1, rate)) }
    if let pitch { utterance.pitchMultiplier = max(0.5, min(2, pitch)) }

    let synthesizer = AVSpeechSynthesizer()
    // The synthesizer must outlive this scope or the write stops half way.
    keepAlive.append(synthesizer)
    let url = URL(fileURLWithPath: outputPath)
    try? FileManager.default.removeItem(at: url)
    var file: AVAudioFile?
    var frames: AVAudioFramePosition = 0
    var settled = false

    let finish: (Result<(path: String, durationSec: Double, sampleRate: Double), Error>) -> Void = {
      result in
      guard !settled else { return }
      settled = true
      keepAlive.removeAll { $0 === synthesizer }
      completion(result)
    }

    synthesizer.write(utterance) { buffer in
      guard let pcm = buffer as? AVAudioPCMBuffer else { return }
      if pcm.frameLength == 0 {
        // An empty buffer is the end of the utterance.
        guard let written = file else {
          finish(.failure(AttoProcessError(AttoProcessError.input, "The voice produced no audio")))
          return
        }
        let rate = written.processingFormat.sampleRate
        file = nil
        finish(.success((outputPath, Double(frames) / rate, rate)))
        return
      }
      do {
        if file == nil {
          file = try AVAudioFile(
            forWriting: url,
            settings: pcm.format.settings,
            commonFormat: pcm.format.commonFormat,
            interleaved: pcm.format.isInterleaved)
        }
        try file?.write(from: pcm)
        frames += AVAudioFramePosition(pcm.frameLength)
      } catch {
        finish(.failure(error))
      }
    }
  }

  private static var keepAlive: [AVSpeechSynthesizer] = []
}
