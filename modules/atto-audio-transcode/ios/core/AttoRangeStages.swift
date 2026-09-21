import Accelerate
import Foundation

/**
 * A streaming transform of the selected range. The processor feeds the range
 * to `process` one chunk at a time (in order, never more than one second of
 * frames per call) and calls `finish` once at the end; whatever the stage
 * returns is written straight to the output. Stages that need to look at the
 * whole range first (normalize, denoise) declare `prePasses` and receive a
 * scanner per pass, so the range is streamed again instead of being loaded.
 *
 * `at` is the chunk's offset from the start of the range, in frames, so
 * position dependent stages (fades, LFOs) stay exact across chunks.
 */
protocol AttoRangeStage: AnyObject {
  var prePasses: Int { get }
  func prepare(pass: Int, scan: (( _ chunk: inout [Float], _ at: Int64) throws -> Void) throws -> Void) throws
  func process(_ input: [Float], at: Int64) throws -> [Float]
  func finish() throws -> [Float]
}

extension AttoRangeStage {
  var prePasses: Int { 0 }
  func prepare(pass: Int, scan: (( _ chunk: inout [Float], _ at: Int64) throws -> Void) throws -> Void) throws {}
  func finish() throws -> [Float] { [] }
}

// MARK: - trivial stages

final class AttoIdentityStage: AttoRangeStage {
  func process(_ input: [Float], at: Int64) throws -> [Float] { input }
}

final class AttoSilenceStage: AttoRangeStage {
  func process(_ input: [Float], at: Int64) throws -> [Float] {
    return [Float](repeating: 0, count: input.count)
  }
}

final class AttoGainStage: AttoRangeStage {
  private let gain: Float
  init(linearGain: Float) { gain = linearGain }
  init(gainDb: Double) { gain = AttoAudioCore.dbToLinear(gainDb) }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = input
    AttoVec.scale(&out, by: gain)
    return out
  }
}

/**
 * Peak normalize: one pre pass measures the range's peak, the stream pass
 * applies the gain that lands it on `peakDb`. A silent range is left alone.
 */
final class AttoNormalizeStage: AttoRangeStage {
  private let target: Float
  private var peak: Float = 0
  private var gain: Float = 1

  init(peakDb: Double) { target = AttoAudioCore.dbToLinear(peakDb) }

  var prePasses: Int { 1 }

  func prepare(pass: Int, scan: ((inout [Float], Int64) throws -> Void) throws -> Void) throws {
    peak = 0
    try scan { chunk, _ in
      self.peak = max(self.peak, AttoVec.peak(chunk))
    }
    gain = peak > 1e-6 ? target / peak : 1
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = input
    AttoVec.scale(&out, by: gain)
    return out
  }
}

// MARK: - fades

final class AttoFadeStage: AttoRangeStage {
  private let fadeIn: Bool
  private let curve: AttoRangeOp.FadeCurve
  private let rangeFrames: Double

  /// `rangeFrames` is the LOGICAL range length, so a preview of the first
  /// seconds of a long fade renders the same slope the full render will.
  init(fadeIn: Bool, curve: AttoRangeOp.FadeCurve, rangeFrames: Int64) {
    self.fadeIn = fadeIn
    self.curve = curve
    self.rangeFrames = Double(max(rangeFrames, 1))
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var ramp = [Float](repeating: 0, count: input.count)
    for i in 0..<input.count {
      var p = (Double(at) + Double(i)) / rangeFrames
      p = AttoAudioCore.clamp(p, 0, 1)
      if !fadeIn { p = 1 - p }
      switch curve {
      case .linear:
        ramp[i] = Float(p)
      case .log:
        // Logarithmic taper: fast at first, gentle near full level.
        ramp[i] = Float(log10(1 + 9 * p))
      }
    }
    var out = input
    AttoVec.multiply(&out, by: ramp)
    return out
  }
}

// MARK: - filters

/// One biquad over the range (bass boost is a low shelf).
final class AttoBiquadStage: AttoRangeStage {
  private var filter: AttoBiquad
  init(filter: AttoBiquad) { self.filter = filter }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = input
    filter.process(&out)
    return out
  }
}

/**
 * Band limited compressor for sibilance: the band around `frequencyHz` is
 * split off with a band pass, its envelope is followed, and whenever it
 * exceeds `thresholdDb` that band alone is turned down by up to `amountDb`
 * before being summed back onto the rest of the signal.
 */
final class AttoDeEssStage: AttoRangeStage {
  private var band: AttoBiquad
  private let thresholdDb: Double
  private let amountDb: Double
  private let attack: Float
  private let release: Float
  private var envelope: Float = 0
  private var bandBuffer: [Float] = []

  init(sampleRate: Double, frequencyHz: Double, thresholdDb: Double, amountDb: Double) {
    band = AttoBiquad.bandPass(sampleRate: sampleRate, frequencyHz: frequencyHz, q: 2)
    self.thresholdDb = thresholdDb
    self.amountDb = amountDb
    attack = Float(exp(-1 / (0.001 * sampleRate)))
    release = Float(exp(-1 / (0.05 * sampleRate)))
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    band.process(input, into: &bandBuffer)
    var out = input
    let threshold = AttoAudioCore.dbToLinear(thresholdDb)
    let floorGain = AttoAudioCore.dbToLinear(-amountDb)
    for i in 0..<input.count {
      let level = abs(bandBuffer[i])
      envelope = level > envelope ? attack * envelope + (1 - attack) * level
                                  : release * envelope + (1 - release) * level
      var gain: Float = 1
      if envelope > threshold {
        // Everything above the threshold is pulled down, capped at amountDb.
        gain = max(threshold / envelope, floorGain)
      }
      out[i] = input[i] - bandBuffer[i] + bandBuffer[i] * gain
    }
    return out
  }
}

// MARK: - echo

/**
 * Explicit repeats: out[n] = x[n] + sum over k of decay^k times x[n minus k D].
 * Only the dry history is kept (repeats times D frames), so memory is bounded
 * by the parameters, never by the range length.
 */
final class AttoEchoStage: AttoRangeStage {
  private let delayFrames: Int
  private let decay: Float
  private let repeats: Int
  private var history: [Float]

  init(sampleRate: Double, delayMs: Double, decay: Double, repeats: Int) {
    delayFrames = max(1, Int(delayMs / 1000 * sampleRate))
    self.decay = Float(decay)
    self.repeats = repeats
    history = [Float](repeating: 0, count: delayFrames * repeats)
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    let n = input.count
    let h = history.count
    // Timeline of dry samples: history (oldest first) then this chunk.
    var timeline = history + input
    var out = input
    var gain = decay
    for k in 1...repeats {
      let offset = h - k * delayFrames
      timeline.withUnsafeBufferPointer { t in
        out.withUnsafeMutableBufferPointer { o in
          var g = gain
          vDSP_vsma(t.baseAddress! + offset, 1, &g, o.baseAddress!, 1, o.baseAddress!, 1, vDSP_Length(n))
        }
      }
      gain *= decay
    }
    // Keep the last h dry samples for the next chunk.
    if h > 0 {
      timeline.removeFirst(max(0, timeline.count - h))
      history = timeline
    }
    return out
  }
}

// MARK: - phaser

/**
 * Cascade of first order all pass stages whose corner is swept by a cosine
 * LFO, with feedback from the wet output, mixed half and half with the dry
 * signal. Same topology as the classic Audacity phaser, with normalised
 * parameters (depth 0..1, feedback 0..1).
 */
final class AttoPhaserStage: AttoRangeStage {
  private let lfoIncrement: Double
  private let depth: Double
  private let feedback: Float
  private var old: [Float]
  private var fbout: Float = 0
  private var phase: Double = 0
  private let lfoShape = 4.0
  private let lfoSkip = 32

  init(sampleRate: Double, rateHz: Double, depth: Double, feedback: Double, stages: Int) {
    lfoIncrement = 2 * Double.pi * rateHz / sampleRate * Double(lfoSkip)
    self.depth = depth
    self.feedback = Float(feedback)
    old = [Float](repeating: 0, count: stages)
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = input
    var gain: Float = 0
    let stages = old.count
    for i in 0..<input.count {
      if i % lfoSkip == 0 {
        var g = (1 + cos(phase)) / 2
        g = (exp(g * lfoShape) - 1) / (exp(lfoShape) - 1)
        gain = Float(1 - g * depth)
        phase += lfoIncrement
        if phase > 2 * Double.pi { phase -= 2 * Double.pi }
      }
      let x = input[i]
      var m = x + fbout * feedback
      for j in 0..<stages {
        let tmp = old[j]
        old[j] = gain * tmp + m
        m = tmp - gain * old[j]
      }
      fbout = m
      out[i] = 0.5 * (m + x)
    }
    return out
  }
}

// MARK: - wahwah

/**
 * Resonant band pass whose centre sweeps with a cosine LFO between roughly
 * 350 Hz and 3 kHz (depth scales the sweep), the sweep retuned every 32
 * samples, mixed half and half with the dry signal.
 */
final class AttoWahwahStage: AttoRangeStage {
  private let sampleRate: Double
  private let lfoIncrement: Double
  private let depth: Double
  private let resonance: Double
  private var filter = AttoBiquad()
  private var phase: Double = 0
  private let lfoSkip = 32
  private let lowHz = 350.0
  private let highHz = 3000.0

  init(sampleRate: Double, rateHz: Double, depth: Double, resonance: Double) {
    self.sampleRate = sampleRate
    lfoIncrement = 2 * Double.pi * rateHz / sampleRate * Double(lfoSkip)
    self.depth = depth
    self.resonance = resonance
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = input
    for i in 0..<input.count {
      if i % lfoSkip == 0 {
        let lfo = (1 - cos(phase)) / 2
        let sweep = lfo * depth
        let centre = lowHz * pow(highHz / lowHz, sweep)
        filter.setCoefficients(
          AttoBiquad.bandPass(sampleRate: sampleRate, frequencyHz: centre, q: resonance))
        phase += lfoIncrement
        if phase > 2 * Double.pi { phase -= 2 * Double.pi }
      }
      let wet = filter.tick(input[i]) * Float(resonance)
      out[i] = 0.5 * input[i] + 0.5 * wet
    }
    return out
  }
}

// MARK: - generators

/// Replaces the range with a sine tone.
final class AttoBleepStage: AttoRangeStage {
  private let increment: Double
  private let amplitude: Float
  private var phase: Double = 0

  init(sampleRate: Double, frequencyHz: Double, gainDb: Double) {
    increment = 2 * Double.pi * frequencyHz / sampleRate
    amplitude = AttoAudioCore.dbToLinear(gainDb)
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = [Float](repeating: 0, count: input.count)
    for i in 0..<out.count {
      out[i] = amplitude * Float(sin(phase))
      phase += increment
      if phase > 2 * Double.pi { phase -= 2 * Double.pi }
    }
    return out
  }
}

/// Replaces the range with white, pink (Paul Kellet filter) or brown noise.
final class AttoNoiseStage: AttoRangeStage {
  private let kind: AttoRangeOp.NoiseKind
  private let amplitude: Float
  private var b0: Float = 0, b1: Float = 0, b2: Float = 0, b3: Float = 0, b4: Float = 0, b5: Float = 0, b6: Float = 0
  private var brown: Float = 0
  private var rng = SystemRandomNumberGenerator()

  init(kind: AttoRangeOp.NoiseKind, amplitudeDb: Double) {
    self.kind = kind
    amplitude = AttoAudioCore.dbToLinear(amplitudeDb)
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out = [Float](repeating: 0, count: input.count)
    for i in 0..<out.count {
      let white = Float.random(in: -1...1, using: &rng)
      let sample: Float
      switch kind {
      case .white:
        sample = white
      case .pink:
        b0 = 0.99886 * b0 + white * 0.0555179
        b1 = 0.99332 * b1 + white * 0.0750759
        b2 = 0.96900 * b2 + white * 0.1538520
        b3 = 0.86650 * b3 + white * 0.3104856
        b4 = 0.55000 * b4 + white * 0.5329522
        b5 = -0.7616 * b5 - white * 0.0168980
        sample = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11
        b6 = white * 0.115926
      case .brown:
        brown = (brown + 0.02 * white) / 1.02
        sample = brown * 3.5
      }
      out[i] = AttoAudioCore.clamp(sample, -1, 1) * amplitude
    }
    return out
  }
}

// MARK: - silence remover

/**
 * Drops every stretch of samples under `thresholdDb` that lasts longer than
 * `minSilenceMs`, keeping `keepMs` of it at each edge so words do not butt
 * against each other. Memory is bounded: while a quiet run is still short
 * enough to be kept it is buffered whole, and once it is certain to be cut
 * only its first and last `keepMs` are retained.
 */
final class AttoSilenceRemoverStage: AttoRangeStage {
  private let threshold: Float
  private let minSilence: Int
  private let keep: Int
  private var pending: [Float] = []
  private var pendingCount = 0
  private var head: [Float] = []
  private var tail: [Float] = []
  private var dropping = false
  private(set) var removedFrames: Int64 = 0

  init(sampleRate: Double, thresholdDb: Double, minSilenceMs: Double, keepMs: Double) {
    threshold = AttoAudioCore.dbToLinear(thresholdDb)
    minSilence = max(1, Int(minSilenceMs / 1000 * sampleRate))
    // The two kept edges must fit inside the shortest run that gets cut.
    keep = AttoAudioCore.clamp(Int(keepMs / 1000 * sampleRate), 0, minSilence / 2)
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out: [Float] = []
    out.reserveCapacity(input.count)
    for x in input {
      if abs(x) < threshold {
        appendQuiet(x)
      } else {
        flushQuiet(into: &out)
        out.append(x)
      }
    }
    return out
  }

  func finish() throws -> [Float] {
    var out: [Float] = []
    flushQuiet(into: &out)
    return out
  }

  private func appendQuiet(_ x: Float) {
    pendingCount += 1
    if dropping {
      tail.append(x)
      if tail.count > keep { tail.removeFirst(tail.count - keep) }
      return
    }
    pending.append(x)
    if pending.count > minSilence {
      // Long enough to be cut: switch to edge only bookkeeping.
      dropping = true
      head = Array(pending.prefix(keep))
      tail = Array(pending.suffix(keep))
      pending.removeAll(keepingCapacity: true)
    }
  }

  private func flushQuiet(into out: inout [Float]) {
    if dropping {
      out.append(contentsOf: head)
      out.append(contentsOf: tail)
      removedFrames += Int64(pendingCount - head.count - tail.count)
      head.removeAll()
      tail.removeAll()
    } else {
      out.append(contentsOf: pending)
      pending.removeAll(keepingCapacity: true)
    }
    dropping = false
    pendingCount = 0
  }
}
