import AVFoundation
import AudioToolbox

/**
 * Offline (faster-than-realtime) effects render for ONE audio clip, using the
 * stock Apple Audio Units on a private AVAudioEngine in manual rendering mode.
 *
 * WHY THIS SHAPE: the effect set a vocal-over-a-beat needs (EQ, compression,
 * reverb, delay, pitch/time) already ships in iOS as AVAudioUnit* nodes. Using
 * them means zero third-party DSP, zero licence questions and zero extra pods.
 * Rendering OFFLINE on a throwaway engine (never the live call engine) means
 * this can never disturb an active Twilio call, its audio session or echo
 * cancellation: in manual rendering mode the engine is disconnected from the
 * audio hardware entirely, so we never touch AVAudioSession here.
 *
 * AVAudioUnitTimePitch is deliberately OFFLINE-ONLY (it is known to crackle and
 * misbehave when reconfigured inside a running realtime graph).
 *
 * Output: a 16-bit PCM WAV at the input's sample rate and channel count, so the
 * result drops straight into the existing 8 kHz mono pipeline and export mix.
 * The caller treats this as BEST EFFORT and keeps the dry source on failure.
 */
enum AttoAudioEffectsRenderer {

  // Tail rendered after the source ends so reverb / delay decays are not cut.
  private static let reverbTailSeconds: Double = 2.5
  private static let delayTailSeconds: Double = 1.5
  private static let dryTailSeconds: Double = 0.05

  static func render(inputPath: String, outputPath: String, chain: [String: Any]) throws
    -> [String: Any]
  {
    let started = Date()
    let inputURL = URL(fileURLWithPath: inputPath.replacingOccurrences(of: "file://", with: ""))
    let outputURL = URL(fileURLWithPath: outputPath.replacingOccurrences(of: "file://", with: ""))
    try? FileManager.default.removeItem(at: outputURL)

    let inputFile = try AVAudioFile(forReading: inputURL)
    let format = inputFile.processingFormat
    guard inputFile.length > 0 else {
      throw NSError(
        domain: "AttoAudioEffects", code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Input has no audio frames"])
    }

    let engine = AVAudioEngine()
    let player = AVAudioPlayerNode()
    engine.attach(player)
    var nodes: [AVAudioNode] = [player]
    var applied: [String] = []
    var rate: Double = 1.0
    var tailSeconds = dryTailSeconds

    // ── EQ: high-pass (rumble / handling noise) + a presence band ──────────
    if let eq = chain["eq"] as? [String: Any] {
      let unit = AVAudioUnitEQ(numberOfBands: 3)
      unit.globalGain = 0
      let highPassHz = clamp(number(eq["highPassHz"]) ?? 0, 0, 1000)
      let presenceDb = clamp(number(eq["presenceDb"]) ?? 0, -12, 12)
      let presenceHz = clamp(number(eq["presenceHz"]) ?? 3000, 800, 8000)
      let lowShelfDb = clamp(number(eq["lowShelfDb"]) ?? 0, -12, 12)

      let hp = unit.bands[0]
      hp.filterType = .highPass
      hp.frequency = Float(max(highPassHz, 10))
      hp.bandwidth = 0.5
      hp.bypass = highPassHz <= 0

      let presence = unit.bands[1]
      presence.filterType = .parametric
      presence.frequency = Float(presenceHz)
      presence.bandwidth = 1.0
      presence.gain = Float(presenceDb)
      presence.bypass = presenceDb == 0

      let lowShelf = unit.bands[2]
      lowShelf.filterType = .lowShelf
      lowShelf.frequency = 200
      lowShelf.gain = Float(lowShelfDb)
      lowShelf.bypass = lowShelfDb == 0

      engine.attach(unit)
      nodes.append(unit)
      applied.append("eq")
    }

    // ── Compression: Apple's Dynamics Processor AU ─────────────────────────
    // Parameter addresses are the v2 AU parameter IDs (AudioToolbox):
    //   0 Threshold (dB)  1 HeadRoom (dB)  4 AttackTime (s)  5 ReleaseTime (s)
    //   6 OverallGain (dB, make-up)
    if let comp = chain["compressor"] as? [String: Any] {
      var desc = AudioComponentDescription()
      desc.componentType = kAudioUnitType_Effect
      desc.componentSubType = kAudioUnitSubType_DynamicsProcessor
      desc.componentManufacturer = kAudioUnitManufacturer_Apple
      let unit = AVAudioUnitEffect(audioComponentDescription: desc)
      let tree = unit.auAudioUnit.parameterTree
      let thresholdDb = clamp(number(comp["thresholdDb"]) ?? -20, -40, 0)
      let headRoomDb = clamp(number(comp["headRoomDb"]) ?? 6, 0.1, 40)
      let attackMs = clamp(number(comp["attackMs"]) ?? 10, 0.1, 200)
      let releaseMs = clamp(number(comp["releaseMs"]) ?? 80, 10, 3000)
      let makeupDb = clamp(number(comp["makeupDb"]) ?? 0, -40, 40)
      tree?.parameter(withAddress: 0)?.value = AUValue(thresholdDb)
      tree?.parameter(withAddress: 1)?.value = AUValue(headRoomDb)
      tree?.parameter(withAddress: 4)?.value = AUValue(attackMs / 1000)
      tree?.parameter(withAddress: 5)?.value = AUValue(releaseMs / 1000)
      tree?.parameter(withAddress: 6)?.value = AUValue(makeupDb)
      engine.attach(unit)
      nodes.append(unit)
      applied.append("compressor")
    }

    // ── Pitch / time (offline only) ────────────────────────────────────────
    if let pt = chain["pitchTime"] as? [String: Any] {
      let unit = AVAudioUnitTimePitch()
      unit.pitch = Float(clamp(number(pt["pitchCents"]) ?? 0, -2400, 2400))
      rate = clamp(number(pt["rate"]) ?? 1.0, 0.25, 4.0)
      unit.rate = Float(rate)
      unit.overlap = 8
      engine.attach(unit)
      nodes.append(unit)
      applied.append("pitchTime")
    }

    // ── Delay ──────────────────────────────────────────────────────────────
    if let d = chain["delay"] as? [String: Any] {
      let unit = AVAudioUnitDelay()
      unit.delayTime = clamp(number(d["timeMs"]) ?? 250, 0, 2000) / 1000
      unit.feedback = Float(clamp(number(d["feedback"]) ?? 25, -100, 100))
      unit.wetDryMix = Float(clamp(number(d["wetDryMix"]) ?? 20, 0, 100))
      unit.lowPassCutoff = Float(clamp(number(d["lowPassCutoffHz"]) ?? 6000, 10, 22050))
      engine.attach(unit)
      nodes.append(unit)
      applied.append("delay")
      tailSeconds = max(tailSeconds, delayTailSeconds)
    }

    // ── Reverb (factory presets so the UI can ship named spaces) ───────────
    if let r = chain["reverb"] as? [String: Any] {
      let unit = AVAudioUnitReverb()
      unit.loadFactoryPreset(reverbPreset(r["preset"] as? String))
      unit.wetDryMix = Float(clamp(number(r["wetDryMix"]) ?? 25, 0, 100))
      engine.attach(unit)
      nodes.append(unit)
      applied.append("reverb")
      tailSeconds = max(tailSeconds, reverbTailSeconds)
    }

    // Nothing to apply: caller should have short-circuited, but stay correct.
    if applied.isEmpty {
      throw NSError(
        domain: "AttoAudioEffects", code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Effect chain is empty"])
    }

    // Wire the chain in order, then into the mixer.
    for i in 0..<(nodes.count - 1) {
      engine.connect(nodes[i], to: nodes[i + 1], format: format)
    }
    engine.connect(nodes[nodes.count - 1], to: engine.mainMixerNode, format: format)

    // Offline mode: no hardware, no audio session, faster than realtime.
    let maxFrames: AVAudioFrameCount = 4096
    try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: maxFrames)
    try engine.start()
    player.scheduleFile(inputFile, at: nil)
    player.play()

    let outSettings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: format.sampleRate,
      AVNumberOfChannelsKey: Int(format.channelCount),
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    let outFile = try AVAudioFile(
      forWriting: outputURL, settings: outSettings,
      commonFormat: engine.manualRenderingFormat.commonFormat,
      interleaved: engine.manualRenderingFormat.isInterleaved)

    guard
      let buffer = AVAudioPCMBuffer(
        pcmFormat: engine.manualRenderingFormat,
        frameCapacity: engine.manualRenderingMaximumFrameCount)
    else {
      throw NSError(
        domain: "AttoAudioEffects", code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Could not allocate render buffer"])
    }

    // LATENCY COMPENSATION. Effect AUs (the Dynamics Processor and TimePitch
    // especially) report an algorithmic latency: their output lags the input by
    // that many frames, with silence prepended. The clip keeps its in/out window
    // on the source timeline, so without compensation the take lands LATE over
    // the beat by the summed latency. We skip that many frames at the start of
    // the render and pull the same amount extra at the end, so sample 0 of the
    // output lines up with sample 0 of the source.
    let latencySeconds = nodes.dropFirst().reduce(0.0) { acc, node in
      acc + ((node as? AVAudioUnit)?.auAudioUnit.latency ?? 0)
    }
    var framesToSkip = AVAudioFrameCount((latencySeconds * format.sampleRate).rounded())

    // Total frames = stretched source length + effect tail + latency we skip.
    let sourceFrames = Double(inputFile.length) / rate
    let totalFrames = AVAudioFramePosition(
      sourceFrames + tailSeconds * format.sampleRate + Double(framesToSkip))

    // A non-success, non-error status does not advance manualRenderingSampleTime,
    // so an unbounded `continue` would spin a core forever and leave the JS
    // promise (and the Effects sheet's busy state) hanging. Bound it.
    var stalledRenders = 0
    let maxStalledRenders = 64

    while engine.manualRenderingSampleTime < totalFrames {
      let remaining = totalFrames - engine.manualRenderingSampleTime
      let framesToRender = min(buffer.frameCapacity, AVAudioFrameCount(remaining))
      let status = try engine.renderOffline(framesToRender, to: buffer)
      switch status {
      case .success:
        stalledRenders = 0
        try writeSkipping(buffer, to: outFile, skip: &framesToSkip)
      case .insufficientDataFromInputNode, .cannotDoInCurrentContext:
        stalledRenders += 1
        if stalledRenders > maxStalledRenders {
          throw NSError(
            domain: "AttoAudioEffects", code: 5,
            userInfo: [NSLocalizedDescriptionKey: "renderOffline stalled (\(status.rawValue))"])
        }
        continue
      case .error:
        throw NSError(
          domain: "AttoAudioEffects", code: 4,
          userInfo: [NSLocalizedDescriptionKey: "renderOffline reported an error"])
      @unknown default:
        stalledRenders += 1
        if stalledRenders > maxStalledRenders {
          throw NSError(
            domain: "AttoAudioEffects", code: 5,
            userInfo: [NSLocalizedDescriptionKey: "renderOffline stalled (unknown status)"])
        }
        continue
      }
    }

    player.stop()
    engine.stop()

    let attrs = try FileManager.default.attributesOfItem(atPath: outputURL.path)
    let outputBytes = (attrs[.size] as? NSNumber)?.intValue ?? 0
    return [
      "outputPath": outputURL.absoluteString,
      "outputBytes": outputBytes,
      "durationMs": Int(Double(totalFrames) / format.sampleRate * 1000),
      "sampleRate": Int(format.sampleRate),
      "channels": Int(format.channelCount),
      "applied": applied,
      "renderMs": Int(Date().timeIntervalSince(started) * 1000),
    ]
  }

  // MARK: - helpers

  /**
   * Write `buffer` to `file`, dropping the first `skip` frames (latency
   * compensation). `skip` is decremented as frames are consumed. Falls back to
   * writing the whole buffer when the format has no float channel data.
   */
  private static func writeSkipping(
    _ buffer: AVAudioPCMBuffer, to file: AVAudioFile, skip: inout AVAudioFrameCount
  ) throws {
    if skip == 0 {
      try file.write(from: buffer)
      return
    }
    if buffer.frameLength <= skip {
      skip -= buffer.frameLength
      return
    }
    guard let src = buffer.floatChannelData,
      let trimmed = AVAudioPCMBuffer(
        pcmFormat: buffer.format, frameCapacity: buffer.frameLength - skip),
      let dst = trimmed.floatChannelData
    else {
      skip = 0
      try file.write(from: buffer)
      return
    }
    let keep = Int(buffer.frameLength - skip)
    let offset = Int(skip)
    for ch in 0..<Int(buffer.format.channelCount) {
      dst[ch].update(from: src[ch] + offset, count: keep)
    }
    trimmed.frameLength = AVAudioFrameCount(keep)
    skip = 0
    try file.write(from: trimmed)
  }

  private static func number(_ v: Any?) -> Double? {
    if let d = v as? Double { return d }
    if let i = v as? Int { return Double(i) }
    if let n = v as? NSNumber { return n.doubleValue }
    return nil
  }

  private static func clamp(_ v: Double, _ lo: Double, _ hi: Double) -> Double {
    return min(max(v, lo), hi)
  }

  private static func reverbPreset(_ name: String?) -> AVAudioUnitReverbPreset {
    switch name {
    case "smallRoom": return .smallRoom
    case "mediumRoom": return .mediumRoom
    case "largeRoom": return .largeRoom
    case "largeHall": return .largeHall
    case "plate": return .plate
    case "cathedral": return .cathedral
    default: return .mediumHall
    }
  }
}
