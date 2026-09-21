import Accelerate
import Foundation

/**
 * Waveform overview: `count` buckets of the absolute peak (0..1) of the mono
 * mix, computed with vDSP over one second chunks at the file's own rate (no
 * resampling: bucket edges are fractions of the file, so the rate is
 * irrelevant). Results are cached as raw little endian Float32 next to the
 * file, keyed by file name, modification time and bucket count, so the
 * waveform view of a clip that did not change costs one small read.
 */
enum AttoPeaks {
  static let maxCount = 100_000

  static func peaks(inputPath: String, count requestedCount: Int, jobId: String? = nil) throws -> [Float] {
    let url = AttoAudioCore.fileURL(inputPath)
    let count = AttoAudioCore.clamp(requestedCount, 1, maxCount)
    let cacheURL = cacheFileURL(for: url, count: count)
    if let cacheURL, let cached = readCache(cacheURL, count: count) {
      return cached
    }
    let peaks = try compute(url: url, count: count, jobId: jobId)
    if let cacheURL {
      writeCache(cacheURL, sourceName: url.lastPathComponent, peaks: peaks)
    }
    return peaks
  }

  static func compute(url: URL, count: Int, jobId: String? = nil) throws -> [Float] {
    let reader = try AttoSourceReader(url: url, outputRate: nil)
    let total = reader.length
    var peaks = [Float](repeating: 0, count: count)
    guard total > 0 else { return peaks }
    let chunkFrames = Int(reader.sourceRate.rounded())
    var chunk: [Float] = []
    var position: Int64 = 0
    reader.seek(toFrame: 0)
    while true {
      try AttoProcessCancellation.shared.check(jobId)
      let got = try reader.readMono(into: &chunk, maxFrames: chunkFrames)
      if got == 0 { break }
      chunk.withUnsafeBufferPointer { samples in
        var frame = position
        var i = 0
        while i < got {
          // Bucket index of this frame and the last frame that bucket holds.
          let bucket = Int(frame * Int64(count) / total)
          let bucketEnd = min(((Int64(bucket) + 1) * total + Int64(count) - 1) / Int64(count), total)
          let run = Int(min(Int64(got - i), bucketEnd - frame))
          var value: Float = 0
          vDSP_maxmgv(samples.baseAddress! + i, 1, &value, vDSP_Length(run))
          if value > peaks[bucket] { peaks[bucket] = value }
          i += run
          frame += Int64(run)
        }
      }
      position += Int64(got)
    }
    return peaks.map { min($0, 1) }
  }

  // MARK: - cache

  static func cacheFileURL(for url: URL, count: Int) -> URL? {
    guard let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
      let modified = attrs[.modificationDate] as? Date
    else { return nil }
    let stamp = Int(modified.timeIntervalSince1970 * 1000)
    let name = "\(url.lastPathComponent).\(stamp).\(count).peaks"
    return url.deletingLastPathComponent().appendingPathComponent(name)
  }

  private static func readCache(_ url: URL, count: Int) -> [Float]? {
    guard let data = try? Data(contentsOf: url), data.count == count * MemoryLayout<Float>.size else {
      return nil
    }
    var peaks = [Float](repeating: 0, count: count)
    _ = peaks.withUnsafeMutableBytes { data.copyBytes(to: $0) }
    return peaks
  }

  private static func writeCache(_ url: URL, sourceName: String, peaks: [Float]) {
    // Stale entries for the same file (older modification stamps or other
    // bucket counts) are removed on a best effort basis.
    let fm = FileManager.default
    let directory = url.deletingLastPathComponent()
    let prefix = sourceName + "."
    if let siblings = try? fm.contentsOfDirectory(atPath: directory.path) {
      for name in siblings where name.hasSuffix(".peaks") && name.hasPrefix(prefix) && name != url.lastPathComponent {
        try? fm.removeItem(at: directory.appendingPathComponent(name))
      }
    }
    let data = peaks.withUnsafeBufferPointer { Data(buffer: $0) }
    try? data.write(to: url, options: .atomic)
  }
}
