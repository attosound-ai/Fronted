import AVFoundation
import Foundation

/**
 * Offline check of the range processing core, no XCTest, no Expo. Builds a
 * five second 48 kHz file (tone, one second gap, tone), runs every RangeOp
 * through the same AttoRangeProcessor the module uses and asserts durations,
 * RMS levels and peaks. Run it with tests/run.sh.
 */

let sampleRate = AttoAudioCore.canonicalSampleRate
let toneAmplitude: Float = 0.5
let toneRms = toneAmplitude / sqrt(2)
let workDir = FileManager.default.temporaryDirectory.appendingPathComponent("atto-range-harness-\(ProcessInfo.processInfo.processIdentifier)")
try! FileManager.default.createDirectory(at: workDir, withIntermediateDirectories: true)

var passed = 0
var failed = 0
var timings: [(String, Int)] = []

func check(_ name: String, _ condition: Bool, _ detail: @autoclosure () -> String = "") {
  if condition {
    passed += 1
    print("  ok    \(name)")
  } else {
    failed += 1
    print("  FAIL  \(name) \(detail())")
  }
}

func approx(_ a: Double, _ b: Double, tolerance: Double) -> Bool {
  return abs(a - b) <= tolerance
}

func db(_ v: Float) -> Double { AttoAudioCore.linearToDb(v) }

// MARK: - fixtures

func writeCanonical(_ name: String, channels: [[Float]], rate: Double = sampleRate, fileType: String = "caf") throws -> URL {
  let url = workDir.appendingPathComponent("\(name).\(fileType)")
  let settings: [String: Any] = [
    AVFormatIDKey: kAudioFormatLinearPCM,
    AVSampleRateKey: rate,
    AVNumberOfChannelsKey: channels.count,
    AVLinearPCMBitDepthKey: 16,
    AVLinearPCMIsFloatKey: false,
    AVLinearPCMIsBigEndianKey: false,
    AVLinearPCMIsNonInterleaved: false,
  ]
  let file = try AVAudioFile(forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)
  let frames = channels[0].count
  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(frames))!
  for (ch, samples) in channels.enumerated() {
    samples.withUnsafeBufferPointer { buffer.floatChannelData![ch].update(from: $0.baseAddress!, count: frames) }
  }
  buffer.frameLength = AVAudioFrameCount(frames)
  try file.write(from: buffer)
  return url
}

func tone(seconds: Double, frequency: Double, amplitude: Float, rate: Double = sampleRate) -> [Float] {
  let n = Int(seconds * rate)
  return (0..<n).map { amplitude * Float(sin(2 * Double.pi * frequency * Double($0) / rate)) }
}

func readAll(_ path: String) throws -> (samples: [Float], rate: Double) {
  let file = try AVAudioFile(forReading: AttoAudioCore.fileURL(path), commonFormat: .pcmFormatFloat32, interleaved: false)
  let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: AVAudioFrameCount(file.length))!
  try file.read(into: buffer)
  let n = Int(buffer.frameLength)
  return (Array(UnsafeBufferPointer(start: buffer.floatChannelData![0], count: n)), file.processingFormat.sampleRate)
}

func rms(_ samples: [Float], from: Double, to: Double) -> Float {
  let a = max(0, Int(from * sampleRate)), b = min(samples.count, Int(to * sampleRate))
  guard b > a else { return 0 }
  return AttoVec.rms(Array(samples[a..<b]))
}

func peak(_ samples: [Float], from: Double, to: Double) -> Float {
  let a = max(0, Int(from * sampleRate)), b = min(samples.count, Int(to * sampleRate))
  guard b > a else { return 0 }
  return AttoVec.peak(Array(samples[a..<b]))
}

func run(_ op: [String: Any], on input: URL, start: Double, end: Double?, jobId: String? = nil, progress: AttoProgress.Callback? = nil) throws -> (result: [String: Any], samples: [Float], ms: Int) {
  let parsed = try AttoRangeOp.parse(op)
  let request = AttoRangeRequest(inputPath: input.path, startSec: start, endSec: end, op: parsed, jobId: jobId, progress: progress)
  let started = Date()
  let result = try AttoRangeProcessor.process(request)
  let ms = Int(Date().timeIntervalSince(started) * 1000)
  timings.append((parsed.type, ms))
  let samples = try readAll(result["outputPath"] as! String).samples
  return (result, samples, ms)
}

func duration(_ result: [String: Any]) -> Double { result["durationSec"] as! Double }

// Fixture: tone 0 to 2 s, silence 2 to 3 s, tone 3 to 5 s.
let toneSeconds = tone(seconds: 2, frequency: 440, amplitude: toneAmplitude)
let gap = [Float](repeating: 0, count: Int(sampleRate))
let fixture = toneSeconds + gap + toneSeconds
let input = try! writeCanonical("fixture", channels: [fixture])
print("fixture: \(input.path) (\(fixture.count) frames)")

// MARK: - FFT round trip

do {
  print("fft")
  let fft = AttoFFT(size: 1024)
  let signal = tone(seconds: 1024 / sampleRate, frequency: 1000, amplitude: 0.7)
  var re: [Float] = [], im: [Float] = [], back: [Float] = []
  fft.forward(signal, real: &re, imag: &im)
  fft.inverse(real: re, imag: im, output: &back)
  var maxErr: Float = 0
  for i in 0..<signal.count { maxErr = max(maxErr, abs(signal[i] - back[i])) }
  check("forward then inverse is identity", maxErr < 1e-4, "max error \(maxErr)")
}

// MARK: - edit ops

do {
  print("edit ops")
  let (r, s, _) = try run(["type": "silence"], on: input, start: 1, end: 2)
  check("silence keeps duration", approx(duration(r), 5, tolerance: 0.001), "\(duration(r))")
  check("silence range is zero", rms(s, from: 1, to: 2) == 0, "\(rms(s, from: 1, to: 2))")
  check("silence leaves the rest", approx(Double(rms(s, from: 0, to: 1)), Double(toneRms), tolerance: 0.005))

  let (r2, _, _) = try run(["type": "remove"], on: input, start: 1, end: 2)
  check("remove shortens by the range", approx(duration(r2), 4, tolerance: 0.001), "\(duration(r2))")

  let (r3, s3, _) = try run(["type": "trim"], on: input, start: 1, end: 3)
  check("trim keeps only the range", approx(duration(r3), 2, tolerance: 0.001), "\(duration(r3))")
  check("trim content matches", rms(s3, from: 0, to: 1) > 0.3 && rms(s3, from: 1, to: 2) == 0)

  let (r4, s4, _) = try run(["type": "reverse"], on: input, start: 0, end: nil)
  check("reverse keeps duration", approx(duration(r4), 5, tolerance: 0.001))
  var maxErr: Float = 0
  for i in stride(from: 0, to: fixture.count, by: 7) {
    maxErr = max(maxErr, abs(s4[i] - fixture[fixture.count - 1 - i]))
  }
  check("reverse is the mirror image", maxErr < 2.0 / 32768, "max error \(maxErr)")

  let (r5, _, _) = try run(["type": "repeat", "count": 2], on: input, start: 0, end: 1)
  check("repeat adds count copies", approx(duration(r5), 7, tolerance: 0.001), "\(duration(r5))")

  let (r6, s6, _) = try run(["type": "silenceRemover", "thresholdDb": -40, "minSilenceMs": 300, "keepMs": 50], on: input, start: 0, end: nil)
  check("silenceRemover removes the gap", approx(duration(r6), 4.1, tolerance: 0.002), "\(duration(r6))")
  check("silenceRemover keeps the tone", approx(Double(rms(s6, from: 0, to: 2)), Double(toneRms), tolerance: 0.005))
}

// MARK: - levels

do {
  print("level ops")
  let (r, s, _) = try run(["type": "fadeIn", "curve": "linear"], on: input, start: 0, end: 2)
  check("fadeIn keeps duration", approx(duration(r), 5, tolerance: 0.001))
  check("fadeIn starts at zero", peak(s, from: 0, to: 0.002) < 0.002, "\(peak(s, from: 0, to: 0.002))")
  check("fadeIn ends at full level", approx(Double(rms(s, from: 1.95, to: 2)), Double(toneRms) * 0.9875, tolerance: 0.01))
  check("fadeIn midpoint is half", approx(Double(peak(s, from: 0.99, to: 1.01)), 0.25, tolerance: 0.01), "\(peak(s, from: 0.99, to: 1.01))")

  let (_, s2, _) = try run(["type": "fadeIn", "curve": "log"], on: input, start: 0, end: 2)
  check("log fadeIn starts at zero", peak(s2, from: 0, to: 0.002) < 0.01)
  // A quarter of the way in, linear sits at 0.125; the log taper is well above.
  check("log fadeIn rises faster than linear", peak(s2, from: 0.49, to: 0.51) > 0.125 * 1.5, "\(peak(s2, from: 0.49, to: 0.51))")

  let (_, s3, _) = try run(["type": "fadeOut", "curve": "linear"], on: input, start: 3, end: 5)
  check("fadeOut ends at zero", peak(s3, from: 4.998, to: 5) < 0.002, "\(peak(s3, from: 4.998, to: 5))")
  check("fadeOut leaves the start", approx(Double(rms(s3, from: 0, to: 1)), Double(toneRms), tolerance: 0.005))

  let (_, s4, _) = try run(["type": "amplify", "gainDb": 6], on: input, start: 0, end: 1)
  let ratio = Double(rms(s4, from: 0, to: 1) / toneRms)
  check("amplify raises RMS by 6 dB", approx(20 * log10(ratio), 6, tolerance: 0.1), "\(20 * log10(ratio)) dB")
  check("amplify leaves the rest", approx(Double(rms(s4, from: 1, to: 2)), Double(toneRms), tolerance: 0.005))

  let (_, s5, _) = try run(["type": "normalize", "peakDb": -1], on: input, start: 0, end: 2)
  check("normalize hits the target peak", approx(db(peak(s5, from: 0, to: 2)), -1, tolerance: 0.05), "\(db(peak(s5, from: 0, to: 2))) dB")
  check("normalize leaves the rest", approx(Double(peak(s5, from: 3, to: 5)), Double(toneAmplitude), tolerance: 0.002))

  let (_, s6, _) = try run(["type": "normalize"], on: input, start: 2, end: 3)
  check("normalize of silence stays silent", rms(s6, from: 2, to: 3) == 0)
}

// MARK: - generators

do {
  print("generators")
  let (_, s, _) = try run(["type": "censorBleep", "frequencyHz": 1000, "gainDb": -12], on: input, start: 1, end: 2)
  let expected = Double(AttoAudioCore.dbToLinear(-12) / sqrt(2))
  check("censorBleep level", approx(Double(rms(s, from: 1, to: 2)), expected, tolerance: 0.003), "\(rms(s, from: 1, to: 2)) vs \(expected)")
  check("censorBleep leaves the rest", approx(Double(rms(s, from: 0, to: 1)), Double(toneRms), tolerance: 0.005))

  for kind in ["white", "pink", "brown"] {
    let (_, sn, _) = try run(["type": "noiseGenerator", "kind": kind, "amplitudeDb": -20], on: input, start: 2, end: 3)
    let level = rms(sn, from: 2, to: 3)
    check("\(kind) noise fills the gap", level > 0.01 && level < 0.1 && peak(sn, from: 2, to: 3) <= 0.1001, "rms \(level) peak \(peak(sn, from: 2, to: 3))")
  }
}

// MARK: - time ops

do {
  print("time ops")
  let (r, s, _) = try run(["type": "changeTempo", "rate": 2], on: input, start: 0, end: nil)
  check("changeTempo 2x halves the length", approx(duration(r), 2.5, tolerance: 0.01), "\(duration(r))")
  check("changeTempo keeps level", approx(Double(rms(s, from: 0.2, to: 0.8)), Double(toneRms), tolerance: 0.06), "\(rms(s, from: 0.2, to: 0.8))")

  let (r2, _, _) = try run(["type": "changeTempo", "rate": 0.5], on: input, start: 1, end: 2)
  check("changeTempo 0.5x on one second adds one second", approx(duration(r2), 6, tolerance: 0.01), "\(duration(r2))")

  let (r3, s3, _) = try run(["type": "changePitch", "cents": 1200], on: input, start: 0, end: 2)
  check("changePitch keeps duration", approx(duration(r3), 5, tolerance: 0.001), "\(duration(r3))")
  check("changePitch keeps level", approx(Double(rms(s3, from: 0.3, to: 1.7)), Double(toneRms), tolerance: 0.08), "\(rms(s3, from: 0.3, to: 1.7))")
  check("changePitch leaves the rest", approx(Double(rms(s3, from: 3, to: 5)), Double(toneRms), tolerance: 0.005))

  let (r4, s4, _) = try run(["type": "paulstretch", "factor": 4, "windowSec": 0.25], on: input, start: 0, end: 1)
  check("paulstretch 4x on one second adds three", approx(duration(r4), 8, tolerance: 0.01), "\(duration(r4))")
  check("paulstretch keeps energy", approx(Double(rms(s4, from: 0.5, to: 3.5)), Double(toneRms), tolerance: 0.12), "\(rms(s4, from: 0.5, to: 3.5))")
  check("paulstretch leaves the rest", approx(Double(rms(s4, from: 4, to: 5)), Double(toneRms), tolerance: 0.005))
}

// MARK: - effects

do {
  print("effects")
  let effects: [[String: Any]] = [
    ["type": "bassBoost", "gainDb": 12, "frequencyHz": 100],
    ["type": "tenBandEq", "gainsDb": [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]],
    ["type": "tenBandEq", "gainsDb": [6, 6, 6, 6, 6, 6, 6, 6, 6, 6]],
    ["type": "compressor", "thresholdDb": -30, "ratio": 8, "attackMs": 5, "releaseMs": 50, "makeupDb": 0],
    ["type": "deEss", "frequencyHz": 6000, "thresholdDb": -40, "amountDb": 12],
    ["type": "echo", "delayMs": 250, "decay": 0.5, "repeats": 3],
    ["type": "tapeDelay", "delayMs": 300, "feedback": 30, "wetDry": 30, "lowPassHz": 5000],
    ["type": "phaser", "rateHz": 0.5, "depth": 0.8, "feedback": 0.3, "stages": 4],
    ["type": "wahwah", "rateHz": 1.5, "depth": 0.7, "resonance": 2.5],
    ["type": "reverb", "preset": "mediumHall", "wetDryMix": 40],
    ["type": "eqSimple", "highPassHz": 120, "presenceDb": 3, "presenceHz": 3000, "lowShelfDb": 0],
    ["type": "denoise", "strengthDb": 12],
  ]
  for op in effects {
    let name = op["type"] as! String
    // The gate learns its noise print from the quietest tenth of the range,
    // so denoise is run over the whole file (which includes the gap).
    let end: Double? = name == "denoise" ? nil : 2
    let (r, s, _) = try run(op, on: input, start: 0, end: end)
    let level = rms(s, from: 0.2, to: 1.8)
    let finite = s.allSatisfy { $0.isFinite }
    check("\(name) keeps duration", approx(duration(r), 5, tolerance: 0.001), "\(duration(r))")
    // The compressor test squeezes a hot tone down hard on purpose.
    let minimum: Float = name == "compressor" ? 0.01 : 0.05
    check("\(name) produces audio", finite && level > minimum, "rms \(level)")
    if end != nil {
      check("\(name) leaves the rest", approx(Double(rms(s, from: 3, to: 5)), Double(toneRms), tolerance: 0.005), "\(rms(s, from: 3, to: 5))")
    }
    check("\(name) keeps the gap silent", rms(s, from: 2.05, to: 3) < 0.002, "\(rms(s, from: 2.05, to: 3))")
    switch name {
    case "tenBandEq":
      let gains = op["gainsDb"] as! [Int]
      if gains[0] == 0 {
        check("flat tenBandEq is transparent", approx(Double(level), Double(toneRms), tolerance: 0.01), "rms \(level)")
      } else {
        // Neighbouring octave bands overlap, so every band at +6 lands a little above 6.
        check("tenBandEq +6 dB raises the tone", approx(db(level) - db(toneRms), 6.5, tolerance: 1.5), "\(db(level) - db(toneRms)) dB")
      }
    case "bassBoost":
      check("bassBoost at 100 Hz barely touches 440 Hz", db(level) - db(toneRms) < 1.5 && db(level) - db(toneRms) > -0.5, "\(db(level) - db(toneRms)) dB")
    case "compressor":
      check("compressor reduces a hot tone", level < toneRms * 0.9, "rms \(level)")
    case "echo":
      check("echo adds energy", level > toneRms, "rms \(level)")
    case "denoise":
      check("denoise keeps a clean tone", approx(db(level), db(toneRms), tolerance: 1.5), "\(db(level)) dB")
    default:
      break
    }
  }

  // Bass boost on a 60 Hz tone must actually lift it.
  let low = try writeCanonical("low", channels: [tone(seconds: 2, frequency: 60, amplitude: 0.2)])
  let (_, sl, _) = try run(["type": "bassBoost", "gainDb": 12, "frequencyHz": 200], on: low, start: 0, end: nil)
  let lift = db(rms(sl, from: 0.5, to: 1.5)) - db(0.2 / sqrt(2))
  check("bassBoost lifts a 60 Hz tone by about 12 dB", approx(lift, 12, tolerance: 1.5), "\(lift) dB")

  // Denoise on a noisy fixture must lower the noise in the gap and keep the tone.
  var noisy = fixture
  var rng = SystemRandomNumberGenerator()
  let noiseAmp = AttoAudioCore.dbToLinear(-40)
  for i in 0..<noisy.count { noisy[i] += Float.random(in: -1...1, using: &rng) * noiseAmp }
  let noisyURL = try writeCanonical("noisy", channels: [noisy])
  let before = rms(noisy, from: 2.1, to: 2.9)
  let (_, sd, _) = try run(["type": "denoise", "strengthDb": 12], on: noisyURL, start: 0, end: nil)
  let after = rms(sd, from: 2.1, to: 2.9)
  check("denoise lowers the noise floor by at least 6 dB", db(after) < db(before) - 6, "\(db(before)) to \(db(after)) dB")
  check("denoise keeps the tone within 1 dB", approx(db(rms(sd, from: 0.2, to: 1.8)), db(toneRms), tolerance: 1), "\(db(rms(sd, from: 0.2, to: 1.8))) dB")
}

// MARK: - center cut

do {
  print("centerCut")
  let (r, _, _) = try run(["type": "centerCut"], on: input, start: 0, end: nil)
  check("centerCut on mono is a noop", (r["noop"] as? Bool) == true && (r["outputPath"] as? String) == input.absoluteString)

  let l = tone(seconds: 2, frequency: 440, amplitude: 0.5)
  let stereoSame = try writeCanonical("stereoSame", channels: [l, l])
  let (rs, ss, _) = try run(["type": "centerCut"], on: stereoSame, start: 0, end: nil)
  check("centerCut removes an identical centre", (rs["noop"] as? Bool) == false && rms(ss, from: 0, to: 2) < 0.001, "\(rms(ss, from: 0, to: 2))")

  let stereoOpposite = try writeCanonical("stereoOpposite", channels: [l, l.map { -$0 }])
  let (_, so, _) = try run(["type": "centerCut"], on: stereoOpposite, start: 0, end: nil)
  check("centerCut keeps the sides", approx(Double(rms(so, from: 0, to: 2)), Double(toneRms), tolerance: 0.005), "\(rms(so, from: 0, to: 2))")
}

// MARK: - other input formats

do {
  print("input formats")
  let wav = try writeCanonical("telephony", channels: [tone(seconds: 5, frequency: 440, amplitude: 0.5, rate: 8000)], rate: 8000, fileType: "wav")
  let (r, s, _) = try run(["type": "silence"], on: wav, start: 1, end: 2)
  check("8 kHz WAV is read and written at 48 kHz", (r["sampleRate"] as? Int) == 48000 && approx(duration(r), 5, tolerance: 0.01), "\(duration(r))")
  check("8 kHz WAV keeps its content", approx(Double(rms(s, from: 3, to: 4)), Double(toneRms), tolerance: 0.02) && rms(s, from: 1.01, to: 1.99) == 0, "\(rms(s, from: 3, to: 4))")
  let out = try readAll(r["outputPath"] as! String)
  check("output file rate is canonical", out.rate == 48000)
}

// MARK: - preview

do {
  print("preview")
  let parsed = try AttoRangeOp.parse(["type": "amplify", "gainDb": 6])
  let request = AttoRangeRequest(inputPath: input.path, startSec: 1, endSec: 4, op: parsed, jobId: nil, progress: nil)
  let started = Date()
  let r = try AttoRangeProcessor.preview(request, previewSec: 2)
  timings.append(("preview amplify", Int(Date().timeIntervalSince(started) * 1000)))
  let s = try readAll(r["outputPath"] as! String).samples
  check("preview is context plus previewSec", approx(duration(r), 3, tolerance: 0.001), "\(duration(r))")
  check("preview context is dry", approx(Double(rms(s, from: 0, to: 1)), Double(toneRms), tolerance: 0.005))
  check("preview range is processed", approx(Double(rms(s, from: 1, to: 2)) / Double(toneRms), 1.995, tolerance: 0.03), "\(rms(s, from: 1, to: 2))")

  let r2 = try AttoRangeProcessor.preview(request, previewSec: 5)
  check("preview never exceeds the range", approx(duration(r2), 4, tolerance: 0.001), "\(duration(r2))")

  let removeReq = AttoRangeRequest(inputPath: input.path, startSec: 1, endSec: 4, op: .remove, jobId: nil, progress: nil)
  let r3 = try AttoRangeProcessor.preview(removeReq, previewSec: 5)
  check("remove preview is the splice", approx(duration(r3), 2, tolerance: 0.001), "\(duration(r3))")

  let trimReq = AttoRangeRequest(inputPath: input.path, startSec: 1, endSec: 4, op: .trim, jobId: nil, progress: nil)
  let r4 = try AttoRangeProcessor.preview(trimReq, previewSec: 2)
  check("trim preview is the head of the range", approx(duration(r4), 2, tolerance: 0.001), "\(duration(r4))")
}

// MARK: - peaks

do {
  print("peaks")
  let started = Date()
  let peaks = try AttoPeaks.peaks(inputPath: input.path, count: 10)
  timings.append(("getPeaks 10", Int(Date().timeIntervalSince(started) * 1000)))
  check("peaks has count buckets", peaks.count == 10)
  check("peaks sees the gap", peaks[4] < 0.001 && peaks[5] < 0.001, "\(peaks)")
  check("peaks sees the tone", peaks[0] > 0.49 && peaks[9] > 0.49 && peaks[0] <= 1, "\(peaks)")
  let cache = AttoPeaks.cacheFileURL(for: input, count: 10)!
  check("peaks are cached next to the file", FileManager.default.fileExists(atPath: cache.path), cache.path)
  let again = try AttoPeaks.peaks(inputPath: input.path, count: 10)
  check("cached peaks match", again == peaks)
  let many = try AttoPeaks.peaks(inputPath: input.path, count: 2000)
  check("peaks with many buckets", many.count == 2000 && many[1000] < 0.001 && many[10] > 0.49)
}

// MARK: - cancellation and progress

do {
  print("cancellation and progress")
  AttoProcessCancellation.shared.cancel("job-cancel")
  var code = ""
  do {
    _ = try run(["type": "amplify", "gainDb": 3], on: input, start: 0, end: nil, jobId: "job-cancel")
  } catch let error as AttoProcessError {
    code = error.code
  }
  check("cancelled job rejects with ERR_PROCESS_CANCELLED", code == AttoProcessError.cancelled, code)
  check("cancel flag is cleared afterwards", !AttoProcessCancellation.shared.isCancelled("job-cancel"))

  var events: [Double] = []
  let started = Date()
  _ = try run(["type": "normalize"], on: input, start: 0, end: nil, jobId: "job-progress") { _, p in events.append(p) }
  let elapsed = Date().timeIntervalSince(started)
  check("progress ends at 1", events.last == 1, "\(events)")
  check("progress is monotonic", zip(events, events.dropFirst()).allSatisfy { $0 <= $1 }, "\(events)")
  check("progress is throttled to 10 per second", Double(events.count) <= elapsed * 10 + 2, "\(events.count) events in \(elapsed) s")
}

// MARK: - bad input

do {
  print("validation")
  var code = ""
  do { _ = try AttoRangeOp.parse(["type": "nope"]) } catch let e as AttoProcessError { code = e.code }
  check("unknown op is ERR_PROCESS_OP", code == AttoProcessError.badOp)
  code = ""
  do { _ = try run(["type": "silence"], on: input, start: 3, end: 2) } catch let e as AttoProcessError { code = e.code }
  check("inverted range is ERR_PROCESS_RANGE", code == AttoProcessError.badRange)
  code = ""
  do { _ = try run(["type": "silence"], on: workDir.appendingPathComponent("missing.caf"), start: 0, end: nil) } catch let e as AttoProcessError { code = e.code }
  check("missing file is ERR_PROCESS_INPUT", code == AttoProcessError.input)
}

print("")
print("timings on the 5 second file (ms):")
for (name, ms) in timings {
  print("  \(name.padding(toLength: 18, withPad: " ", startingAt: 0)) \(ms)")
}
print("")
print("\(passed) passed, \(failed) failed")
try? FileManager.default.removeItem(at: workDir)
exit(failed == 0 ? 0 : 1)
