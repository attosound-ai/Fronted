import AVFoundation
import Foundation

/**
 * Error carrying the JS facing code so the module can reject with the exact
 * code the caller must branch on (cancellation versus a real failure).
 */
struct AttoStemRenderError: LocalizedError {
  let code: String
  let message: String
  var errorDescription: String? { message }
}

/**
 * Offline mix of already canonical clip files (CAF, mono, 48 kHz, produced by
 * toCanonicalCaf) into ONE stem file: CAF, Linear PCM, 16 bit signed integer,
 * little endian, mono, 48 kHz, exactly `totalFrames` long, silence wherever no
 * clip plays.
 *
 * WHY THIS SHAPE: a stem is the flattened result of a lane's clips at their
 * timeline positions, so the mixer only has to play N stems instead of N times
 * M clips, and the export pipeline can consume the stems directly. Rendering
 * OFFLINE with plain AVAudioFile reads and writes (no engine, no hardware)
 * means this can never disturb a live call: we never touch AVAudioSession here.
 *
 * Memory is constant regardless of stem length: one 4096 frame float block is
 * filled, clamped and written per iteration. Every distinct clip file is opened
 * once (AVAudioFile keeps its own decode buffer) and kept open for the whole
 * render, then released when the render returns.
 *
 * Clips are read through AVAudioFile with a float32 non interleaved processing
 * format, so any PCM CAF (int16 or float32) works, and multi channel sources
 * are averaged down to mono. The sample rate is NOT converted: a clip whose
 * rate is not 48 kHz is rejected with ERR_RENDER_INPUT so the caller runs
 * toCanonicalCaf on it first, instead of silently getting a pitch shifted mix.
 */
enum AttoStemRenderer {

  /// Frames per mix block. Also the capacity of every per clip read buffer.
  static let blockFrames: AVAudioFrameCount = 4096

  /// Hard cap on stem length: 30 minutes at the canonical rate.
  static let maxTotalFrames: Int64 =
    Int64(AttoAudioTranscodeModule.canonicalSampleRate) * 60 * 30

  // MARK: - cancellation

  /**
   * Thread safe registry of cancelled job ids. cancelRender runs on the JS
   * thread while the render loop runs on a global queue, hence the lock.
   * A cancel can legitimately arrive BEFORE the render body starts (the
   * AsyncFunction is dispatched asynchronously), so ids are recorded
   * unconditionally and cleared when the matching render finishes. Job ids
   * must therefore be unique per call (the JS wrapper documents this).
   */
  private final class CancellationRegistry: @unchecked Sendable {
    private let lock = NSLock()
    private var cancelled = Set<String>()

    func cancel(_ jobId: String) {
      lock.lock()
      cancelled.insert(jobId)
      lock.unlock()
    }

    func isCancelled(_ jobId: String) -> Bool {
      lock.lock()
      defer { lock.unlock() }
      return cancelled.contains(jobId)
    }

    func clear(_ jobId: String) {
      lock.lock()
      cancelled.remove(jobId)
      lock.unlock()
    }
  }

  private static let cancellations = CancellationRegistry()

  /// Marks `jobId` cancelled; the render loop notices at its next block.
  static func cancel(_ jobId: String) {
    cancellations.cancel(jobId)
  }

  // MARK: - model

  private struct Clip {
    /// Normalised file path, the key into the open sources dictionary.
    let key: String
    /// Offset inside the clip file where reading starts.
    let startFrame: Int64
    /// Frames taken from the clip file (already bounded to file and stem).
    let frameCount: Int64
    /// Stem frame where the clip's first frame lands.
    let positionFrame: Int64
    /// Linear gain, already clamped to 0...4.
    let gain: Float
  }

  /// One open clip file plus a reusable read buffer in its processing format.
  private final class Source {
    let file: AVAudioFile
    let buffer: AVAudioPCMBuffer

    init(file: AVAudioFile, buffer: AVAudioPCMBuffer) {
      self.file = file
      self.buffer = buffer
    }
  }

  // MARK: - render

  static func render(spec: [String: Any], outputPath: String, jobId: String) throws
    -> [String: Any]
  {
    let started = Date()
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    let sampleRate = AttoAudioTranscodeModule.canonicalSampleRate

    // Whatever happens below, the id must not leak into a future job.
    defer { cancellations.clear(jobId) }

    // Spec validation.
    guard let totalFrames = int64(spec["totalFrames"]) else {
      throw AttoStemRenderError(
        code: "ERR_RENDER_SPEC", message: "totalFrames is missing or not a number")
    }
    guard totalFrames > 0, totalFrames <= maxTotalFrames else {
      throw AttoStemRenderError(
        code: "ERR_RENDER_SPEC",
        message: "totalFrames must be in 1...\(maxTotalFrames), got \(totalFrames)")
    }
    var rawClips: [[String: Any]] = []
    if let clipsValue = spec["clips"] {
      guard let list = clipsValue as? [[String: Any]] else {
        throw AttoStemRenderError(
          code: "ERR_RENDER_SPEC", message: "clips must be an array of clip objects")
      }
      rawClips = list
    }

    // Open every distinct clip file once and bound every clip to its file.
    var sources: [String: Source] = [:]
    var clips: [Clip] = []
    for (index, raw) in rawClips.enumerated() {
      guard let path = raw["path"] as? String, !path.isEmpty else {
        throw AttoStemRenderError(
          code: "ERR_RENDER_SPEC", message: "clips[\(index)].path is missing")
      }
      let key = path.replacingOccurrences(of: "file://", with: "")
      let source: Source
      if let existing = sources[key] {
        source = existing
      } else {
        source = try openSource(path: key, sampleRate: sampleRate)
        sources[key] = source
      }

      let length = source.file.length
      let startFrame = clamp(int64(raw["startFrame"]) ?? 0, 0, length)
      let available = length - startFrame
      let requested = clamp(int64(raw["frameCount"]) ?? available, 0, available)
      let positionFrame = clamp(int64(raw["positionFrame"]) ?? 0, 0, totalFrames)
      let frameCount = min(requested, totalFrames - positionFrame)
      let gain = Float(clamp(number(raw["gain"]) ?? 1, 0, 4))

      // Nothing audible to contribute: skip it rather than burn reads on it.
      if frameCount <= 0 || gain == 0 { continue }
      clips.append(
        Clip(
          key: key, startFrame: startFrame, frameCount: frameCount,
          positionFrame: positionFrame, gain: gain))
    }

    // Mix into a temp file, then move it into place.
    let tempURL = try AttoAtomicFile.temporaryURL(for: outputURL, pathExtension: "caf")
    let peak: Float
    do {
      peak = try mix(
        clips: clips, sources: sources, totalFrames: totalFrames,
        sampleRate: sampleRate, to: tempURL, jobId: jobId)
    } catch {
      AttoAtomicFile.discard(tempURL)
      throw error
    }
    try AttoAtomicFile.commit(temporaryURL: tempURL, to: outputURL)

    return [
      "outputPath": outputURL.absoluteString,
      "totalFrames": Int(totalFrames),
      "durationMs": Int(Double(totalFrames) / sampleRate * 1000),
      "renderMs": Int(Date().timeIntervalSince(started) * 1000),
      "peak": Double(peak),
      "clips": clips.count,
      "outputBytes": AttoAtomicFile.size(of: outputURL),
    ]
  }

  // MARK: - block loop

  /**
   * The constant memory core. Returns the peak absolute sample value seen
   * BEFORE clamping, so the caller can tell whether the stem clipped.
   * The output AVAudioFile is a local here on purpose: it is released (and
   * therefore flushed and closed) when this function returns, before the
   * caller renames the temp file.
   */
  private static func mix(
    clips: [Clip], sources: [String: Source], totalFrames: Int64,
    sampleRate: Double, to tempURL: URL, jobId: String
  ) throws -> Float {
    let outSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    // Float32 processing format: we hand AVAudioFile float blocks and it
    // converts to the int16 file format on write.
    let outFile = try AVAudioFile(
      forWriting: tempURL, settings: outSettings,
      commonFormat: .pcmFormatFloat32, interleaved: false)
    guard
      let outBuffer = AVAudioPCMBuffer(
        pcmFormat: outFile.processingFormat, frameCapacity: blockFrames),
      let outChannels = outBuffer.floatChannelData
    else {
      throw AttoStemRenderError(
        code: "ERR_RENDER", message: "Could not allocate the mix buffer")
    }
    // Channel 0 of the output buffer IS the mix block: no extra copy per block.
    let block = outChannels[0]

    var peak: Float = 0
    var blockStart: Int64 = 0
    while blockStart < totalFrames {
      if cancellations.isCancelled(jobId) {
        throw AttoStemRenderError(
          code: "ERR_RENDER_CANCELLED", message: "Render \(jobId) was cancelled")
      }

      let blockEnd = min(blockStart + Int64(blockFrames), totalFrames)
      let blockLength = Int(blockEnd - blockStart)
      block.update(repeating: 0, count: blockLength)

      for clip in clips {
        let overlapStart = max(blockStart, clip.positionFrame)
        let overlapEnd = min(blockEnd, clip.positionFrame + clip.frameCount)
        if overlapEnd <= overlapStart { continue }
        guard let source = sources[clip.key] else { continue }

        let wanted = AVAudioFrameCount(overlapEnd - overlapStart)
        source.file.framePosition = clip.startFrame + (overlapStart - clip.positionFrame)
        source.buffer.frameLength = 0
        do {
          try source.file.read(into: source.buffer, frameCount: wanted)
        } catch {
          throw AttoStemRenderError(
            code: "ERR_RENDER_INPUT",
            message: "Cannot read clip \(clip.key): \(error.localizedDescription)")
        }
        let got = Int(source.buffer.frameLength)
        if got == 0 { continue }
        guard let channels = source.buffer.floatChannelData else { continue }

        // Multi channel sources are averaged to mono; canonical clips are
        // already mono so the divisor is 1 for them.
        let channelCount = Int(source.buffer.format.channelCount)
        let scale = clip.gain / Float(channelCount)
        let dst = block + Int(overlapStart - blockStart)
        for ch in 0..<channelCount {
          let src = channels[ch]
          for i in 0..<got {
            dst[i] += src[i] * scale
          }
        }
      }

      // Peak is measured before the clamp so the caller can detect clipping.
      for i in 0..<blockLength {
        let v = block[i]
        let magnitude = abs(v)
        if magnitude > peak { peak = magnitude }
        if v > 1 {
          block[i] = 1
        } else if v < -1 {
          block[i] = -1
        }
      }

      outBuffer.frameLength = AVAudioFrameCount(blockLength)
      try outFile.write(from: outBuffer)
      blockStart = blockEnd
    }
    return peak
  }

  // MARK: - helpers

  /**
   * Opens one clip file for float32 non interleaved reading and allocates its
   * block sized read buffer. Any failure here is the caller's input, hence
   * ERR_RENDER_INPUT naming the path.
   */
  private static func openSource(path: String, sampleRate: Double) throws -> Source {
    let url = URL(fileURLWithPath: path)
    let file: AVAudioFile
    do {
      file = try AVAudioFile(
        forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
    } catch {
      throw AttoStemRenderError(
        code: "ERR_RENDER_INPUT",
        message: "Cannot open clip \(path): \(error.localizedDescription)")
    }
    let format = file.processingFormat
    guard format.sampleRate == sampleRate else {
      throw AttoStemRenderError(
        code: "ERR_RENDER_INPUT",
        message:
          "Clip \(path) is \(Int(format.sampleRate)) Hz, expected \(Int(sampleRate)) Hz. Run toCanonicalCaf first."
      )
    }
    guard format.channelCount >= 1,
      let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: blockFrames)
    else {
      throw AttoStemRenderError(
        code: "ERR_RENDER_INPUT",
        message: "Could not allocate a read buffer for clip \(path)")
    }
    return Source(file: file, buffer: buffer)
  }

  private static func number(_ v: Any?) -> Double? {
    if let d = v as? Double { return d }
    if let i = v as? Int { return Double(i) }
    if let n = v as? NSNumber { return n.doubleValue }
    return nil
  }

  /// Integer view of a JS number. NaN and infinities count as "not a number";
  /// absurd magnitudes are clamped so the Int64 conversion can never trap.
  private static func int64(_ v: Any?) -> Int64? {
    guard let d = number(v), d.isFinite else { return nil }
    let bounded = min(max(d.rounded(), -9_007_199_254_740_992), 9_007_199_254_740_992)
    return Int64(bounded)
  }

  private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    return min(max(v, lo), hi)
  }

  private static func clamp(_ v: Int64, _ lo: Int64, _ hi: Int64) -> Int64 {
    // hi can drop below lo when a clip file is empty; never let that trap.
    return min(max(v, lo), max(lo, hi))
  }
}
