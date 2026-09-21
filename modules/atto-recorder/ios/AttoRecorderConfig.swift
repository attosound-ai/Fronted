import AVFoundation
import Foundation

/// Lifecycle states shared with JS through the AttoRecorderState event.
enum AttoRecorderState: String {
  case idle
  case ready
  case recording
  case paused
  case stopped
  case error
}

/// One existing stem that plays while the take is captured, placed on the
/// timeline at `startMs` (timeline position of the stem's first frame).
struct AttoOverdubSpec {
  let path: String
  let startMs: Double
  let gainDb: Double

  static func parse(_ raw: Any) -> AttoOverdubSpec? {
    guard let dict = raw as? [String: Any], let path = dict["path"] as? String, !path.isEmpty
    else { return nil }
    let startMs = AttoRecorderConfig.number(dict["startMs"]) ?? 0
    let gainDb = AttoRecorderConfig.number(dict["gainDb"]) ?? 0
    return AttoOverdubSpec(path: path, startMs: startMs, gainDb: gainDb)
  }
}

/// Everything the recording sheet can set. `configure` merges a partial
/// dictionary on top of the current values, so JS only sends what changed.
struct AttoRecorderConfig {
  /// Hear the processed input through the output route while armed or recording.
  var monitoring: Bool = false
  /// Applied before the limiter, in dB. Clamped to the range minus 24 to plus 24.
  var inputGainDb: Double = 0
  /// Apple peak limiter between the gain stage and the writer.
  var limiter: Bool = true
  /// Reverb on the monitor path only; never written to the file.
  var monitorReverb: Bool = false
  var monitorReverbPreset: String = "mediumRoom"
  /// Wet and dry balance of the monitor reverb, 0 to 100.
  var monitorReverbMix: Double = 30
  /// Backing track that plays from `fromMs` while the take is captured.
  var backingTrackPath: String? = nil
  /// Linear playback volume of the backing track, 0 to 1.
  var backingTrackVolume: Double = 1
  /// When true the backing track is also summed into the recorded file.
  var mixBackingIntoRecording: Bool = false
  /// Existing stems to play along, each at its own timeline offset.
  var overdubs: [AttoOverdubSpec] = []
  /// Only caf is supported; kept so JS can be explicit about the container.
  var format: String = "caf"

  static func number(_ value: Any?) -> Double? {
    if let d = value as? Double { return d }
    if let i = value as? Int { return Double(i) }
    if let n = value as? NSNumber { return n.doubleValue }
    return nil
  }

  static func bool(_ value: Any?) -> Bool? {
    if let b = value as? Bool { return b }
    if let n = value as? NSNumber { return n.boolValue }
    return nil
  }

  /// Returns a copy of `base` with every key present in `dict` replaced.
  static func merge(_ dict: [String: Any], into base: AttoRecorderConfig) -> AttoRecorderConfig {
    var next = base
    if let v = bool(dict["monitoring"]) { next.monitoring = v }
    if let v = number(dict["inputGainDb"]) { next.inputGainDb = min(24, max(-24, v)) }
    if let v = bool(dict["limiter"]) { next.limiter = v }
    if let v = bool(dict["monitorReverb"]) { next.monitorReverb = v }
    if let v = dict["monitorReverbPreset"] as? String, !v.isEmpty { next.monitorReverbPreset = v }
    if let v = number(dict["monitorReverbMix"]) { next.monitorReverbMix = min(100, max(0, v)) }
    if dict.keys.contains("backingTrackPath") {
      let v = dict["backingTrackPath"] as? String
      next.backingTrackPath = (v?.isEmpty ?? true) ? nil : v
    }
    if let v = number(dict["backingTrackVolume"]) { next.backingTrackVolume = min(1, max(0, v)) }
    if let v = bool(dict["mixBackingIntoRecording"]) { next.mixBackingIntoRecording = v }
    if let list = dict["overdubPaths"] as? [Any] {
      next.overdubs = list.compactMap(AttoOverdubSpec.parse)
    }
    if let v = dict["format"] as? String, !v.isEmpty { next.format = v }
    return next
  }

  var inputGainLinear: Float {
    Float(pow(10.0, inputGainDb / 20.0))
  }

  var reverbPreset: AVAudioUnitReverbPreset {
    switch monitorReverbPreset {
    case "smallRoom": return .smallRoom
    case "mediumRoom": return .mediumRoom
    case "largeRoom": return .largeRoom
    case "mediumHall": return .mediumHall
    case "largeHall": return .largeHall
    case "plate": return .plate
    case "cathedral": return .cathedral
    case "mediumChamber": return .mediumChamber
    case "largeChamber": return .largeChamber
    case "largeRoom2": return .largeRoom2
    case "mediumHall2": return .mediumHall2
    case "mediumHall3": return .mediumHall3
    case "largeHall2": return .largeHall2
    default: return .mediumRoom
    }
  }
}

/// Error surfaced to JS with a stable code so callers can branch on it.
struct AttoRecorderError: Error {
  let code: String
  let message: String

  static func busy(_ message: String) -> AttoRecorderError {
    AttoRecorderError(code: "ERR_RECORDER_BUSY", message: message)
  }
  static func state(_ message: String) -> AttoRecorderError {
    AttoRecorderError(code: "ERR_RECORDER_STATE", message: message)
  }
  static func session(_ message: String) -> AttoRecorderError {
    AttoRecorderError(code: "ERR_RECORDER_SESSION", message: message)
  }
  static func engine(_ message: String) -> AttoRecorderError {
    AttoRecorderError(code: "ERR_RECORDER_ENGINE", message: message)
  }
  static func input(_ message: String) -> AttoRecorderError {
    AttoRecorderError(code: "ERR_RECORDER_INPUT", message: message)
  }
  static func file(_ message: String) -> AttoRecorderError {
    AttoRecorderError(code: "ERR_RECORDER_FILE", message: message)
  }
}
