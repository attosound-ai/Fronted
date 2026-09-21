import AVFoundation
import Accelerate
import Foundation

/**
 * Chunked, seekable reader that presents ANY audio file AVFoundation can
 * decode (canonical CAF, 8 kHz WAV, AAC m4a, ...) as float32 frames at one
 * output rate. Decoding is done by AVAudioFile, resampling by AVAudioConverter
 * when the file rate differs from the requested rate, and the downmix to mono
 * is done here with vDSP so it is deterministic.
 *
 * Positions are always expressed in OUTPUT frames (at `outputRate`), so the
 * range logic upstream never has to know the file's own rate. For a resampled
 * file `length` is an estimate (the converter may produce a frame or two more
 * or less), which is why loops read until the reader returns zero frames.
 */
final class AttoSourceReader {
  let url: URL
  let outputRate: Double
  let sourceRate: Double
  let channelCount: Int
  /// Frame count of the file at the OUTPUT rate (exact when no resampling).
  let length: Int64

  private let file: AVAudioFile
  private let converter: AVAudioConverter?
  private let outputFormat: AVAudioFormat
  private var sourceBuffer: AVAudioPCMBuffer
  private var outputBuffer: AVAudioPCMBuffer?
  private var sourceExhausted = false
  private var readError: Error?
  private var outputPosition: Int64 = 0

  /// Open `url`; `outputRate` nil keeps the file's own rate (used by getPeaks,
  /// where resampling would only cost time).
  init(url: URL, outputRate requestedRate: Double?) throws {
    self.url = url
    do {
      file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
    } catch {
      throw AttoProcessError(
        AttoProcessError.input, "Cannot open \(url.lastPathComponent): \(error.localizedDescription)")
    }
    let source = file.processingFormat
    sourceRate = source.sampleRate
    channelCount = Int(source.channelCount)
    outputRate = requestedRate ?? source.sampleRate
    guard channelCount >= 1, sourceRate > 0 else {
      throw AttoProcessError(AttoProcessError.input, "\(url.lastPathComponent) has no usable audio format")
    }
    guard
      let format = AVAudioFormat(
        commonFormat: .pcmFormatFloat32, sampleRate: outputRate,
        channels: AVAudioChannelCount(channelCount), interleaved: false),
      let sourceBuffer = AVAudioPCMBuffer(pcmFormat: source, frameCapacity: 16384)
    else {
      throw AttoProcessError(AttoProcessError.input, "Could not allocate read buffers")
    }
    outputFormat = format
    self.sourceBuffer = sourceBuffer
    if sourceRate == outputRate {
      converter = nil
      length = file.length
    } else {
      guard let converter = AVAudioConverter(from: source, to: format) else {
        throw AttoProcessError(AttoProcessError.input, "No converter from \(Int(sourceRate)) Hz to \(Int(outputRate)) Hz")
      }
      converter.sampleRateConverterQuality = AVAudioQuality.max.rawValue
      self.converter = converter
      length = Int64((Double(file.length) * outputRate / sourceRate).rounded())
    }
  }

  var durationSeconds: Double { Double(length) / outputRate }

  /// Current read position in output frames.
  var position: Int64 { outputPosition }

  /// Moves the read head to an output frame. Resampled files map the frame
  /// back to the source rate and reset the converter's history.
  func seek(toFrame frame: Int64) {
    let clamped = AttoAudioCore.clamp(frame, 0, length)
    if converter == nil {
      file.framePosition = clamped
    } else {
      file.framePosition = Int64((Double(clamped) * sourceRate / outputRate).rounded())
      converter?.reset()
    }
    sourceExhausted = false
    readError = nil
    outputPosition = clamped
  }

  /**
   * Reads up to `maxFrames` frames, all channels, into `channels` (resized to
   * channelCount arrays of exactly the frames read). Returns the frame count,
   * zero at end of file.
   */
  @discardableResult
  func readChannels(into channels: inout [[Float]], maxFrames: Int) throws -> Int {
    let buffer = try fill(maxFrames: maxFrames)
    let got = Int(buffer.frameLength)
    if channels.count != channelCount {
      channels = Array(repeating: [], count: channelCount)
    }
    guard let data = buffer.floatChannelData else { return 0 }
    for ch in 0..<channelCount {
      if channels[ch].count != got { channels[ch] = [Float](repeating: 0, count: got) }
      if got > 0 {
        channels[ch].withUnsafeMutableBufferPointer { dst in
          dst.baseAddress!.update(from: data[ch], count: got)
        }
      }
    }
    outputPosition += Int64(got)
    return got
  }

  /**
   * Reads up to `maxFrames` frames averaged down to mono into `mono` (resized
   * to exactly the frames read). Returns the frame count, zero at end of file.
   */
  @discardableResult
  func readMono(into mono: inout [Float], maxFrames: Int) throws -> Int {
    let buffer = try fill(maxFrames: maxFrames)
    let got = Int(buffer.frameLength)
    if mono.count != got { mono = [Float](repeating: 0, count: got) }
    guard got > 0, let data = buffer.floatChannelData else {
      return 0
    }
    mono.withUnsafeMutableBufferPointer { dst in
      let out = dst.baseAddress!
      out.update(from: data[0], count: got)
      if channelCount > 1 {
        for ch in 1..<channelCount {
          vDSP_vadd(out, 1, data[ch], 1, out, 1, vDSP_Length(got))
        }
        var scale = 1 / Float(channelCount)
        vDSP_vsmul(out, 1, &scale, out, 1, vDSP_Length(got))
      }
    }
    outputPosition += Int64(got)
    return got
  }

  /**
   * Reads exactly the frames of [start, end) at the output rate into a mono
   * array, in chunks of AttoAudioCore.chunkFrames, calling `body` per chunk
   * with the chunk and its absolute start frame. `body` returning false stops
   * early. The reader is left positioned after the last chunk read.
   */
  func forEachMonoChunk(
    from start: Int64, to end: Int64, chunkFrames: Int = AttoAudioCore.chunkFrames,
    _ body: (_ chunk: inout [Float], _ at: Int64) throws -> Bool
  ) throws {
    guard end > start else { return }
    seek(toFrame: start)
    var chunk: [Float] = []
    var at = start
    while at < end {
      let wanted = Int(min(Int64(chunkFrames), end - at))
      let got = try readMono(into: &chunk, maxFrames: wanted)
      if got == 0 { break }
      let keep = try body(&chunk, at)
      at += Int64(got)
      if !keep { break }
    }
  }

  // MARK: - private

  /// A reusable buffer of exactly `capacity` frames in the output format. The
  /// converter fills whatever capacity it is given, so an exact size is the
  /// way to bound how many frames a call returns.
  private func outputBuffer(capacity: Int) throws -> AVAudioPCMBuffer {
    let wanted = AVAudioFrameCount(max(capacity, 1))
    if let existing = outputBuffer, existing.frameCapacity == wanted {
      existing.frameLength = 0
      return existing
    }
    guard
      let created = AVAudioPCMBuffer(
        pcmFormat: converter == nil ? file.processingFormat : outputFormat,
        frameCapacity: wanted)
    else {
      throw AttoProcessError(AttoProcessError.generic, "Could not allocate an output buffer")
    }
    outputBuffer = created
    return created
  }

  /// Fills and returns a buffer with up to `maxFrames` frames at the output rate.
  private func fill(maxFrames: Int) throws -> AVAudioPCMBuffer {
    let target = try outputBuffer(capacity: maxFrames)
    target.frameLength = 0
    guard maxFrames > 0 else { return target }

    guard let converter else {
      if file.framePosition >= file.length { return target }
      do {
        try file.read(into: target, frameCount: AVAudioFrameCount(maxFrames))
      } catch {
        throw AttoProcessError(
          AttoProcessError.input, "Cannot read \(url.lastPathComponent): \(error.localizedDescription)")
      }
      return target
    }

    var convertError: NSError?
    let status = converter.convert(to: target, error: &convertError) { [self] requested, outStatus in
      if sourceExhausted {
        outStatus.pointee = .endOfStream
        return nil
      }
      // Reading at the end of a WAV throws instead of returning zero frames.
      if file.framePosition >= file.length {
        sourceExhausted = true
        outStatus.pointee = .endOfStream
        return nil
      }
      let wanted = min(requested, sourceBuffer.frameCapacity)
      sourceBuffer.frameLength = 0
      do {
        try file.read(into: sourceBuffer, frameCount: wanted)
      } catch {
        readError = error
        sourceExhausted = true
        outStatus.pointee = .endOfStream
        return nil
      }
      if sourceBuffer.frameLength == 0 {
        sourceExhausted = true
        outStatus.pointee = .endOfStream
        return nil
      }
      outStatus.pointee = .haveData
      return sourceBuffer
    }
    if let readError {
      throw AttoProcessError(
        AttoProcessError.input, "Cannot read \(url.lastPathComponent): \(readError.localizedDescription)")
    }
    if status == .error {
      throw AttoProcessError(
        AttoProcessError.input,
        "Cannot convert \(url.lastPathComponent): \(convertError?.localizedDescription ?? "unknown converter error")")
    }
    return target
  }
}

/**
 * Writer for the canonical clip format: CAF, Linear PCM, 16 bit signed integer,
 * little endian, mono, 48 kHz. Float chunks are clamped to full scale and
 * handed to AVAudioFile, which converts to int16 on write. The file is closed
 * (flushed) when `close()` runs or the writer is released, so callers must
 * close before renaming the file into place.
 */
final class AttoCanonicalWriter {
  let url: URL
  private(set) var framesWritten: Int64 = 0
  private var file: AVAudioFile?
  private var buffer: AVAudioPCMBuffer?

  init(url: URL, sampleRate: Double = AttoAudioCore.canonicalSampleRate) throws {
    self.url = url
    let settings: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: sampleRate,
      AVNumberOfChannelsKey: 1,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    file = try AVAudioFile(
      forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  }

  var durationSeconds: Double { Double(framesWritten) / AttoAudioCore.canonicalSampleRate }

  func write(_ samples: [Float]) throws {
    try samples.withUnsafeBufferPointer { try write($0) }
  }

  func write(_ samples: UnsafeBufferPointer<Float>) throws {
    guard let file else {
      throw AttoProcessError(AttoProcessError.generic, "Writer already closed")
    }
    let count = samples.count
    guard count > 0, let src = samples.baseAddress else { return }
    let out = try pcmBuffer(file: file, capacity: count)
    guard let dst = out.floatChannelData?[0] else { return }
    var lo: Float = -1
    var hi: Float = 1
    vDSP_vclip(src, 1, &lo, &hi, dst, 1, vDSP_Length(count))
    out.frameLength = AVAudioFrameCount(count)
    try file.write(from: out)
    framesWritten += Int64(count)
  }

  /// Writes `count` frames of digital silence.
  func writeSilence(_ count: Int) throws {
    guard count > 0 else { return }
    try write([Float](repeating: 0, count: count))
  }

  func close() {
    file = nil
    buffer = nil
  }

  private func pcmBuffer(file: AVAudioFile, capacity: Int) throws -> AVAudioPCMBuffer {
    if let buffer, buffer.frameCapacity >= AVAudioFrameCount(capacity) {
      return buffer
    }
    guard
      let created = AVAudioPCMBuffer(
        pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(max(capacity, 4096)))
    else {
      throw AttoProcessError(AttoProcessError.generic, "Could not allocate the write buffer")
    }
    buffer = created
    return created
  }
}
