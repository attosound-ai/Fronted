import AVFoundation
import ExpoModulesCore

/**
 * On-device audio normalisation to the project pipeline's real format:
 * 8 kHz mono 16-bit PCM WAV.
 *
 * WHY THIS EXISTS: a measured real import was a 27.1 MB WAV that took 49.4 s to
 * upload, and the backend then converted it to 8 kHz mono anyway, producing a
 * ~2.46 MB artifact. We were paying 11x the bytes for a file the server was going
 * to throw away. Converting here first makes the upload ~11x smaller AND lets the
 * server skip its ffmpeg pass entirely, because the file already matches the
 * target format it probes for.
 *
 * Deliberately AVFoundation-only (AVAssetReader + AVAssetWriter): no third-party
 * dependency, no app-size cost, and full control of the exact output format.
 * ffmpeg-based RN packages were rejected: ffmpeg-kit-react-native is archived and
 * its iOS binaries 404, and the community forks rehost patent-encumbered builds.
 *
 * The caller treats this as BEST EFFORT: any failure must fall back to uploading
 * the original file, so the worst case is exactly today's behaviour.
 */
public class AttoAudioTranscodeModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AttoAudioTranscode")

    AsyncFunction("toTelephonyWav") {
      (inputPath: String, outputPath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.convert(inputPath: inputPath, outputPath: outputPath)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_TRANSCODE", error.localizedDescription)
        }
      }
    }

    // Offline effects render (EQ / compressor / reverb / delay / pitch-time) on a
    // private engine. See AttoAudioEffectsRenderer for why it is offline-only and
    // why it can never touch the live call's audio session.
    AsyncFunction("renderEffects") {
      (inputPath: String, outputPath: String, chain: [String: Any], promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try AttoAudioEffectsRenderer.render(
            inputPath: inputPath, outputPath: outputPath, chain: chain)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_EFFECTS", error.localizedDescription)
        }
      }
    }
  }

  private static let targetSampleRate: Double = 8000
  private static let targetChannels: Int = 1

  private static func convert(inputPath: String, outputPath: String) throws -> [String: Any] {
    let started = Date()
    let inputURL = URL(fileURLWithPath: inputPath.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))

    // AVAssetWriter refuses to start if anything is already at the destination.
    try? FileManager.default.removeItem(at: outputURL)

    let asset = AVURLAsset(url: inputURL)
    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "No audio track in input"])
    }

    let reader = try AVAssetReader(asset: asset)
    // Decode to the TARGET format directly; AVFoundation does the sample-rate
    // conversion and downmix for us, so no manual resampling code to get wrong.
    let readerSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: targetSampleRate,
      AVNumberOfChannelsKey: targetChannels,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let readerOutput = AVAssetReaderTrackOutput(track: track, outputSettings: readerSettings)
    readerOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(readerOutput) else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Cannot read this audio format"])
    }
    reader.add(readerOutput)

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .wav)
    let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: readerSettings)
    writerInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(writerInput) else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Cannot write WAV output"])
    }
    writer.add(writerInput)

    guard reader.startReading() else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 4,
        userInfo: [NSLocalizedDescriptionKey: reader.error?.localizedDescription ?? "startReading failed"])
    }
    guard writer.startWriting() else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 5,
        userInfo: [NSLocalizedDescriptionKey: writer.error?.localizedDescription ?? "startWriting failed"])
    }
    writer.startSession(atSourceTime: .zero)

    // Pull-driven copy on a serial queue; requestMediaDataWhenReady hands us the
    // writer's backpressure so we never buffer the whole file in memory (the exact
    // problem the multipart upload path has).
    let queue = DispatchQueue(label: "com.atto.transcode")
    let sem = DispatchSemaphore(value: 0)
    var copyError: Error?

    writerInput.requestMediaDataWhenReady(on: queue) {
      while writerInput.isReadyForMoreMediaData {
        guard reader.status == .reading,
          let buffer = readerOutput.copyNextSampleBuffer()
        else {
          if reader.status == .failed {
            copyError = reader.error
          }
          writerInput.markAsFinished()
          sem.signal()
          return
        }
        if !writerInput.append(buffer) {
          copyError = writer.error
          writerInput.markAsFinished()
          sem.signal()
          return
        }
      }
    }

    sem.wait()
    if let copyError {
      writer.cancelWriting()
      throw copyError
    }

    let finishSem = DispatchSemaphore(value: 0)
    writer.finishWriting { finishSem.signal() }
    finishSem.wait()

    if writer.status != .completed {
      throw NSError(
        domain: "AttoAudioTranscode", code: 6,
        userInfo: [NSLocalizedDescriptionKey: writer.error?.localizedDescription ?? "Write did not complete"])
    }

    let attrs = try FileManager.default.attributesOfItem(atPath: outputURL.path)
    let outputBytes = (attrs[.size] as? NSNumber)?.intValue ?? 0
    let inputAttrs = try? FileManager.default.attributesOfItem(atPath: inputURL.path)
    let inputBytes = (inputAttrs?[.size] as? NSNumber)?.intValue ?? 0

    return [
      "outputPath": outputURL.absoluteString,
      "inputBytes": inputBytes,
      "outputBytes": outputBytes,
      "durationMs": Int(CMTimeGetSeconds(asset.duration) * 1000),
      "sampleRate": Int(targetSampleRate),
      "channels": targetChannels,
      "encodeMs": Int(Date().timeIntervalSince(started) * 1000),
    ]
  }
}
