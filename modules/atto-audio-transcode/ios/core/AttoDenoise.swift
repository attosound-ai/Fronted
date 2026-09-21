import Accelerate
import Foundation

/**
 * Back end contract for the denoise op. The first implementation is a
 * spectral gate; a model based back end can replace it later by conforming
 * to the same protocol and being returned from `AttoDenoise.makeStage`.
 */
protocol AttoDenoiseBackend: AttoRangeStage {}

enum AttoDenoise {
  /// Picks the back end. Only the spectral gate exists today.
  static func makeStage(sampleRate: Double, strengthDb: Double, expectedInputFrames: Int64) -> AttoDenoiseBackend {
    return AttoSpectralGateDenoiser(
      sampleRate: sampleRate, strengthDb: strengthDb, expectedInputFrames: expectedInputFrames)
  }
}

/**
 * Spectral gating in three passes over the range:
 *   pass 0  energy of every analysis frame
 *   pass 1  mean magnitude spectrum of the quietest ten percent of frames,
 *           which is the noise print
 *   stream  short time Fourier transform, per bin gain of
 *           max(floor, 1 minus alpha times noise over magnitude) with over
 *           subtraction alpha 1.5 and a floor of minus strengthDb, smoothed
 *           over neighbouring bins and released slowly over time, then
 *           weighted overlap add back to the time domain.
 * The frame grid is identical in every pass. Output length equals the input.
 */
final class AttoSpectralGateDenoiser: AttoDenoiseBackend {
  private let fft: AttoFFT
  private let frameSize = 2048
  private let hop = 512
  private let window: [Float]
  private let olaNorm: Float
  private let floorGain: Float
  private let alpha: Float = 1.5
  private let expectedInputFrames: Int64

  private var energies: [Float] = []
  private var noise: [Float]
  private var previousGain: [Float]

  private var buffer: [Float] = []
  private var bufferStart: Int64 = 0
  private var nextFrameStart: Int64 = 0
  private var framesSeen: Int64 = 0
  private var ola: [Float] = []
  private var olaStart: Int64 = 0
  private var emitted: Int64 = 0
  private var block: [Float]
  private var re: [Float] = []
  private var im: [Float] = []
  private var synth: [Float] = []

  init(sampleRate: Double, strengthDb: Double, expectedInputFrames: Int64) {
    fft = AttoFFT(size: frameSize)
    let hann = AttoFFT.hann(frameSize)
    window = hann.map { sqrt($0) }
    // Analysis times synthesis window is a Hann; at a quarter hop it sums to 2.
    olaNorm = Float(frameSize) / Float(hop) * 0.5
    floorGain = AttoAudioCore.dbToLinear(-strengthDb)
    self.expectedInputFrames = expectedInputFrames
    noise = [Float](repeating: 0, count: frameSize / 2)
    previousGain = [Float](repeating: 1, count: frameSize / 2)
    block = [Float](repeating: 0, count: frameSize)
    resetFraming()
  }

  var prePasses: Int { 2 }

  func prepare(pass: Int, scan: ((inout [Float], Int64) throws -> Void) throws -> Void) throws {
    resetFraming()
    if pass == 0 {
      energies.removeAll(keepingCapacity: true)
      try scan { chunk, _ in
        self.feed(chunk) { start, block in
          if start >= 0 { self.energies.append(AttoVec.rms(block)) }
        }
      }
      // Frames covering the padded tail are not part of the statistics.
      return
    }
    guard !energies.isEmpty else { return }
    let sorted = energies.sorted()
    let cutoff = sorted[min(sorted.count - 1, sorted.count / 10)]
    var accum = [Float](repeating: 0, count: fft.halfSize)
    var count = 0
    var index = 0
    try scan { chunk, _ in
      self.feed(chunk) { start, block in
        guard start >= 0 else { return }
        defer { index += 1 }
        guard index < self.energies.count, self.energies[index] <= cutoff else { return }
        self.fft.forward(block, real: &self.re, imag: &self.im)
        for k in 0..<self.fft.halfSize {
          accum[k] += hypotf(self.re[k], self.im[k])
        }
        count += 1
      }
    }
    if count > 0 {
      noise = accum.map { $0 / Float(count) }
    }
    resetFraming()
  }

  func process(_ input: [Float], at: Int64) throws -> [Float] {
    var out: [Float] = []
    feed(input) { start, block in
      self.gateFrame(start: start, block: block, into: &out)
    }
    return out
  }

  func finish() throws -> [Float] {
    var out: [Float] = []
    feed([Float](repeating: 0, count: frameSize)) { start, block in
      self.gateFrame(start: start, block: block, into: &out)
    }
    // Emit whatever is still in the overlap buffer, then trim to length.
    let pending = Int(min(Int64(ola.count), expectedInputFrames - emitted))
    if pending > 0 {
      out.append(contentsOf: ola.prefix(pending).map { $0 / olaNorm })
      emitted += Int64(pending)
    }
    if emitted < expectedInputFrames {
      out.append(contentsOf: [Float](repeating: 0, count: Int(expectedInputFrames - emitted)))
      emitted = expectedInputFrames
    }
    return out
  }

  // MARK: - framing

  /// Frames start at minus (frameSize minus hop) so the first real sample is
  /// covered by a full set of overlapping windows.
  private func resetFraming() {
    let lead = frameSize - hop
    buffer = [Float](repeating: 0, count: lead)
    bufferStart = -Int64(lead)
    nextFrameStart = -Int64(lead)
    framesSeen = 0
    ola = []
    olaStart = 0
    emitted = 0
    previousGain = [Float](repeating: 1, count: fft.halfSize)
  }

  /// Appends `chunk` and hands every complete windowed frame to `body`.
  private func feed(_ chunk: [Float], _ body: (_ start: Int64, _ block: [Float]) -> Void) {
    buffer.append(contentsOf: chunk)
    while nextFrameStart + Int64(frameSize) <= bufferStart + Int64(buffer.count) {
      let offset = Int(nextFrameStart - bufferStart)
      buffer.withUnsafeBufferPointer { src in
        window.withUnsafeBufferPointer { w in
          block.withUnsafeMutableBufferPointer { dst in
            vDSP_vmul(src.baseAddress! + offset, 1, w.baseAddress!, 1, dst.baseAddress!, 1, vDSP_Length(frameSize))
          }
        }
      }
      body(nextFrameStart, block)
      nextFrameStart += Int64(hop)
      framesSeen += 1
    }
    let consumed = Int(nextFrameStart - bufferStart)
    if consumed > 0 && consumed <= buffer.count {
      buffer.removeFirst(consumed)
      bufferStart += Int64(consumed)
    }
  }

  private func gateFrame(start: Int64, block: [Float], into out: inout [Float]) {
    fft.forward(block, real: &re, imag: &im)
    let bins = fft.halfSize
    var gain = [Float](repeating: 1, count: bins)
    for k in 0..<bins {
      let mag = hypotf(re[k], im[k])
      var g: Float = floorGain
      if mag > 0 {
        g = max(floorGain, 1 - alpha * noise[k] / mag)
      }
      gain[k] = g
    }
    // Smooth across three bins, then release slowly in time.
    var smooth = gain
    for k in 1..<(bins - 1) {
      smooth[k] = (gain[k - 1] + gain[k] + gain[k + 1]) / 3
    }
    for k in 0..<bins {
      smooth[k] = max(smooth[k], previousGain[k] * 0.5)
      previousGain[k] = smooth[k]
      re[k] *= smooth[k]
      im[k] *= smooth[k]
    }
    fft.inverse(real: re, imag: im, output: &synth)
    AttoVec.multiply(&synth, by: window)

    // Overlap add at `start`, then emit the samples no later frame touches.
    if ola.isEmpty {
      olaStart = start
    }
    let offset = Int(start - olaStart)
    let needed = offset + frameSize
    if ola.count < needed {
      ola.append(contentsOf: [Float](repeating: 0, count: needed - ola.count))
    }
    ola.withUnsafeMutableBufferPointer { o in
      synth.withUnsafeBufferPointer { s in
        vDSP_vadd(o.baseAddress! + offset, 1, s.baseAddress!, 1, o.baseAddress! + offset, 1, vDSP_Length(frameSize))
      }
    }
    // Samples before start + hop are final.
    let finalCount = Int(start + Int64(hop) - olaStart)
    guard finalCount > 0 else { return }
    let done = Array(ola.prefix(finalCount))
    ola.removeFirst(finalCount)
    olaStart += Int64(finalCount)
    for (i, v) in done.enumerated() {
      let absolute = olaStart - Int64(finalCount) + Int64(i)
      if absolute < 0 { continue }
      if emitted >= expectedInputFrames { break }
      out.append(v / olaNorm)
      emitted += 1
    }
  }
}
