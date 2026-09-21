import Foundation

/**
 * One editing or effect operation applied to a time range of a clip. Mirrors
 * the RangeOp discriminated union in index.ts one to one: the `type` field of
 * the JS object selects the case, the other fields are its parameters, and
 * every parameter has the default documented there so the UI may omit it.
 */
enum AttoRangeOp {
  enum FadeCurve: String {
    case linear
    case log
  }

  enum NoiseKind: String {
    case white
    case pink
    case brown
  }

  case silence
  case remove
  case trim
  case reverse
  case repeatRange(count: Int)
  case fadeIn(curve: FadeCurve)
  case fadeOut(curve: FadeCurve)
  case amplify(gainDb: Double)
  case normalize(peakDb: Double)
  case bassBoost(gainDb: Double, frequencyHz: Double)
  case tenBandEq(gainsDb: [Double])
  case compressor(thresholdDb: Double, ratio: Double, attackMs: Double, releaseMs: Double, makeupDb: Double)
  case deEss(frequencyHz: Double, thresholdDb: Double, amountDb: Double)
  case echo(delayMs: Double, decay: Double, repeats: Int)
  case tapeDelay(delayMs: Double, feedback: Double, wetDry: Double, lowPassHz: Double)
  case phaser(rateHz: Double, depth: Double, feedback: Double, stages: Int)
  case wahwah(rateHz: Double, depth: Double, resonance: Double)
  case changePitch(cents: Double)
  case changeTempo(rate: Double)
  case paulstretch(factor: Double, windowSec: Double)
  case censorBleep(frequencyHz: Double, gainDb: Double)
  case noiseGenerator(kind: NoiseKind, amplitudeDb: Double)
  case silenceRemover(thresholdDb: Double, minSilenceMs: Double, keepMs: Double)
  case centerCut
  case denoise(strengthDb: Double)
  case reverb(preset: String, wetDryMix: Double)
  case eqSimple(highPassHz: Double, presenceDb: Double, presenceHz: Double, lowShelfDb: Double)

  /// The ten centre frequencies of tenBandEq, in Hz.
  static let tenBandFrequencies: [Double] = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

  /// The `type` string as JS spells it.
  var type: String {
    switch self {
    case .silence: return "silence"
    case .remove: return "remove"
    case .trim: return "trim"
    case .reverse: return "reverse"
    case .repeatRange: return "repeat"
    case .fadeIn: return "fadeIn"
    case .fadeOut: return "fadeOut"
    case .amplify: return "amplify"
    case .normalize: return "normalize"
    case .bassBoost: return "bassBoost"
    case .tenBandEq: return "tenBandEq"
    case .compressor: return "compressor"
    case .deEss: return "deEss"
    case .echo: return "echo"
    case .tapeDelay: return "tapeDelay"
    case .phaser: return "phaser"
    case .wahwah: return "wahwah"
    case .changePitch: return "changePitch"
    case .changeTempo: return "changeTempo"
    case .paulstretch: return "paulstretch"
    case .censorBleep: return "censorBleep"
    case .noiseGenerator: return "noiseGenerator"
    case .silenceRemover: return "silenceRemover"
    case .centerCut: return "centerCut"
    case .denoise: return "denoise"
    case .reverb: return "reverb"
    case .eqSimple: return "eqSimple"
    }
  }

  /// True for ops whose output length differs from the input length.
  var changesLength: Bool {
    switch self {
    case .remove, .trim, .repeatRange, .silenceRemover, .changeTempo, .paulstretch:
      return true
    default:
      return false
    }
  }

  // MARK: - parsing

  static func parse(_ dict: [String: Any]) throws -> AttoRangeOp {
    guard let type = dict["type"] as? String else {
      throw AttoProcessError(AttoProcessError.badOp, "op.type is missing")
    }
    func n(_ dict: [String: Any], _ key: String, _ fallback: Double) -> Double {
      return AttoParams.number(dict, key, fallback)
    }
    func clamp<T: Comparable>(_ v: T, _ lo: T, _ hi: T) -> T {
      return AttoAudioCore.clamp(v, lo, hi)
    }
    switch type {
    case "silence": return .silence
    case "remove": return .remove
    case "trim": return .trim
    case "reverse": return .reverse
    case "repeat":
      return .repeatRange(count: clamp(AttoParams.int(dict, "count", 1), 1, 1000))
    case "fadeIn":
      return .fadeIn(curve: FadeCurve(rawValue: AttoParams.string(dict, "curve", "linear")) ?? .linear)
    case "fadeOut":
      return .fadeOut(curve: FadeCurve(rawValue: AttoParams.string(dict, "curve", "linear")) ?? .linear)
    case "amplify":
      return .amplify(gainDb: clamp(n(dict, "gainDb", 0), -60, 40))
    case "normalize":
      return .normalize(peakDb: clamp(n(dict, "peakDb", -1), -60, 0))
    case "bassBoost":
      return .bassBoost(
        gainDb: clamp(n(dict, "gainDb", 6), -24, 24),
        frequencyHz: clamp(n(dict, "frequencyHz", 100), 20, 2000))
    case "tenBandEq":
      guard let gains = AttoParams.numbers(dict["gainsDb"]), gains.count == 10 else {
        throw AttoProcessError(AttoProcessError.badOp, "tenBandEq.gainsDb must hold 10 numbers")
      }
      return .tenBandEq(gainsDb: gains.map { clamp($0, -24, 24) })
    case "compressor":
      return .compressor(
        thresholdDb: clamp(n(dict, "thresholdDb", -20), -60, 0),
        ratio: clamp(n(dict, "ratio", 4), 1, 100),
        attackMs: clamp(n(dict, "attackMs", 10), 0.1, 500),
        releaseMs: clamp(n(dict, "releaseMs", 100), 10, 5000),
        makeupDb: clamp(n(dict, "makeupDb", 0), -40, 40))
    case "deEss":
      return .deEss(
        frequencyHz: clamp(n(dict, "frequencyHz", 6000), 1000, 16000),
        thresholdDb: clamp(n(dict, "thresholdDb", -30), -80, 0),
        amountDb: clamp(n(dict, "amountDb", 12), 0, 40))
    case "echo":
      return .echo(
        delayMs: clamp(n(dict, "delayMs", 300), 1, 5000),
        decay: clamp(n(dict, "decay", 0.5), 0, 1),
        repeats: clamp(AttoParams.int(dict, "repeats", 3), 1, 32))
    case "tapeDelay":
      return .tapeDelay(
        delayMs: clamp(n(dict, "delayMs", 300), 0, 2000),
        feedback: clamp(n(dict, "feedback", 30), 0, 100),
        wetDry: clamp(n(dict, "wetDry", 30), 0, 100),
        lowPassHz: clamp(n(dict, "lowPassHz", 5000), 10, 22050))
    case "phaser":
      return .phaser(
        rateHz: clamp(n(dict, "rateHz", 0.4), 0.01, 20),
        depth: clamp(n(dict, "depth", 0.7), 0, 1),
        feedback: clamp(n(dict, "feedback", 0.3), 0, 0.99),
        stages: clamp(AttoParams.int(dict, "stages", 4), 2, 24))
    case "wahwah":
      return .wahwah(
        rateHz: clamp(n(dict, "rateHz", 1.5), 0.01, 20),
        depth: clamp(n(dict, "depth", 0.7), 0, 1),
        resonance: clamp(n(dict, "resonance", 2.5), 0.1, 10))
    case "changePitch":
      return .changePitch(cents: clamp(n(dict, "cents", 0), -2400, 2400))
    case "changeTempo":
      return .changeTempo(rate: clamp(n(dict, "rate", 1), 0.25, 4))
    case "paulstretch":
      return .paulstretch(
        factor: clamp(n(dict, "factor", 8), 2, 50),
        windowSec: clamp(n(dict, "windowSec", 0.25), 0.02, 2))
    case "censorBleep":
      return .censorBleep(
        frequencyHz: clamp(n(dict, "frequencyHz", 1000), 20, 20000),
        gainDb: clamp(n(dict, "gainDb", -12), -60, 0))
    case "noiseGenerator":
      return .noiseGenerator(
        kind: NoiseKind(rawValue: AttoParams.string(dict, "kind", "white")) ?? .white,
        amplitudeDb: clamp(n(dict, "amplitudeDb", -20), -80, 0))
    case "silenceRemover":
      return .silenceRemover(
        thresholdDb: clamp(n(dict, "thresholdDb", -40), -100, 0),
        minSilenceMs: clamp(n(dict, "minSilenceMs", 300), 10, 30000),
        keepMs: clamp(n(dict, "keepMs", 50), 0, 5000))
    case "centerCut": return .centerCut
    case "denoise":
      return .denoise(strengthDb: clamp(n(dict, "strengthDb", 12), 0, 40))
    case "reverb":
      return .reverb(
        preset: AttoParams.string(dict, "preset", "mediumHall"),
        wetDryMix: clamp(n(dict, "wetDryMix", 25), 0, 100))
    case "eqSimple":
      return .eqSimple(
        highPassHz: clamp(n(dict, "highPassHz", 0), 0, 1000),
        presenceDb: clamp(n(dict, "presenceDb", 0), -12, 12),
        presenceHz: clamp(n(dict, "presenceHz", 3000), 800, 8000),
        lowShelfDb: clamp(n(dict, "lowShelfDb", 0), -12, 12))
    default:
      throw AttoProcessError(AttoProcessError.badOp, "Unknown op type \(type)")
    }
  }
}
