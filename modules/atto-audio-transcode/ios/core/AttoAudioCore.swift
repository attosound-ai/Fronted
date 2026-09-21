import Foundation

/**
 * Shared vocabulary of the range processing core.
 *
 * Every file in ios/core is plain Swift on top of AVFoundation and Accelerate
 * only: nothing here imports ExpoModulesCore, so the same sources compile in
 * the app (through the podspec glob) and in the command line harness under
 * tests/. The thin Expo module in ios/AttoAudioTranscodeModule.swift is the
 * only bridge between JS and these types.
 */
enum AttoAudioCore {
  /// Canonical clip rate. Every range op reads and writes at this rate.
  static let canonicalSampleRate: Double = 48000

  /// Frames pulled from the source per iteration: one second at 48 kHz. Memory
  /// stays flat regardless of file length because nothing holds more than a
  /// few of these at once.
  static let chunkFrames: Int = 48000

  /// Where processRange and previewRange put their outputs. Callers own the
  /// eviction policy (sweepCache) so this only has to be stable and writable.
  static func outputDirectory() throws -> URL {
    let base =
      FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    let dir = base.appendingPathComponent("atto-audio-transcode/ranges", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
  }

  /// Strips a file URL scheme so both bare paths and file URLs are accepted.
  static func fileURL(_ pathOrURL: String) -> URL {
    return URL(fileURLWithPath: pathOrURL.replacingOccurrences(of: "file://", with: ""))
  }

  static func dbToLinear(_ db: Double) -> Float {
    return Float(pow(10.0, db / 20.0))
  }

  static func linearToDb(_ linear: Float) -> Double {
    return 20.0 * log10(max(Double(linear), 1e-9))
  }

  static func clamp<T: Comparable>(_ v: T, _ lo: T, _ hi: T) -> T {
    return min(max(v, lo), hi)
  }
}

// MARK: - errors

/**
 * Error carrying the JS facing code so the module can reject with exactly the
 * code the caller must branch on (cancellation versus a real failure).
 */
struct AttoProcessError: LocalizedError {
  static let cancelled = "ERR_PROCESS_CANCELLED"
  static let badOp = "ERR_PROCESS_OP"
  static let badRange = "ERR_PROCESS_RANGE"
  static let input = "ERR_PROCESS_INPUT"
  static let generic = "ERR_PROCESS"

  let code: String
  let message: String
  var errorDescription: String? { message }

  init(_ code: String, _ message: String) {
    self.code = code
    self.message = message
  }
}

// MARK: - cancellation

/**
 * Thread safe registry of cancelled job ids, shared by every long op of the
 * core. cancelProcess runs on the JS thread while the loops run on a global
 * queue, hence the lock. A cancel can arrive BEFORE the job body starts (the
 * AsyncFunction is dispatched asynchronously), so ids are recorded
 * unconditionally and cleared when the matching job finishes. Job ids must
 * therefore be unique per call.
 */
final class AttoProcessCancellation: @unchecked Sendable {
  static let shared = AttoProcessCancellation()

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

  /// Throws the cancellation error when `jobId` was cancelled. A nil job id
  /// (caller did not ask for cancellation support) never throws.
  func check(_ jobId: String?) throws {
    guard let jobId, isCancelled(jobId) else { return }
    throw AttoProcessError(AttoProcessError.cancelled, "Process \(jobId) was cancelled")
  }
}

// MARK: - progress

/**
 * Progress accounting for one job. Work is counted in source frames touched
 * (reads, plus extra passes for ops that scan the range more than once), and
 * the callback is throttled to at most ten calls per second, plus a final
 * call at 1.0 so listeners always see completion.
 */
final class AttoProgress {
  typealias Callback = (_ jobId: String, _ progress: Double) -> Void

  static let minInterval: TimeInterval = 0.1

  let jobId: String?
  private let callback: Callback?
  private var total: Double
  private var done: Double = 0
  private var lastSent: TimeInterval = 0
  private var lastValue: Double = -1

  init(jobId: String?, totalUnits: Double, callback: Callback?) {
    self.jobId = jobId
    self.callback = callback
    self.total = max(totalUnits, 1)
  }

  /// Raises the denominator when a pass turns out to need more work.
  func addWork(_ units: Double) {
    total += max(units, 0)
  }

  func advance(_ units: Double) {
    done += units
    emit(force: false)
  }

  func finish() {
    done = total
    emit(force: true)
  }

  private func emit(force: Bool) {
    guard let jobId, let callback else { return }
    let value = min(done / total, 1)
    let now = Date().timeIntervalSince1970
    if !force && now - lastSent < AttoProgress.minInterval { return }
    if value == lastValue && !force { return }
    lastSent = now
    lastValue = value
    callback(jobId, value)
  }
}

// MARK: - parameter helpers

/**
 * Tolerant readers for the JSON shaped dictionaries JS hands over. Numbers
 * may arrive as Int, Double or NSNumber depending on the bridge; strings and
 * arrays are validated where used.
 */
enum AttoParams {
  static func number(_ v: Any?) -> Double? {
    if let d = v as? Double, d.isFinite { return d }
    if let i = v as? Int { return Double(i) }
    if let n = v as? NSNumber, n.doubleValue.isFinite { return n.doubleValue }
    return nil
  }

  static func number(_ dict: [String: Any], _ key: String, _ fallback: Double) -> Double {
    return number(dict[key]) ?? fallback
  }

  static func int(_ dict: [String: Any], _ key: String, _ fallback: Int) -> Int {
    guard let d = number(dict[key]) else { return fallback }
    return Int(AttoAudioCore.clamp(d.rounded(), -1e9, 1e9))
  }

  static func string(_ dict: [String: Any], _ key: String, _ fallback: String) -> String {
    return (dict[key] as? String) ?? fallback
  }

  static func numbers(_ v: Any?) -> [Double]? {
    guard let list = v as? [Any] else { return nil }
    var out: [Double] = []
    out.reserveCapacity(list.count)
    for item in list {
      guard let d = number(item) else { return nil }
      out.append(d)
    }
    return out
  }
}
