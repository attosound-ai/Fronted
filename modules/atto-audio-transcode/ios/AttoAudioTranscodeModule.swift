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
 *
 * The same module also hosts the offline studio pipeline (all of it AVFoundation
 * only, none of it touching AVAudioSession):
 *   toCanonicalCaf   any audio or video file to CAF int16 mono 48 kHz, the one
 *                    format every clip is cached in
 *   renderStem       mixes canonical clips into one lane stem (AttoStemRenderer)
 *   cancelRender     flags a running renderStem job to stop
 *   sweepCache       evicts the oldest files of a cache directory to a byte cap
 *   processRange     applies one RangeOp (SoundLab style range effects and edit
 *                    operations) to a time range of a clip, into a new CAF
 *   previewRange     renders a short audition of the same op
 *   getPeaks         waveform overview buckets, cached next to the file
 *   cancelProcess    flags a running processRange, previewRange or getPeaks
 *                    job to stop
 * The range ops live in ios/core (pure Swift, no ExpoModulesCore import) so
 * the exact same code runs in the command line harness under tests/.
 * Cache outputs are written to a temp sibling and renamed into place at the end
 * (AttoAtomicFile) so a killed process never leaves a truncated file under a key.
 */
public class AttoAudioTranscodeModule: Module {
  /// Progress of processRange and previewRange jobs: { jobId, progress 0..1 },
  /// at most ten times per second per job.
  static let processProgressEvent = "AttoAudioProcessProgress"

  public func definition() -> ModuleDefinition {
    Name("AttoAudioTranscode")

    Events(AttoAudioTranscodeModule.processProgressEvent)

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

    // Canonical clip format for the studio: CAF int16 mono 48 kHz. Decoding,
    // resampling and downmix are all done by AVAssetReader, same as above.
    AsyncFunction("toCanonicalCaf") {
      (inputPath: String, outputPath: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.convertToCanonicalCaf(
            inputPath: inputPath, outputPath: outputPath)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_CANONICAL", error.localizedDescription)
        }
      }
    }

    // Offline stem mix. The renderer throws AttoStemRenderError with the exact
    // code the caller must branch on (ERR_RENDER_CANCELLED versus a failure).
    AsyncFunction("renderStem") {
      (spec: [String: Any], outputPath: String, jobId: String, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try AttoStemRenderer.render(
            spec: spec, outputPath: outputPath, jobId: jobId)
          promise.resolve(result)
        } catch let error as AttoStemRenderError {
          promise.reject(error.code, error.message)
        } catch {
          promise.reject("ERR_RENDER", error.localizedDescription)
        }
      }
    }

    // Synchronous on purpose: it only flips a flag the render loop polls.
    Function("cancelRender") { (jobId: String) in
      AttoStemRenderer.cancel(jobId)
    }

    // Range effects and edit operations. `op` is the JSON RangeOp from
    // index.ts; `endSec` null means to the end of the file; `jobId` is
    // optional and enables cancelProcess plus progress events. Rejections
    // carry the ERR_PROCESS_* code the caller branches on.
    AsyncFunction("processRange") {
      (inputPath: String, startSec: Double, endSec: Double?, op: [String: Any], jobId: String?, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        do {
          let request = AttoRangeRequest(
            inputPath: inputPath, startSec: startSec, endSec: endSec, op: try AttoRangeOp.parse(op),
            jobId: jobId, progress: self?.makeProgressCallback())
          promise.resolve(try AttoRangeProcessor.process(request))
        } catch let error as AttoProcessError {
          promise.reject(error.code, error.message)
        } catch {
          promise.reject(AttoProcessError.generic, error.localizedDescription)
        }
      }
    }

    // Audition: one second of untouched context, then the first `previewSec`
    // seconds of the processed range. Never touches the rest of the file.
    AsyncFunction("previewRange") {
      (inputPath: String, startSec: Double, endSec: Double?, op: [String: Any], previewSec: Double, jobId: String?, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async { [weak self] in
        do {
          let request = AttoRangeRequest(
            inputPath: inputPath, startSec: startSec, endSec: endSec, op: try AttoRangeOp.parse(op),
            jobId: jobId, progress: self?.makeProgressCallback())
          promise.resolve(try AttoRangeProcessor.preview(request, previewSec: previewSec))
        } catch let error as AttoProcessError {
          promise.reject(error.code, error.message)
        } catch {
          promise.reject(AttoProcessError.generic, error.localizedDescription)
        }
      }
    }

    // Waveform overview: `count` buckets of absolute peak (0..1), cached on
    // disk next to the file and keyed by name, modification time and count.
    // MARK: Text to speech

    Function("speechVoices") { () -> [[String: Any]] in
      AttoSpeechRenderer.voices().map { voice in
        [
          "id": voice.identifier,
          "name": voice.name,
          "language": voice.language,
          "quality": voice.quality,
        ]
      }
    }

    AsyncFunction("renderSpeech") {
      (
        text: String, outputPath: String, voiceId: String?, language: String?, rate: Double?,
        pitch: Double?, promise: Promise
      ) in
      AttoSpeechRenderer.render(
        text: text,
        voiceId: voiceId,
        language: language,
        rate: rate.map { Float($0) },
        pitch: pitch.map { Float($0) },
        outputPath: outputPath
      ) { result in
        switch result {
        case .success(let rendered):
          promise.resolve([
            "outputPath": rendered.path,
            "durationSec": rendered.durationSec,
            "sampleRate": rendered.sampleRate,
          ])
        case .failure(let error as AttoProcessError):
          promise.reject(error.code, error.message)
        case .failure(let error):
          promise.reject(AttoProcessError.generic, error.localizedDescription)
        }
      }
    }

    // MARK: Music library

    Function("musicLibraryStatus") { () -> String in
      AttoMusicLibraryPicker.authorizationStatus()
    }

    AsyncFunction("requestMusicLibrary") { (promise: Promise) in
      AttoMusicLibraryPicker.requestAuthorization { granted in promise.resolve(granted) }
    }

    AsyncFunction("pickFromMusicLibrary") { (outputPath: String, promise: Promise) in
      AttoMusicLibraryPicker.pick(outputPath: outputPath) { result in
        switch result {
        case .success(nil):
          promise.resolve(nil)
        case .success(.some(let picked)):
          promise.resolve([
            "path": picked.path,
            "title": picked.title,
            "artist": picked.artist,
            "durationSec": picked.durationSec,
          ])
        case .failure(let error as AttoProcessError):
          promise.reject(error.code, error.message)
        case .failure(let error):
          promise.reject(AttoProcessError.generic, error.localizedDescription)
        }
      }
    }

    AsyncFunction("getPeaks") { (inputPath: String, count: Int, jobId: String?, promise: Promise) in
      DispatchQueue.global(qos: .utility).async {
        do {
          let peaks = try AttoPeaks.peaks(inputPath: inputPath, count: count, jobId: jobId)
          promise.resolve(peaks.map { Double($0) })
        } catch let error as AttoProcessError {
          promise.reject(error.code, error.message)
        } catch {
          promise.reject(AttoProcessError.generic, error.localizedDescription)
        }
      }
    }

    // Synchronous on purpose: it only flips a flag the chunk loops poll.
    Function("cancelProcess") { (jobId: String) in
      AttoProcessCancellation.shared.cancel(jobId)
    }

    AsyncFunction("sweepCache") {
      (directoryPath: String, maxBytes: Int, promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        do {
          let result = try Self.sweepCache(directoryPath: directoryPath, maxBytes: maxBytes)
          promise.resolve(result)
        } catch {
          promise.reject("ERR_SWEEP", error.localizedDescription)
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

  /// Bridges the core's progress callback to the JS event. sendEvent schedules
  /// onto the JS runtime itself, so calling it from the processing queue is fine.
  private func makeProgressCallback() -> AttoProgress.Callback {
    return { [weak self] jobId, progress in
      self?.sendEvent(
        AttoAudioTranscodeModule.processProgressEvent,
        ["jobId": jobId, "progress": progress])
    }
  }

  /// Studio clip format. Every cached clip and stem is mono at this rate.
  static let canonicalSampleRate: Double = 48000

  /// sweepCache never touches a file modified this recently: it may be a temp
  /// file still being written by a render on another queue.
  private static let sweepGraceSeconds: TimeInterval = 60

  // MARK: - toTelephonyWav

  private static func convert(inputPath: String, outputPath: String) throws -> [String: Any] {
    let started = Date()
    let inputURL = URL(fileURLWithPath: inputPath.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))

    // AVAssetWriter refuses to start if anything is already at the destination.
    try? FileManager.default.removeItem(at: outputURL)

    let asset = try transcodeLinearPCM(
      inputURL: inputURL, outputURL: outputURL,
      sampleRate: targetSampleRate, fileType: .wav)

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

  // MARK: - toCanonicalCaf

  /**
   * Any audio or video container (m4a, mp4, mov, wav, caf, mp3) to CAF, Linear
   * PCM, 16 bit signed little endian, mono, 48 kHz. Written to a temp sibling and
   * renamed into place so a cache key never points at a truncated file.
   */
  private static func convertToCanonicalCaf(inputPath: String, outputPath: String) throws
    -> [String: Any]
  {
    let started = Date()
    let inputURL = URL(fileURLWithPath: inputPath.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))

    let tempURL = try AttoAtomicFile.temporaryURL(for: outputURL, pathExtension: "caf")
    let frames: Int64
    do {
      _ = try transcodeLinearPCM(
        inputURL: inputURL, outputURL: tempURL,
        sampleRate: canonicalSampleRate, fileType: .caf)
      // Frame count comes from the finished file, not from asset.duration: the
      // writer's actual output is what the stem renderer will index into.
      frames = try AVAudioFile(forReading: tempURL).length
    } catch {
      AttoAtomicFile.discard(tempURL)
      throw error
    }
    try AttoAtomicFile.commit(temporaryURL: tempURL, to: outputURL)

    return [
      "outputPath": outputURL.absoluteString,
      "frames": Int(frames),
      "durationMs": Int(Double(frames) / canonicalSampleRate * 1000),
      "inputBytes": AttoAtomicFile.size(of: inputURL),
      "outputBytes": AttoAtomicFile.size(of: outputURL),
      "encodeMs": Int(Date().timeIntervalSince(started) * 1000),
    ]
  }

  // MARK: - shared reader / writer pull loop

  /**
   * Decodes `inputURL`'s first audio track to 16 bit mono Linear PCM at
   * `sampleRate` and writes it into `outputURL` as `fileType`. Returns the
   * asset so callers can read its duration. Nothing may exist at `outputURL`.
   */
  private static func transcodeLinearPCM(
    inputURL: URL, outputURL: URL, sampleRate: Double, fileType: AVFileType
  ) throws -> AVURLAsset {
    let asset = AVURLAsset(url: inputURL)
    guard let track = asset.tracks(withMediaType: .audio).first else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "No audio track in \(inputURL.lastPathComponent)"])
    }

    let reader = try AVAssetReader(asset: asset)
    // Decode to the TARGET format directly; AVFoundation does the sample-rate
    // conversion and downmix for us, so no manual resampling code to get wrong.
    let readerSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
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

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: fileType)
    let writerInput = AVAssetWriterInput(mediaType: .audio, outputSettings: readerSettings)
    writerInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(writerInput) else {
      throw NSError(
        domain: "AttoAudioTranscode", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Cannot write \(fileType.rawValue) output"])
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

    return asset
  }

  // MARK: - sweepCache

  /**
   * Evicts the oldest regular files (by modification date) in `directoryPath`
   * until the directory's total size is at or under `maxBytes`. Files touched
   * in the last `sweepGraceSeconds` are never removed, so an in flight temp
   * file or a clip the user just imported survives the sweep. A missing
   * directory is not an error: there is simply nothing to free.
   */
  private static func sweepCache(directoryPath: String, maxBytes: Int) throws -> [String: Any] {
    let directoryURL = URL(
      fileURLWithPath: directoryPath.replacingOccurrences(of: "file://", with: ""))
    let fm = FileManager.default

    var isDirectory: ObjCBool = false
    guard fm.fileExists(atPath: directoryURL.path, isDirectory: &isDirectory),
      isDirectory.boolValue
    else {
      return ["deleted": 0, "bytesFreed": 0, "bytesRemaining": 0]
    }

    struct Entry {
      let url: URL
      let bytes: Int
      let modified: Date
    }

    let keys: Set<URLResourceKey> = [.isRegularFileKey, .fileSizeKey, .contentModificationDateKey]
    let contents = try fm.contentsOfDirectory(
      at: directoryURL, includingPropertiesForKeys: Array(keys), options: [])

    var entries: [Entry] = []
    for url in contents {
      guard let values = try? url.resourceValues(forKeys: keys),
        values.isRegularFile == true
      else { continue }
      entries.append(
        Entry(
          url: url,
          bytes: values.fileSize ?? 0,
          modified: values.contentModificationDate ?? Date.distantPast))
    }

    var remaining = entries.reduce(0) { $0 + $1.bytes }
    var deleted = 0
    var freed = 0
    let cutoff = Date().addingTimeInterval(-sweepGraceSeconds)

    for entry in entries.sorted(by: { $0.modified < $1.modified }) {
      if remaining <= maxBytes { break }
      if entry.modified > cutoff { continue }
      do {
        try fm.removeItem(at: entry.url)
      } catch {
        // Another process may hold it or it may already be gone: keep going,
        // the bytes we could not free simply stay in `remaining`.
        continue
      }
      remaining -= entry.bytes
      freed += entry.bytes
      deleted += 1
    }

    return ["deleted": deleted, "bytesFreed": freed, "bytesRemaining": remaining]
  }
}
