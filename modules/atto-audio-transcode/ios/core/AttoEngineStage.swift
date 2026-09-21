import AVFoundation
import Accelerate
import AudioToolbox
import Foundation

/**
 * Streams a range through a chain of Apple audio units on a private
 * AVAudioEngine in offline manual rendering mode. The chunks the processor
 * feeds in are queued behind an AVAudioSourceNode; every renderOffline call
 * pulls exactly what the chain asks for from that queue, so the engine never
 * touches the audio hardware or AVAudioSession, and memory is bounded by the
 * small queue rather than the range.
 *
 * Latency compensation works like AttoAudioEffectsRenderer: the summed
 * algorithmic latency of the units is skipped at the start and rendered as
 * extra frames at the end, so the output lines up sample for sample with the
 * range and is cut to exactly `expectedInputFrames / rate` frames. Effect
 * tails past the end of the range are dropped on purpose: a range effect
 * must not change the length of the clip.
 */
final class AttoEngineStage: AttoRangeStage {
  typealias ChainBuilder = (_ engine: AVAudioEngine, _ format: AVAudioFormat) throws -> [AVAudioNode]

  static let blockFrames: AVAudioFrameCount = 4096

  private let engine = AVAudioEngine()
  private let format: AVAudioFormat
  private let channels: Int
  private let renderBuffer: AVAudioPCMBuffer
  private let rate: Double
  private let targetOutputFrames: Int64
  private var framesToSkip: Int
  private var produced: Int64 = 0
  private var queue: [Float] = []
  private var queueHead = 0
  private var source: AVAudioSourceNode?
  private var finished = false

  /// Frames the queue must hold before a block is rendered mid stream: enough
  /// for the largest pull any unit makes at this rate, with head room, so the
  /// source never runs dry in the middle of the range.
  private var renderThreshold: Int {
    return Int(Double(AttoEngineStage.blockFrames) * rate * 4) + 8192
  }

  private var queued: Int { queue.count - queueHead }

  /**
   * `stereo` runs the chain on two channels (the mono range is duplicated on
   * the way in and averaged on the way out): AVAudioUnitReverb refuses a mono
   * bus on some platforms and its presets are stereo designs anyway.
   */
  init(
    sampleRate: Double, expectedInputFrames: Int64, rate: Double = 1, stereo: Bool = false,
    build: ChainBuilder
  ) throws {
    let channels = stereo ? 2 : 1
    guard
      let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: sampleRate,
        channels: AVAudioChannelCount(channels), interleaved: false),
      let renderBuffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: AttoEngineStage.blockFrames)
    else {
      throw AttoProcessError(AttoProcessError.generic, "Could not create the engine format")
    }
    self.format = format
    self.channels = channels
    self.renderBuffer = renderBuffer
    self.rate = rate
    targetOutputFrames = Int64((Double(expectedInputFrames) / rate).rounded())
    framesToSkip = 0

    let source = AVAudioSourceNode(format: format) { [weak self] _, _, frameCount, audioBufferList -> OSStatus in
      let buffers = UnsafeMutableAudioBufferListPointer(audioBufferList)
      let n = Int(frameCount)
      for buffer in buffers {
        guard let dst = buffer.mData?.assumingMemoryBound(to: Float.self) else { continue }
        guard let self else {
          dst.update(repeating: 0, count: n)
          continue
        }
        let take = min(n, self.queued)
        if take > 0 {
          self.queue.withUnsafeBufferPointer { q in
            dst.update(from: q.baseAddress! + self.queueHead, count: take)
          }
        }
        if take < n {
          (dst + take).update(repeating: 0, count: n - take)
        }
      }
      if let self {
        self.queueHead += min(n, self.queued)
      }
      return noErr
    }
    self.source = source
    engine.attach(source)

    let effects = try build(engine, format)
    var nodes: [AVAudioNode] = [source]
    nodes.append(contentsOf: effects)
    for i in 0..<(nodes.count - 1) {
      engine.connect(nodes[i], to: nodes[i + 1], format: format)
    }
    engine.connect(nodes[nodes.count - 1], to: engine.mainMixerNode, format: format)

    try engine.enableManualRenderingMode(.offline, format: format, maximumFrameCount: AttoEngineStage.blockFrames)
    try engine.start()

    let latencySeconds = effects.reduce(0.0) { acc, node in
      acc + ((node as? AVAudioUnit)?.auAudioUnit.latency ?? 0)
    }
    framesToSkip = Int((latencySeconds * sampleRate).rounded())
  }

  deinit {
    engine.stop()
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    // Compact the queue before appending so it never grows past a few blocks.
    if queueHead > 0 {
      queue.removeFirst(queueHead)
      queueHead = 0
    }
    queue.append(contentsOf: input)
    var out: [Float] = []
    while queued >= renderThreshold && produced < targetOutputFrames {
      try renderBlock(into: &out)
    }
    return out
  }

  func finish() throws -> [Float] {
    finished = true
    var out: [Float] = []
    // The source hands out zeros once the queue is empty, which is exactly the
    // padding needed to push the last latency frames through the chain.
    var guardIterations = 0
    while produced < targetOutputFrames {
      try renderBlock(into: &out)
      guardIterations += 1
      if guardIterations > 1_000_000 {
        throw AttoProcessError(AttoProcessError.generic, "Engine render did not converge")
      }
    }
    engine.stop()
    return out
  }

  private func renderBlock(into out: inout [Float]) throws {
    let remaining = targetOutputFrames - produced
    let wanted = AVAudioFrameCount(min(Int64(AttoEngineStage.blockFrames), remaining + Int64(framesToSkip)))
    var stalled = 0
    while true {
      let status = try engine.renderOffline(wanted, to: renderBuffer)
      switch status {
      case .success:
        appendRendered(into: &out)
        return
      case .insufficientDataFromInputNode, .cannotDoInCurrentContext:
        stalled += 1
        if stalled > 64 {
          throw AttoProcessError(AttoProcessError.generic, "renderOffline stalled (\(status.rawValue))")
        }
      case .error:
        throw AttoProcessError(AttoProcessError.generic, "renderOffline reported an error")
      @unknown default:
        stalled += 1
        if stalled > 64 {
          throw AttoProcessError(AttoProcessError.generic, "renderOffline stalled (unknown status)")
        }
      }
    }
  }

  private func appendRendered(into out: inout [Float]) {
    let got = Int(renderBuffer.frameLength)
    guard got > 0, let data = renderBuffer.floatChannelData else { return }
    var start = 0
    if framesToSkip > 0 {
      let skip = min(framesToSkip, got)
      framesToSkip -= skip
      start = skip
    }
    let available = got - start
    let keep = Int(min(Int64(available), targetOutputFrames - produced))
    guard keep > 0 else { return }
    if channels == 1 {
      out.append(contentsOf: UnsafeBufferPointer(start: data[0] + start, count: keep))
    } else {
      var mono = [Float](repeating: 0, count: keep)
      mono.withUnsafeMutableBufferPointer { m in
        for ch in 0..<channels {
          vDSP_vadd(m.baseAddress!, 1, data[ch] + start, 1, m.baseAddress!, 1, vDSP_Length(keep))
        }
        var scale = 1 / Float(channels)
        vDSP_vsmul(m.baseAddress!, 1, &scale, m.baseAddress!, 1, vDSP_Length(keep))
      }
      out.append(contentsOf: mono)
    }
    produced += Int64(keep)
  }

  // MARK: - chain builders

  /// Ten parametric bands, one octave wide, at the ISO centre frequencies.
  static func tenBandEq(gainsDb: [Double]) -> ChainBuilder {
    return { engine, _ in
      let unit = AVAudioUnitEQ(numberOfBands: 10)
      unit.globalGain = 0
      for (i, band) in unit.bands.enumerated() {
        band.filterType = .parametric
        band.frequency = Float(AttoRangeOp.tenBandFrequencies[i])
        band.bandwidth = 1.0
        band.gain = Float(gainsDb[i])
        band.bypass = false
      }
      engine.attach(unit)
      return [unit]
    }
  }

  /// The simple chain EQ (high pass, presence, low shelf), same design as
  /// AttoAudioEffectsRenderer so both doors sound identical.
  static func eqSimple(highPassHz: Double, presenceDb: Double, presenceHz: Double, lowShelfDb: Double)
    -> ChainBuilder
  {
    return { engine, _ in
      let unit = AVAudioUnitEQ(numberOfBands: 3)
      unit.globalGain = 0
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
      return [unit]
    }
  }

  /**
   * Apple's Dynamics Processor. Parameter addresses are the v2 AU ids:
   * 0 Threshold, 1 HeadRoom, 4 AttackTime, 5 ReleaseTime, 6 OverallGain.
   * The AU has no ratio knob; its head room is the span above the threshold
   * the output is squeezed into, so a ratio maps to the threshold's distance
   * to full scale divided by the ratio (ratio 1 leaves the span untouched).
   */
  static func compressor(thresholdDb: Double, ratio: Double, attackMs: Double, releaseMs: Double, makeupDb: Double)
    -> ChainBuilder
  {
    return { engine, _ in
      var desc = AudioComponentDescription()
      desc.componentType = kAudioUnitType_Effect
      desc.componentSubType = kAudioUnitSubType_DynamicsProcessor
      desc.componentManufacturer = kAudioUnitManufacturer_Apple
      let unit = AVAudioUnitEffect(audioComponentDescription: desc)
      let tree = unit.auAudioUnit.parameterTree
      let headRoomDb = AttoAudioCore.clamp(abs(thresholdDb) / max(ratio, 1), 0.1, 40)
      tree?.parameter(withAddress: 0)?.value = AUValue(thresholdDb)
      tree?.parameter(withAddress: 1)?.value = AUValue(headRoomDb)
      tree?.parameter(withAddress: 4)?.value = AUValue(attackMs / 1000)
      tree?.parameter(withAddress: 5)?.value = AUValue(releaseMs / 1000)
      tree?.parameter(withAddress: 6)?.value = AUValue(makeupDb)
      engine.attach(unit)
      return [unit]
    }
  }

  static func tapeDelay(delayMs: Double, feedback: Double, wetDry: Double, lowPassHz: Double) -> ChainBuilder {
    return { engine, _ in
      let unit = AVAudioUnitDelay()
      unit.delayTime = delayMs / 1000
      unit.feedback = Float(feedback)
      unit.wetDryMix = Float(wetDry)
      unit.lowPassCutoff = Float(lowPassHz)
      engine.attach(unit)
      return [unit]
    }
  }

  static func reverb(preset: String, wetDryMix: Double) -> ChainBuilder {
    return { engine, _ in
      let unit = AVAudioUnitReverb()
      unit.loadFactoryPreset(reverbPreset(preset))
      unit.wetDryMix = Float(wetDryMix)
      engine.attach(unit)
      return [unit]
    }
  }

  /// Pitch shift in cents at unchanged tempo, or tempo change at unchanged pitch.
  static func timePitch(cents: Double, rate: Double) -> ChainBuilder {
    return { engine, _ in
      let unit = AVAudioUnitTimePitch()
      unit.pitch = Float(cents)
      unit.rate = Float(rate)
      unit.overlap = 8
      engine.attach(unit)
      return [unit]
    }
  }

  static func reverbPreset(_ name: String?) -> AVAudioUnitReverbPreset {
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
