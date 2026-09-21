import Accelerate
import Foundation

/**
 * Direct form I biquad with the RBJ cookbook designs the custom stages need.
 * Coefficients are normalised so a0 is 1. One instance filters one channel;
 * `process` runs in place over a chunk and keeps its history across calls,
 * so streaming a range chunk by chunk is bit identical to filtering it whole.
 */
struct AttoBiquad {
  var b0: Float = 1, b1: Float = 0, b2: Float = 0, a1: Float = 0, a2: Float = 0
  private var x1: Float = 0, x2: Float = 0, y1: Float = 0, y2: Float = 0

  init() {}

  /// Low shelf: `gainDb` below `frequencyHz`, slope 1.
  static func lowShelf(sampleRate: Double, frequencyHz: Double, gainDb: Double) -> AttoBiquad {
    let A = pow(10.0, gainDb / 40.0)
    let w0 = 2 * Double.pi * frequencyHz / sampleRate
    let cs = cos(w0), sn = sin(w0)
    // Shelf slope 1: the cookbook alpha collapses to sn times sqrt(2) over 2.
    let alpha = sn / 2 * sqrt(2.0)
    let twoSqrtAAlpha = 2 * sqrt(A) * alpha
    let b0 = A * ((A + 1) - (A - 1) * cs + twoSqrtAAlpha)
    let b1 = 2 * A * ((A - 1) - (A + 1) * cs)
    let b2 = A * ((A + 1) - (A - 1) * cs - twoSqrtAAlpha)
    let a0 = (A + 1) + (A - 1) * cs + twoSqrtAAlpha
    let a1 = -2 * ((A - 1) + (A + 1) * cs)
    let a2 = (A + 1) + (A - 1) * cs - twoSqrtAAlpha
    return AttoBiquad(b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0)
  }

  /// Band pass with constant 0 dB peak gain at `frequencyHz`.
  static func bandPass(sampleRate: Double, frequencyHz: Double, q: Double) -> AttoBiquad {
    let w0 = 2 * Double.pi * frequencyHz / sampleRate
    let cs = cos(w0), sn = sin(w0)
    let alpha = sn / (2 * q)
    let a0 = 1 + alpha
    return AttoBiquad(
      b0: alpha / a0, b1: 0, b2: -alpha / a0, a1: -2 * cs / a0, a2: (1 - alpha) / a0)
  }

  init(b0: Double, b1: Double, b2: Double, a1: Double, a2: Double) {
    self.b0 = Float(b0)
    self.b1 = Float(b1)
    self.b2 = Float(b2)
    self.a1 = Float(a1)
    self.a2 = Float(a2)
  }

  /// Retunes the coefficients, keeping the filter history (for LFO sweeps).
  mutating func setCoefficients(_ other: AttoBiquad) {
    b0 = other.b0
    b1 = other.b1
    b2 = other.b2
    a1 = other.a1
    a2 = other.a2
  }

  @inline(__always)
  mutating func tick(_ x: Float) -> Float {
    let y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
    x2 = x1
    x1 = x
    y2 = y1
    y1 = y
    return y
  }

  mutating func process(_ samples: inout [Float]) {
    for i in 0..<samples.count {
      samples[i] = tick(samples[i])
    }
  }

  /// Filters `input` into `output` (same length), keeping `input` intact.
  mutating func process(_ input: [Float], into output: inout [Float]) {
    if output.count != input.count { output = [Float](repeating: 0, count: input.count) }
    for i in 0..<input.count {
      output[i] = tick(input[i])
    }
  }
}

/**
 * Real FFT of one power of two size on top of vDSP_fft_zrip. Handles the
 * packed layout (DC in re[0], Nyquist in im[0]) and the scaling so that
 * forward followed by inverse returns the input unchanged.
 */
final class AttoFFT {
  let size: Int
  let halfSize: Int
  private let log2n: vDSP_Length
  private let setup: FFTSetup
  private var re: [Float]
  private var im: [Float]

  /// `size` must be a power of two of at least 16.
  init(size: Int) {
    precondition(size >= 16 && (size & (size - 1)) == 0, "FFT size must be a power of two")
    self.size = size
    halfSize = size / 2
    log2n = vDSP_Length(log2(Double(size)).rounded())
    setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2))!
    re = [Float](repeating: 0, count: halfSize)
    im = [Float](repeating: 0, count: halfSize)
  }

  deinit {
    vDSP_destroy_fftsetup(setup)
  }

  /// Rounds `frames` up to the next power of two (at least 16).
  static func sizeFor(frames: Int) -> Int {
    var n = 16
    while n < frames { n *= 2 }
    return n
  }

  /**
   * Forward transform of `input` (exactly `size` samples) into split complex
   * halves: `real[0]` is DC, `imag[0]` carries the Nyquist bin, bins 1 up to
   * halfSize minus 1 are the usual complex values. Scaled so magnitudes match
   * the mathematical DFT.
   */
  func forward(_ input: [Float], real: inout [Float], imag: inout [Float]) {
    precondition(input.count == size)
    if real.count != halfSize { real = [Float](repeating: 0, count: halfSize) }
    if imag.count != halfSize { imag = [Float](repeating: 0, count: halfSize) }
    input.withUnsafeBufferPointer { inPtr in
      real.withUnsafeMutableBufferPointer { rePtr in
        imag.withUnsafeMutableBufferPointer { imPtr in
          var split = DSPSplitComplex(realp: rePtr.baseAddress!, imagp: imPtr.baseAddress!)
          inPtr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfSize) { complexIn in
            vDSP_ctoz(complexIn, 2, &split, 1, vDSP_Length(halfSize))
          }
          vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_FORWARD))
          var half: Float = 0.5
          vDSP_vsmul(rePtr.baseAddress!, 1, &half, rePtr.baseAddress!, 1, vDSP_Length(halfSize))
          vDSP_vsmul(imPtr.baseAddress!, 1, &half, imPtr.baseAddress!, 1, vDSP_Length(halfSize))
        }
      }
    }
  }

  /// Inverse of `forward`: rebuilds `size` real samples into `output`.
  func inverse(real: [Float], imag: [Float], output: inout [Float]) {
    precondition(real.count == halfSize && imag.count == halfSize)
    if output.count != size { output = [Float](repeating: 0, count: size) }
    re = real
    im = imag
    re.withUnsafeMutableBufferPointer { rePtr in
      im.withUnsafeMutableBufferPointer { imPtr in
        output.withUnsafeMutableBufferPointer { outPtr in
          var split = DSPSplitComplex(realp: rePtr.baseAddress!, imagp: imPtr.baseAddress!)
          vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(FFT_INVERSE))
          outPtr.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfSize) { complexOut in
            vDSP_ztoc(&split, 1, complexOut, 2, vDSP_Length(halfSize))
          }
          var scale = 1 / Float(size)
          vDSP_vsmul(outPtr.baseAddress!, 1, &scale, outPtr.baseAddress!, 1, vDSP_Length(size))
        }
      }
    }
  }

  /// Periodic Hann window of `size` samples.
  static func hann(_ size: Int) -> [Float] {
    var w = [Float](repeating: 0, count: size)
    for i in 0..<size {
      w[i] = Float(0.5 - 0.5 * cos(2 * Double.pi * Double(i) / Double(size)))
    }
    return w
  }
}

/**
 * Small vDSP helpers used by several stages.
 */
enum AttoVec {
  static func peak(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    var value: Float = 0
    samples.withUnsafeBufferPointer { vDSP_maxmgv($0.baseAddress!, 1, &value, vDSP_Length($0.count)) }
    return value
  }

  static func peak(_ samples: UnsafeBufferPointer<Float>) -> Float {
    guard let base = samples.baseAddress, samples.count > 0 else { return 0 }
    var value: Float = 0
    vDSP_maxmgv(base, 1, &value, vDSP_Length(samples.count))
    return value
  }

  static func rms(_ samples: [Float]) -> Float {
    guard !samples.isEmpty else { return 0 }
    var value: Float = 0
    samples.withUnsafeBufferPointer { vDSP_rmsqv($0.baseAddress!, 1, &value, vDSP_Length($0.count)) }
    return value
  }

  static func scale(_ samples: inout [Float], by factor: Float) {
    guard !samples.isEmpty else { return }
    var f = factor
    samples.withUnsafeMutableBufferPointer {
      vDSP_vsmul($0.baseAddress!, 1, &f, $0.baseAddress!, 1, vDSP_Length($0.count))
    }
  }

  /// samples[i] *= ramp[i]
  static func multiply(_ samples: inout [Float], by ramp: [Float]) {
    let n = min(samples.count, ramp.count)
    guard n > 0 else { return }
    samples.withUnsafeMutableBufferPointer { s in
      ramp.withUnsafeBufferPointer { r in
        vDSP_vmul(s.baseAddress!, 1, r.baseAddress!, 1, s.baseAddress!, 1, vDSP_Length(n))
      }
    }
  }

  /// dst[i] += src[i] * factor
  static func addScaled(_ src: [Float], times factor: Float, into dst: inout [Float]) {
    let n = min(src.count, dst.count)
    guard n > 0 else { return }
    var f = factor
    src.withUnsafeBufferPointer { s in
      dst.withUnsafeMutableBufferPointer { d in
        vDSP_vsma(s.baseAddress!, 1, &f, d.baseAddress!, 1, d.baseAddress!, 1, vDSP_Length(n))
      }
    }
  }

  static func reverse(_ samples: inout [Float]) {
    guard samples.count > 1 else { return }
    samples.withUnsafeMutableBufferPointer { vDSP_vrvrs($0.baseAddress!, 1, vDSP_Length($0.count)) }
  }

  static func clamp(_ samples: inout [Float]) {
    guard !samples.isEmpty else { return }
    var lo: Float = -1
    var hi: Float = 1
    samples.withUnsafeMutableBufferPointer {
      vDSP_vclip($0.baseAddress!, 1, &lo, &hi, $0.baseAddress!, 1, vDSP_Length($0.count))
    }
  }
}
