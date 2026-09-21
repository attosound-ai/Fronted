import Foundation

/**
 * One processRange or previewRange call.
 */
struct AttoRangeRequest {
  var inputPath: String
  var startSec: Double
  /// nil means "to the end of the file".
  var endSec: Double?
  var op: AttoRangeOp
  var jobId: String?
  var progress: AttoProgress.Callback?
}

/**
 * Applies one AttoRangeOp to a time range of a file and writes a NEW canonical
 * CAF (int16 mono 48 kHz) into the module's cache directory. The audio before
 * and after the range is copied untouched; the range itself is streamed
 * through the op's stage chunk by chunk; ops that change length (remove,
 * trim, repeat, silenceRemover, changeTempo, paulstretch) simply write fewer
 * or more frames in the middle, which is what a splice is.
 *
 * Everything is chunked at one second of frames so memory does not depend on
 * the file length, the cancellation flag is polled between chunks, and
 * progress is reported through the request's callback (throttled to ten
 * events per second by AttoProgress).
 */
enum AttoRangeProcessor {

  /// Regions of the source timeline (output frames at 48 kHz) a run touches.
  struct Plan {
    /// Copied untouched before the processed range.
    var before: Range<Int64>?
    /// Fed to the op.
    var range: Range<Int64>
    /// The full selection length, for position dependent ops (fades) when a
    /// preview renders only the head of the selection.
    var logicalRangeFrames: Int64
    /// Copied untouched after the processed range.
    var after: Range<Int64>?
  }

  static let previewContextSeconds: Double = 1

  // MARK: - entry points

  static func process(_ request: AttoRangeRequest) throws -> [String: Any] {
    let started = Date()
    let reader = try AttoSourceReader(url: AttoAudioCore.fileURL(request.inputPath), outputRate: AttoAudioCore.canonicalSampleRate)
    let (start, end) = try resolveRange(request, total: reader.length)
    var plan = Plan(
      before: 0..<start, range: start..<end, logicalRangeFrames: end - start, after: end..<reader.length)
    if case .trim = request.op {
      // Trim keeps only the range: nothing outside it is copied.
      plan.before = nil
      plan.after = nil
    }
    return try run(request, reader: reader, plan: plan, started: started)
  }

  static func preview(_ request: AttoRangeRequest, previewSec: Double) throws -> [String: Any] {
    let started = Date()
    let rate = AttoAudioCore.canonicalSampleRate
    let reader = try AttoSourceReader(url: AttoAudioCore.fileURL(request.inputPath), outputRate: rate)
    let (start, end) = try resolveRange(request, total: reader.length)
    let context = Int64(previewContextSeconds * rate)
    let previewFrames = Int64(max(previewSec, 0.1) * rate)
    let before = max(0, start - context)..<start
    var plan: Plan
    switch request.op {
    case .trim:
      // Only the range survives a trim, so the audition is its head alone.
      plan = Plan(before: nil, range: start..<min(end, start + previewFrames), logicalRangeFrames: end - start, after: nil)
    case .remove:
      // The interesting part of a removal is the splice: one second on each side.
      plan = Plan(before: before, range: start..<start, logicalRangeFrames: end - start, after: end..<min(reader.length, end + context))
    default:
      plan = Plan(before: before, range: start..<min(end, start + previewFrames), logicalRangeFrames: end - start, after: nil)
    }
    return try run(request, reader: reader, plan: plan, started: started)
  }

  // MARK: - core

  private static func resolveRange(_ request: AttoRangeRequest, total: Int64) throws -> (Int64, Int64) {
    let rate = AttoAudioCore.canonicalSampleRate
    guard request.startSec.isFinite, request.startSec >= 0 else {
      throw AttoProcessError(AttoProcessError.badRange, "startSec must be a finite number of at least 0")
    }
    let start = AttoAudioCore.clamp(Int64((request.startSec * rate).rounded()), 0, total)
    var end = total
    if let endSec = request.endSec {
      guard endSec.isFinite else {
        throw AttoProcessError(AttoProcessError.badRange, "endSec must be finite or null")
      }
      end = AttoAudioCore.clamp(Int64((endSec * rate).rounded()), 0, total)
    }
    guard end >= start else {
      throw AttoProcessError(AttoProcessError.badRange, "endSec must not be before startSec")
    }
    return (start, end)
  }

  private static func run(_ request: AttoRangeRequest, reader: AttoSourceReader, plan: Plan, started: Date) throws -> [String: Any] {
    let rate = AttoAudioCore.canonicalSampleRate
    let cancellation = AttoProcessCancellation.shared
    defer {
      if let jobId = request.jobId { cancellation.clear(jobId) }
    }
    try cancellation.check(request.jobId)

    // centerCut on a mono file has nothing to remove: hand the input back.
    if case .centerCut = request.op, reader.channelCount < 2 {
      return [
        "outputPath": reader.url.absoluteString,
        "durationSec": reader.durationSeconds,
        "sampleRate": Int(rate),
        "noop": true,
        "processMs": Int(Date().timeIntervalSince(started) * 1000),
      ]
    }

    let rangeFrames = plan.range.count64
    let beforeFrames = plan.before?.count64 ?? 0
    let afterFrames = plan.after?.count64 ?? 0
    let progress = AttoProgress(
      jobId: request.jobId, totalUnits: Double(beforeFrames + afterFrames + rangeFrames), callback: request.progress)

    let outputURL = try AttoAudioCore.outputDirectory().appendingPathComponent("\(UUID().uuidString).caf")
    let tempURL = try AttoAtomicFile.temporaryURL(for: outputURL, pathExtension: "caf")
    let writer = try AttoCanonicalWriter(url: tempURL)
    var noop = false
    do {
      if let before = plan.before {
        try copy(before, reader: reader, writer: writer, progress: progress, jobId: request.jobId)
      }
      noop = try applyRange(request.op, plan: plan, reader: reader, writer: writer, progress: progress, jobId: request.jobId)
      if let after = plan.after {
        try copy(after, reader: reader, writer: writer, progress: progress, jobId: request.jobId)
      }
      writer.close()
    } catch {
      writer.close()
      AttoAtomicFile.discard(tempURL)
      throw error
    }
    try AttoAtomicFile.commit(temporaryURL: tempURL, to: outputURL)
    progress.finish()

    return [
      "outputPath": outputURL.absoluteString,
      "durationSec": Double(writer.framesWritten) / rate,
      "sampleRate": Int(rate),
      "noop": noop,
      "processMs": Int(Date().timeIntervalSince(started) * 1000),
    ]
  }

  /// Runs the op over `plan.range`. Returns true when the op turned out to
  /// be a no op for this input.
  private static func applyRange(
    _ op: AttoRangeOp, plan: Plan, reader: AttoSourceReader, writer: AttoCanonicalWriter,
    progress: AttoProgress, jobId: String?
  ) throws -> Bool {
    let range = plan.range
    let cancellation = AttoProcessCancellation.shared
    let rate = AttoAudioCore.canonicalSampleRate

    switch op {
    case .remove:
      return false

    case .reverse:
      var position = range.upperBound
      var chunk: [Float] = []
      while position > range.lowerBound {
        try cancellation.check(jobId)
        let chunkStart = max(range.lowerBound, position - Int64(AttoAudioCore.chunkFrames))
        reader.seek(toFrame: chunkStart)
        let got = try reader.readMono(into: &chunk, maxFrames: Int(position - chunkStart))
        if got == 0 { break }
        AttoVec.reverse(&chunk)
        try writer.write(chunk)
        progress.advance(Double(got))
        position = chunkStart
      }
      return false

    case .repeatRange(let count):
      progress.addWork(Double(range.count64 * Int64(count)))
      for _ in 0...count {
        try copy(range, reader: reader, writer: writer, progress: progress, jobId: jobId)
      }
      return false

    case .centerCut:
      // Mid is (L plus R) over 2, side is (L minus R) over 2; the side signal
      // is what remains once the centre is taken out.
      reader.seek(toFrame: range.lowerBound)
      var channels: [[Float]] = []
      var at = range.lowerBound
      while at < range.upperBound {
        try cancellation.check(jobId)
        let wanted = Int(min(Int64(AttoAudioCore.chunkFrames), range.upperBound - at))
        let got = try reader.readChannels(into: &channels, maxFrames: wanted)
        if got == 0 { break }
        var side = channels[0]
        AttoVec.addScaled(channels[1], times: -1, into: &side)
        AttoVec.scale(&side, by: 0.5)
        try writer.write(side)
        progress.advance(Double(got))
        at += Int64(got)
      }
      return false

    default:
      let stage = try makeStage(op, sampleRate: rate, renderedFrames: range.count64, logicalFrames: plan.logicalRangeFrames)
      if stage.prePasses > 0 {
        progress.addWork(Double(range.count64 * Int64(stage.prePasses)))
        for pass in 0..<stage.prePasses {
          try stage.prepare(pass: pass) { body in
            try reader.forEachMonoChunk(from: range.lowerBound, to: range.upperBound) { chunk, at in
              try cancellation.check(jobId)
              try body(&chunk, at - range.lowerBound)
              progress.advance(Double(chunk.count))
              return true
            }
          }
        }
      }
      try reader.forEachMonoChunk(from: range.lowerBound, to: range.upperBound) { chunk, at in
        try cancellation.check(jobId)
        let out = try stage.process(chunk, at: at - range.lowerBound)
        try writer.write(out)
        progress.advance(Double(chunk.count))
        return true
      }
      let tail = try stage.finish()
      try writer.write(tail)
      return false
    }
  }

  private static func copy(
    _ region: Range<Int64>, reader: AttoSourceReader, writer: AttoCanonicalWriter,
    progress: AttoProgress, jobId: String?
  ) throws {
    guard !region.isEmpty else { return }
    try reader.forEachMonoChunk(from: region.lowerBound, to: region.upperBound) { chunk, _ in
      try AttoProcessCancellation.shared.check(jobId)
      try writer.write(chunk)
      progress.advance(Double(chunk.count))
      return true
    }
  }

  // MARK: - stage factory

  /// Builds the streaming stage for `op`. `renderedFrames` is what the stage
  /// will actually receive, `logicalFrames` the full selection (they differ
  /// only in previews).
  static func makeStage(_ op: AttoRangeOp, sampleRate rate: Double, renderedFrames: Int64, logicalFrames: Int64) throws -> AttoRangeStage {
    switch op {
    case .silence:
      return AttoSilenceStage()
    case .trim:
      return AttoIdentityStage()
    case .fadeIn(let curve):
      return AttoFadeStage(fadeIn: true, curve: curve, rangeFrames: logicalFrames)
    case .fadeOut(let curve):
      return AttoFadeStage(fadeIn: false, curve: curve, rangeFrames: logicalFrames)
    case .amplify(let gainDb):
      return AttoGainStage(gainDb: gainDb)
    case .normalize(let peakDb):
      return AttoNormalizeStage(peakDb: peakDb)
    case .bassBoost(let gainDb, let frequencyHz):
      return AttoBiquadStage(filter: AttoBiquad.lowShelf(sampleRate: rate, frequencyHz: frequencyHz, gainDb: gainDb))
    case .tenBandEq(let gainsDb):
      return try AttoEngineStage(sampleRate: rate, expectedInputFrames: renderedFrames, build: AttoEngineStage.tenBandEq(gainsDb: gainsDb))
    case .compressor(let thresholdDb, let ratio, let attackMs, let releaseMs, let makeupDb):
      return try AttoEngineStage(
        sampleRate: rate, expectedInputFrames: renderedFrames,
        build: AttoEngineStage.compressor(thresholdDb: thresholdDb, ratio: ratio, attackMs: attackMs, releaseMs: releaseMs, makeupDb: makeupDb))
    case .deEss(let frequencyHz, let thresholdDb, let amountDb):
      return AttoDeEssStage(sampleRate: rate, frequencyHz: frequencyHz, thresholdDb: thresholdDb, amountDb: amountDb)
    case .echo(let delayMs, let decay, let repeats):
      return AttoEchoStage(sampleRate: rate, delayMs: delayMs, decay: decay, repeats: repeats)
    case .tapeDelay(let delayMs, let feedback, let wetDry, let lowPassHz):
      return try AttoEngineStage(
        sampleRate: rate, expectedInputFrames: renderedFrames,
        build: AttoEngineStage.tapeDelay(delayMs: delayMs, feedback: feedback, wetDry: wetDry, lowPassHz: lowPassHz))
    case .phaser(let rateHz, let depth, let feedback, let stages):
      return AttoPhaserStage(sampleRate: rate, rateHz: rateHz, depth: depth, feedback: feedback, stages: stages)
    case .wahwah(let rateHz, let depth, let resonance):
      return AttoWahwahStage(sampleRate: rate, rateHz: rateHz, depth: depth, resonance: resonance)
    case .changePitch(let cents):
      return try AttoEngineStage(sampleRate: rate, expectedInputFrames: renderedFrames, build: AttoEngineStage.timePitch(cents: cents, rate: 1))
    case .changeTempo(let tempo):
      return try AttoEngineStage(sampleRate: rate, expectedInputFrames: renderedFrames, rate: tempo, build: AttoEngineStage.timePitch(cents: 0, rate: tempo))
    case .paulstretch(let factor, let windowSec):
      return AttoPaulstretchStage(sampleRate: rate, factor: factor, windowSec: windowSec, expectedInputFrames: renderedFrames)
    case .censorBleep(let frequencyHz, let gainDb):
      return AttoBleepStage(sampleRate: rate, frequencyHz: frequencyHz, gainDb: gainDb)
    case .noiseGenerator(let kind, let amplitudeDb):
      return AttoNoiseStage(kind: kind, amplitudeDb: amplitudeDb)
    case .silenceRemover(let thresholdDb, let minSilenceMs, let keepMs):
      return AttoSilenceRemoverStage(sampleRate: rate, thresholdDb: thresholdDb, minSilenceMs: minSilenceMs, keepMs: keepMs)
    case .denoise(let strengthDb):
      return AttoDenoise.makeStage(sampleRate: rate, strengthDb: strengthDb, expectedInputFrames: renderedFrames)
    case .reverb(let preset, let wetDryMix):
      return try AttoEngineStage(
        sampleRate: rate, expectedInputFrames: renderedFrames, stereo: true,
        build: AttoEngineStage.reverb(preset: preset, wetDryMix: wetDryMix))
    case .eqSimple(let highPassHz, let presenceDb, let presenceHz, let lowShelfDb):
      return try AttoEngineStage(
        sampleRate: rate, expectedInputFrames: renderedFrames,
        build: AttoEngineStage.eqSimple(highPassHz: highPassHz, presenceDb: presenceDb, presenceHz: presenceHz, lowShelfDb: lowShelfDb))
    case .remove, .reverse, .repeatRange, .centerCut:
      throw AttoProcessError(AttoProcessError.generic, "\(op.type) is not a streaming stage")
    }
  }
}

extension Range where Bound == Int64 {
  var count64: Int64 { upperBound - lowerBound }
}
