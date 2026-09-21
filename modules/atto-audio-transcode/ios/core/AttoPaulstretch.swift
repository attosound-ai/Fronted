import Accelerate
import Foundation

/**
 * The classic paulstretch algorithm (Nasca Octavian Paul): the input is
 * walked with a window that advances by half a window divided by the stretch
 * factor, each windowed block is transformed, its phases are randomised while
 * its magnitudes are kept, and the inverse transforms are overlap added with
 * a half window hop. The output is `factor` times longer with the spectral
 * colour of the input and none of its transients.
 *
 * Streaming: only the samples from the current window position onwards are
 * kept, so memory is one window plus one chunk whatever the range length.
 */
final class AttoPaulstretchStage: AttoRangeStage {
  private let fft: AttoFFT
  private let windowSize: Int
  private let half: Int
  private let window: [Float]
  private let olaNorm: [Float]
  private let displace: Double
  private let expectedOutputFrames: Int64

  private var input: [Float] = []
  private var inputStart: Int64 = 0
  private var inputEnd: Int64 = 0
  private var startPos: Double = 0
  private var oldTail: [Float]
  private var produced: Int64 = 0
  private var block: [Float]
  private var re: [Float] = []
  private var im: [Float] = []
  private var synth: [Float] = []
  private var rng = SystemRandomNumberGenerator()

  init(sampleRate: Double, factor: Double, windowSec: Double, expectedInputFrames: Int64) {
    windowSize = AttoFFT.sizeFor(frames: max(16, Int(windowSec * sampleRate)))
    half = windowSize / 2
    fft = AttoFFT(size: windowSize)
    var w = [Float](repeating: 0, count: windowSize)
    for i in 0..<windowSize {
      let x = -1.0 + 2.0 * Double(i) / Double(windowSize - 1)
      w[i] = Float(pow(1 - x * x, 1.25))
    }
    window = w
    // Windowed twice (analysis and synthesis) at a half window hop: divide
    // by the summed square so a steady tone keeps its level.
    var norm = [Float](repeating: 0, count: half)
    for i in 0..<half {
      norm[i] = max(w[i] * w[i] + w[i + half] * w[i + half], 1e-3)
    }
    olaNorm = norm
    displace = Double(half) / factor
    expectedOutputFrames = Int64((Double(expectedInputFrames) * factor).rounded())
    oldTail = [Float](repeating: 0, count: half)
    block = [Float](repeating: 0, count: windowSize)
  }

  func process(_ chunk: [Float], at: Int64) throws -> [Float] {
    input.append(contentsOf: chunk)
    inputEnd += Int64(chunk.count)
    var out: [Float] = []
    while Int64(startPos) + Int64(windowSize) <= inputEnd && produced < expectedOutputFrames {
      try renderWindow(into: &out, padded: false)
    }
    trimConsumedInput()
    return out
  }

  func finish() throws -> [Float] {
    var out: [Float] = []
    // Zero pad so the last windows still cover the final input samples.
    input.append(contentsOf: [Float](repeating: 0, count: windowSize))
    while Int64(startPos) < inputEnd && produced < expectedOutputFrames {
      try renderWindow(into: &out, padded: true)
    }
    if produced < expectedOutputFrames {
      out.append(contentsOf: [Float](repeating: 0, count: Int(expectedOutputFrames - produced)))
      produced = expectedOutputFrames
    }
    return out
  }

  private func renderWindow(into out: inout [Float], padded: Bool) throws {
    let offset = Int(Int64(startPos) - inputStart)
    guard offset >= 0, offset + windowSize <= input.count else {
      throw AttoProcessError(AttoProcessError.generic, "paulstretch window out of buffer")
    }
    input.withUnsafeBufferPointer { src in
      window.withUnsafeBufferPointer { w in
        block.withUnsafeMutableBufferPointer { dst in
          vDSP_vmul(src.baseAddress! + offset, 1, w.baseAddress!, 1, dst.baseAddress!, 1, vDSP_Length(windowSize))
        }
      }
    }
    fft.forward(block, real: &re, imag: &im)
    // Keep magnitudes, randomise phases. Bin 0 packs DC (re) and Nyquist (im),
    // both real valued, so they keep their magnitude and a random sign.
    let dc = abs(re[0])
    let nyquist = abs(im[0])
    for k in 1..<fft.halfSize {
      let mag = hypotf(re[k], im[k])
      let phase = Float.random(in: 0..<(2 * Float.pi), using: &rng)
      re[k] = mag * cosf(phase)
      im[k] = mag * sinf(phase)
    }
    re[0] = Bool.random(using: &rng) ? dc : -dc
    im[0] = Bool.random(using: &rng) ? nyquist : -nyquist
    fft.inverse(real: re, imag: im, output: &synth)
    AttoVec.multiply(&synth, by: window)

    var frame = [Float](repeating: 0, count: half)
    for i in 0..<half {
      frame[i] = (synth[i] + oldTail[i]) / olaNorm[i]
    }
    oldTail.withUnsafeMutableBufferPointer { tail in
      synth.withUnsafeBufferPointer { s in
        tail.baseAddress!.update(from: s.baseAddress! + half, count: half)
      }
    }
    let keep = Int(min(Int64(half), expectedOutputFrames - produced))
    if keep > 0 {
      out.append(contentsOf: frame.prefix(keep))
      produced += Int64(keep)
    }
    startPos += displace
  }

  private func trimConsumedInput() {
    let consumed = Int(Int64(startPos) - inputStart)
    guard consumed > 0, consumed <= input.count else { return }
    input.removeFirst(consumed)
    inputStart += Int64(consumed)
  }
}
