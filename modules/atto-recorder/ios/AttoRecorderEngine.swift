import AVFoundation
import Foundation

/**
 * Low latency take recorder for the studio sheet.
 *
 * Engine graph (every node after the input runs at 48 kHz mono float):
 *
 *   inputNode
 *     > inputGain (AVAudioMixerNode, outputVolume = gain in dB)
 *     > limiter (Apple PeakLimiter, bypassed when off)
 *     > recordMixer .... tap writes the take and meters the input
 *     > monitorMixer (outputVolume 0 or 1) > reverb (bypass or preset) > mainMixer
 *
 *   backing track and overdub stems (AVAudioPlayerNode) > mainMixer,
 *   and also > recordMixer when the backing is mixed into the recording.
 *
 *   recordMixer feeds mainMixer at a source volume of 0 so the engine pulls it
 *   every render cycle (the tap needs that) without anyone hearing it twice.
 *
 * Every public call lands on one serial queue. Taps run on the audio tap
 * thread and only touch the file, the meter accumulators (under a lock) and
 * the alignment counters that the queue sets before the taps are installed.
 */
final class AttoRecorderEngine: NSObject, AVAudioPlayerDelegate {
  static let sampleRate: Double = 48000
  static let meterIntervalMs: Int = 50
  static let tapBufferFrames: AVAudioFrameCount = 1024
  /// Silence floor reported to JS when a meter window is empty.
  static let silenceDb: Double = -120

  var onMeters: (([String: Any]) -> Void)?
  var onState: (([String: Any]) -> Void)?
  var onPreviewEnded: (([String: Any]) -> Void)?

  private let queue = DispatchQueue(label: "sound.atto.recorder", qos: .userInteractive)
  /// Recreated when the input node reports no hardware. An AVAudioEngine built
  /// before the session could record caches a zero sample rate input node for
  /// its whole life, and on a phone the app often creates this object long
  /// before the first take. Rebuilding the engine and its nodes is the only way
  /// to pick the microphone up.
  private var engine = AVAudioEngine()
  private var inputGain = AVAudioMixerNode()
  private var limiter: AVAudioUnitEffect
  private var recordMixer = AVAudioMixerNode()
  private var monitorMixer = AVAudioMixerNode()
  private var reverb = AVAudioUnitReverb()
  private let tapFormat = AVAudioFormat(
    standardFormatWithSampleRate: AttoRecorderEngine.sampleRate, channels: 1)!

  private struct PlayerSlot {
    let node: AVAudioPlayerNode
    let file: AVAudioFile
    let startMs: Double
    let gainLinear: Float
    let isBacking: Bool
  }

  private var players: [PlayerSlot] = []
  private var graphBuilt = false
  private var tapsInstalled = false
  private var pausedByUser = false
  private var needsRestartOnResume = false
  /// Route notifications also fire for our own session changes right after a
  /// start; a running engine younger than this window is left alone.
  private var lastEngineStart = Date.distantPast

  private(set) var state: AttoRecorderState = .idle
  private var config = AttoRecorderConfig()

  // Take file
  private var file: AVAudioFile?
  private var filePath: String?
  private var fromMs: Double = 0
  private var takeStartedAt: Double = 0

  // Written from the tap thread, read on the queue. Guarded by meterLock.
  private let meterLock = NSLock()
  private var framesWritten: Int64 = 0
  private var takePeak: Float = 0
  private var writing = false
  private var inPeak: Float = 0
  private var inSumSquares: Double = 0
  private var inCount: Int = 0
  private var outPeak: Float = 0
  private var outSumSquares: Double = 0
  private var outCount: Int = 0
  /// Host time the file's first frame must correspond to. Zero means no alignment.
  private var anchorHostTime: UInt64 = 0
  private var alignmentDone = true

  private var meterTimer: DispatchSourceTimer?
  private var savedSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
  private var observers: [NSObjectProtocol] = []
  private var preview: AVAudioPlayer?
  private var previewSavedSession: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?

  /// Apple's peak limiter, the one node that needs a component description.
  private static func makeLimiter() -> AVAudioUnitEffect {
    var desc = AudioComponentDescription()
    desc.componentType = kAudioUnitType_Effect
    desc.componentSubType = kAudioUnitSubType_PeakLimiter
    desc.componentManufacturer = kAudioUnitManufacturer_Apple
    return AVAudioUnitEffect(audioComponentDescription: desc)
  }

  override init() {
    limiter = AttoRecorderEngine.makeLimiter()
    super.init()
    registerObservers()
  }

  deinit {
    observers.forEach { NotificationCenter.default.removeObserver($0) }
  }

  // MARK: Session queries (synchronous, safe from any thread)

  /// True when something else owns the session: a call device (voice chat mode) or
  /// other audio playing. JS decides what to do with it.
  static func isSessionBusy() -> Bool {
    let session = AVAudioSession.sharedInstance()
    if session.isOtherAudioPlaying { return true }
    if session.mode == .voiceChat || session.mode == .videoChat { return true }
    return false
  }

  static func sessionInfo() -> [String: Any] {
    let session = AVAudioSession.sharedInstance()
    return [
      "category": session.category.rawValue,
      "mode": session.mode.rawValue,
      "otherAudioPlaying": session.isOtherAudioPlaying,
      "sampleRate": session.sampleRate,
      "ioBufferDurationMs": session.ioBufferDuration * 1000,
      "inputLatencyMs": session.inputLatency * 1000,
      "outputLatencyMs": session.outputLatency * 1000,
      "busy": isSessionBusy(),
    ]
  }

  static func listInputs() -> [[String: Any]] {
    let session = AVAudioSession.sharedInstance()
    let preferred = session.preferredInput?.uid
    let current = session.currentRoute.inputs.first?.uid
    return (session.availableInputs ?? []).map { port in
      [
        "id": port.uid,
        "name": port.portName,
        "type": port.portType.rawValue,
        "selected": port.uid == (preferred ?? current),
      ]
    }
  }

  static func listOutputs() -> [[String: Any]] {
    AVAudioSession.sharedInstance().currentRoute.outputs.map { port in
      ["id": port.uid, "name": port.portName, "type": port.portType.rawValue]
    }
  }

  // MARK: Public API (each call runs on the serial queue)

  func setInput(id: String, completion: @escaping (Result<Void, AttoRecorderError>) -> Void) {
    queue.async {
      let session = AVAudioSession.sharedInstance()
      guard let port = session.availableInputs?.first(where: { $0.uid == id }) else {
        completion(.failure(.input("No input with id \(id)")))
        return
      }
      do {
        try session.setPreferredInput(port)
        completion(.success(()))
      } catch {
        completion(.failure(.input(error.localizedDescription)))
      }
    }
  }

  func configure(_ dict: [String: Any], completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      let previous = self.config
      self.config = AttoRecorderConfig.merge(dict, into: previous)
      if self.graphBuilt {
        self.applyLiveParameters()
        // Sources are only rebuilt when the engine is armed and idle; changing
        // them mid take would break the alignment with the timeline.
        if self.state == .ready && self.sourcesChanged(from: previous, to: self.config) {
          self.detachPlayers()
          self.attachPlayers()
        }
      }
      completion(.success(self.snapshot()))
    }
  }

  /// Activates the session and starts the engine without writing, so meters
  /// and monitoring are live before the user taps record.
  func arm(allowDuringCall: Bool, completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      if self.state == .recording || self.state == .paused {
        completion(.success(self.snapshot()))
        return
      }
      do {
        try self.startEngineForUse(allowDuringCall: allowDuringCall)
        self.setState(.ready, reason: nil)
        completion(.success(self.snapshot()))
      } catch let error as AttoRecorderError {
        self.setState(.error, reason: error.message)
        completion(.failure(error))
      } catch {
        self.setState(.error, reason: error.localizedDescription)
        completion(.failure(.engine(error.localizedDescription)))
      }
    }
  }

  func disarm(completion: @escaping (Result<Void, AttoRecorderError>) -> Void) {
    queue.async {
      if self.state == .recording || self.state == .paused {
        completion(.failure(.state("Stop or discard the take before disarming")))
        return
      }
      self.tearDownEngine()
      self.restoreSession()
      self.setState(.idle, reason: nil)
      completion(.success(()))
    }
  }

  func start(fromMs: Double, outputPath: String?, allowDuringCall: Bool,
             completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      if self.state == .recording || self.state == .paused {
        completion(.failure(.state("A take is already in progress")))
        return
      }
      do {
        let path = try self.makeTakePath(outputPath)
        let url = URL(fileURLWithPath: path)
        try? FileManager.default.removeItem(at: url)
        let settings: [String: Any] = [
          AVFormatIDKey: kAudioFormatLinearPCM,
          AVSampleRateKey: AttoRecorderEngine.sampleRate,
          AVNumberOfChannelsKey: 1,
          AVLinearPCMBitDepthKey: 32,
          AVLinearPCMIsFloatKey: true,
          AVLinearPCMIsBigEndianKey: false,
          AVLinearPCMIsNonInterleaved: false,
        ]
        let newFile = try AVAudioFile(
          forWriting: url, settings: settings, commonFormat: .pcmFormatFloat32, interleaved: false)

        // Fresh engine run so the anchor time is exact for both the players and
        // the tap. The engine stops FIRST: removing a tap from a node while the
        // engine is running deadlocks the audio thread, which takes the whole
        // app with it (David's phone, Sep 19).
        if self.graphBuilt {
          self.engine.stop()
          self.removeTaps()
          self.stopPlayers()
        }
        try self.startEngineForUse(
          allowDuringCall: allowDuringCall, installMonitorTaps: false, installWritingTaps: true)

        self.file = newFile
        self.filePath = path
        self.fromMs = max(0, fromMs)
        self.pausedByUser = false
        self.needsRestartOnResume = false
        self.meterLock.lock()
        self.framesWritten = 0
        self.takePeak = 0
        self.meterLock.unlock()

        let anchor = self.launchSources(fromMs: self.fromMs)
        self.setTapAnchor(anchor)
        self.takeStartedAt = Date().timeIntervalSince1970 * 1000
        self.setState(.recording, reason: nil)
        completion(.success([
          "startedAt": self.takeStartedAt,
          "path": path,
          "fromMs": self.fromMs,
          "sampleRate": AttoRecorderEngine.sampleRate,
        ]))
      } catch let error as AttoRecorderError {
        self.file = nil
        self.setState(.error, reason: error.message)
        completion(.failure(error))
      } catch {
        self.file = nil
        self.setState(.error, reason: error.localizedDescription)
        completion(.failure(.engine(error.localizedDescription)))
      }
    }
  }

  func pause(completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      guard self.state == .recording else {
        completion(.failure(.state("Nothing to pause")))
        return
      }
      // engine.pause freezes the players and the tap on the same render cycle,
      // so the take and the timeline stay aligned across the gap.
      self.engine.pause()
      self.pausedByUser = true
      self.setState(.paused, reason: nil)
      completion(.success(self.snapshot()))
    }
  }

  func resume(completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      guard self.state == .paused else {
        completion(.failure(.state("Nothing to resume")))
        return
      }
      do {
        if self.needsRestartOnResume || !self.pausedByUser {
          try self.restartGraph(reason: nil)
        } else {
          try AVAudioSession.sharedInstance().setActive(true, options: [])
          try self.engine.start()
        }
        self.pausedByUser = false
        self.needsRestartOnResume = false
        self.setState(.recording, reason: nil)
        completion(.success(self.snapshot()))
      } catch let error as AttoRecorderError {
        self.setState(.error, reason: error.message)
        completion(.failure(error))
      } catch {
        self.setState(.error, reason: error.localizedDescription)
        completion(.failure(.engine(error.localizedDescription)))
      }
    }
  }

  func stop(completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      guard self.state == .recording || self.state == .paused, let path = self.filePath else {
        completion(.failure(.state("No take in progress")))
        return
      }
      self.tearDownEngine()
      self.restoreSession()
      self.meterLock.lock()
      let frames = self.framesWritten
      let peak = self.takePeak
      self.meterLock.unlock()
      self.file = nil  // releasing the AVAudioFile closes and flushes it
      let durationMs = Double(frames) / AttoRecorderEngine.sampleRate * 1000
      self.setState(.stopped, reason: nil)
      completion(.success([
        "path": path,
        "durationMs": durationMs,
        "peakDb": AttoRecorderEngine.toDb(peak),
        "sampleRate": AttoRecorderEngine.sampleRate,
        "fromMs": self.fromMs,
        "frames": frames,
      ]))
    }
  }

  func discard(completion: @escaping (Result<Void, AttoRecorderError>) -> Void) {
    queue.async {
      if self.state == .recording || self.state == .paused {
        self.tearDownEngine()
        self.restoreSession()
      }
      self.file = nil
      if let path = self.filePath {
        try? FileManager.default.removeItem(atPath: path)
      }
      self.filePath = nil
      self.setState(self.engine.isRunning ? .ready : .idle, reason: nil)
      completion(.success(()))
    }
  }

  func previewPlay(path: String, completion: @escaping (Result<[String: Any], AttoRecorderError>) -> Void) {
    queue.async {
      if self.state == .recording || self.state == .paused {
        completion(.failure(.state("Stop the take before previewing")))
        return
      }
      self.preview?.stop()
      self.preview = nil
      let session = AVAudioSession.sharedInstance()
      // While armed the engine owns the session; only an idle recorder swaps the
      // category, because a category change would restart the input graph.
      if !AttoRecorderEngine.isSessionBusy() && !self.engine.isRunning {
        if self.previewSavedSession == nil {
          self.previewSavedSession = (session.category, session.mode, session.categoryOptions)
        }
        try? session.setCategory(.playback, mode: .default, options: [])
        try? session.setActive(true, options: [])
      }
      do {
        let player = try AVAudioPlayer(contentsOf: URL(fileURLWithPath: path))
        player.delegate = self
        player.prepareToPlay()
        guard player.play() else {
          completion(.failure(.file("Preview could not start")))
          return
        }
        self.preview = player
        completion(.success(["durationMs": player.duration * 1000]))
      } catch {
        completion(.failure(.file(error.localizedDescription)))
      }
    }
  }

  func previewStop(completion: @escaping (Result<Void, AttoRecorderError>) -> Void) {
    queue.async {
      self.preview?.stop()
      self.preview = nil
      self.restorePreviewSession()
      completion(.success(()))
    }
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    queue.async {
      if self.preview === player { self.preview = nil }
      self.restorePreviewSession()
      self.onPreviewEnded?(["finished": flag])
    }
  }

  func snapshot() -> [String: Any] {
    meterLock.lock()
    let frames = framesWritten
    meterLock.unlock()
    // The path key is left out entirely when there is no take, rather than
    // carrying a boxed nil through the value conversion.
    var body: [String: Any] = [
      "state": state.rawValue,
      "elapsedMs": Double(frames) / AttoRecorderEngine.sampleRate * 1000,
      "monitoring": config.monitoring,
      "inputGainDb": config.inputGainDb,
      "limiter": config.limiter,
      "monitorReverb": config.monitorReverb,
      "monitorReverbPreset": config.monitorReverbPreset,
      "backingTrackVolume": config.backingTrackVolume,
      "mixBackingIntoRecording": config.mixBackingIntoRecording,
      "engineRunning": engine.isRunning,
      "hardwareSampleRate": engine.inputNode.outputFormat(forBus: 0).sampleRate,
    ]
    if let path = filePath { body["path"] = path }
    return body
  }

  // MARK: Session

  private func activateSession(allowDuringCall: Bool) throws {
    if !allowDuringCall && AttoRecorderEngine.isSessionBusy() {
      throw AttoRecorderError.busy("The audio session is owned by a call or other audio")
    }
    let session = AVAudioSession.sharedInstance()
    if savedSession == nil {
      savedSession = (session.category, session.mode, session.categoryOptions)
    }
    let mode: AVAudioSession.Mode = config.monitoring ? .default : .measurement
    do {
      try session.setCategory(
        .playAndRecord, mode: mode,
        options: [.defaultToSpeaker, .allowBluetoothHFP, .allowBluetoothA2DP])
      try? session.setPreferredSampleRate(AttoRecorderEngine.sampleRate)
      try? session.setPreferredIOBufferDuration(0.005)
      try session.setActive(true, options: [])
    } catch {
      throw AttoRecorderError.session(error.localizedDescription)
    }
  }

  private func restoreSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setActive(false, options: [.notifyOthersOnDeactivation])
    if let saved = savedSession {
      if session.category != saved.0 || session.mode != saved.1 || session.categoryOptions != saved.2 {
        try? session.setCategory(saved.0, mode: saved.1, options: saved.2)
      }
      savedSession = nil
    }
  }

  private func restorePreviewSession() {
    guard let saved = previewSavedSession else { return }
    let session = AVAudioSession.sharedInstance()
    try? session.setActive(false, options: [.notifyOthersOnDeactivation])
    try? session.setCategory(saved.0, mode: saved.1, options: saved.2)
    previewSavedSession = nil
  }

  // MARK: Engine lifecycle

  /// Session first (Bluetooth routes need it before the engine reads the hardware
  /// format), then the graph, then start. Idempotent while already running.
  private func startEngineForUse(
    allowDuringCall: Bool, installMonitorTaps: Bool = true, installWritingTaps: Bool = false
  ) throws {
    try activateSession(allowDuringCall: allowDuringCall)
    if !graphBuilt {
      try buildGraph()
    } else if !engine.isRunning {
      try reconnectInput()
    }
    applyLiveParameters()
    if players.isEmpty { attachPlayers() }
    // Taps go on while the engine is stopped. Installing or removing a tap on a
    // running engine can deadlock the audio thread.
    if !tapsInstalled && (installWritingTaps || installMonitorTaps) {
      installTaps(anchorHostTime: 0, writing: installWritingTaps)
    }
    if !engine.isRunning {
      engine.prepare()
      do {
        try engine.start()
        lastEngineStart = Date()
      } catch {
        throw AttoRecorderError.engine(error.localizedDescription)
      }
    }
    startMeterTimer()
  }

  /// Drops the engine and every node attached to it and builds fresh ones. A
  /// node cannot move between engines, so the nodes are recreated too. Only
  /// safe while nothing is recording, which is the only place this is called.
  private func rebuildEngineObjects() {
    stopMeterTimer()
    if engine.isRunning { engine.stop() }
    for slot in players { slot.node.stop() }
    players.removeAll()
    tapsInstalled = false
    graphBuilt = false
    engine = AVAudioEngine()
    inputGain = AVAudioMixerNode()
    limiter = AttoRecorderEngine.makeLimiter()
    recordMixer = AVAudioMixerNode()
    monitorMixer = AVAudioMixerNode()
    reverb = AVAudioUnitReverb()
  }

  private func buildGraph() throws {
    var input = engine.inputNode
    var hardware = input.outputFormat(forBus: 0)
    if hardware.sampleRate <= 0 || hardware.channelCount == 0 {
      // The cached input node predates the record capable session. Start over
      // with a fresh engine and fresh nodes, which queries the hardware again.
      rebuildEngineObjects()
      input = engine.inputNode
      hardware = input.outputFormat(forBus: 0)
    }
    guard hardware.sampleRate > 0, hardware.channelCount > 0 else {
      throw AttoRecorderError.input("No audio input is available on this route")
    }
    engine.attach(inputGain)
    engine.attach(limiter)
    engine.attach(recordMixer)
    engine.attach(monitorMixer)
    engine.attach(reverb)

    let main = engine.mainMixerNode
    engine.connect(input, to: inputGain, format: hardware)
    // inputGain is a mixer, so it also performs the rate conversion to 48 kHz mono
    // when the hardware runs at 44.1 kHz or delivers stereo.
    engine.connect(inputGain, to: limiter, format: tapFormat)
    engine.connect(
      limiter,
      to: [
        AVAudioConnectionPoint(node: recordMixer, bus: 0),
        AVAudioConnectionPoint(node: monitorMixer, bus: 0),
      ],
      fromBus: 0, format: tapFormat)
    engine.connect(recordMixer, to: main, format: tapFormat)
    engine.connect(monitorMixer, to: reverb, format: tapFormat)
    engine.connect(reverb, to: main, format: tapFormat)
    // Silent sink: the tap on recordMixer sees the full signal, the main mixer
    // receives it at zero so the monitor path is the only audible copy.
    recordMixer.volume = 0
    if let destination = recordMixer.destination(forMixer: main, bus: 0) {
      destination.volume = 0
    }
    configureLimiter()
    graphBuilt = true
  }

  /// After a route change the hardware format can differ, so the first hop is
  /// reconnected with whatever the input node reports now.
  private func reconnectInput() throws {
    let input = engine.inputNode
    let hardware = input.outputFormat(forBus: 0)
    guard hardware.sampleRate > 0, hardware.channelCount > 0 else {
      throw AttoRecorderError.input("No audio input is available on this route")
    }
    engine.disconnectNodeOutput(input)
    engine.connect(input, to: inputGain, format: hardware)
  }

  private func configureLimiter() {
    let unit = limiter.audioUnit
    AudioUnitSetParameter(unit, kLimiterParam_AttackTime, kAudioUnitScope_Global, 0, 0.002, 0)
    AudioUnitSetParameter(unit, kLimiterParam_DecayTime, kAudioUnitScope_Global, 0, 0.05, 0)
    AudioUnitSetParameter(unit, kLimiterParam_PreGain, kAudioUnitScope_Global, 0, 0, 0)
  }

  /// Parameters that can change while the engine runs, all glitch free.
  private func applyLiveParameters() {
    inputGain.outputVolume = config.inputGainLinear
    limiter.bypass = !config.limiter
    monitorMixer.outputVolume = config.monitoring ? 1 : 0
    reverb.loadFactoryPreset(config.reverbPreset)
    reverb.wetDryMix = Float(config.monitorReverbMix)
    reverb.bypass = !config.monitorReverb
    for slot in players {
      slot.node.volume = slot.isBacking ? Float(config.backingTrackVolume) * slot.gainLinear : slot.gainLinear
    }
  }

  private func sourcesChanged(from a: AttoRecorderConfig, to b: AttoRecorderConfig) -> Bool {
    if a.backingTrackPath != b.backingTrackPath { return true }
    if a.mixBackingIntoRecording != b.mixBackingIntoRecording { return true }
    if a.overdubs.count != b.overdubs.count { return true }
    for (x, y) in zip(a.overdubs, b.overdubs) where x.path != y.path || x.startMs != y.startMs {
      return true
    }
    return false
  }

  private func attachPlayers() {
    var specs: [(String, Double, Float, Bool)] = []
    if let backing = config.backingTrackPath {
      specs.append((backing, 0, 1, true))
    }
    for stem in config.overdubs {
      specs.append((stem.path, stem.startMs, Float(pow(10.0, stem.gainDb / 20.0)), false))
    }
    let main = engine.mainMixerNode
    for (path, startMs, gain, isBacking) in specs {
      let url = URL(fileURLWithPath: path.replacingOccurrences(of: "file://", with: ""))
      guard let audioFile = try? AVAudioFile(forReading: url) else {
        NSLog("[AttoRecorder] source could not be opened: %@", path)
        continue
      }
      let node = AVAudioPlayerNode()
      engine.attach(node)
      var points = [AVAudioConnectionPoint(node: main, bus: main.nextAvailableInputBus)]
      if isBacking && config.mixBackingIntoRecording {
        points.append(AVAudioConnectionPoint(node: recordMixer, bus: recordMixer.nextAvailableInputBus))
      }
      engine.connect(node, to: points, fromBus: 0, format: audioFile.processingFormat)
      node.volume = isBacking ? Float(config.backingTrackVolume) * gain : gain
      players.append(PlayerSlot(node: node, file: audioFile, startMs: startMs, gainLinear: gain, isBacking: isBacking))
    }
  }

  private func stopPlayers() {
    for slot in players { slot.node.stop() }
  }

  private func detachPlayers() {
    for slot in players {
      slot.node.stop()
      engine.detach(slot.node)
    }
    players.removeAll()
  }

  /// Schedules every source so that timeline position `fromMs` plays at one
  /// shared anchor host time, and returns that anchor for the tap alignment.
  private func launchSources(fromMs: Double) -> UInt64 {
    let leadSeconds = 0.08
    let anchor = mach_absolute_time() + AttoRecorderEngine.hostTicks(seconds: leadSeconds)
    for slot in players {
      slot.node.stop()
      let rate = slot.file.processingFormat.sampleRate
      let total = slot.file.length
      let offsetMs = fromMs - slot.startMs
      if offsetMs >= 0 {
        let startFrame = AVAudioFramePosition(offsetMs / 1000 * rate)
        guard startFrame < total else { continue }
        slot.node.scheduleSegment(
          slot.file, startingFrame: startFrame, frameCount: AVAudioFrameCount(total - startFrame),
          at: nil, completionHandler: nil)
        slot.node.play(at: AVAudioTime(hostTime: anchor))
      } else {
        let delay = AttoRecorderEngine.hostTicks(seconds: -offsetMs / 1000)
        slot.node.scheduleFile(slot.file, at: nil, completionHandler: nil)
        slot.node.play(at: AVAudioTime(hostTime: anchor + delay))
      }
    }
    return anchor
  }

  /// Rebuilds the running graph after a route change or an interruption and
  /// continues the same take from the frame it stopped at.
  private func restartGraph(reason: String?) throws {
    let wasRecording = state == .recording || state == .paused
    engine.stop()
    removeTaps()
    stopPlayers()
    detachPlayers()
    try activateSession(allowDuringCall: true)
    try reconnectInput()
    applyLiveParameters()
    attachPlayers()
    // Taps before the engine runs; removing or adding one on a running engine
    // can deadlock the audio thread.
    let resuming = wasRecording && file != nil
    installTaps(anchorHostTime: 0, writing: resuming)
    engine.prepare()
    do {
      try engine.start()
      lastEngineStart = Date()
    } catch {
      throw AttoRecorderError.engine(error.localizedDescription)
    }
    if resuming {
      meterLock.lock()
      let frames = framesWritten
      meterLock.unlock()
      let positionMs = fromMs + Double(frames) / AttoRecorderEngine.sampleRate * 1000
      setTapAnchor(launchSources(fromMs: positionMs))
    }
    startMeterTimer()
  }

  private func tearDownEngine() {
    stopMeterTimer()
    engine.stop()
    removeTaps()
    stopPlayers()
    detachPlayers()
  }

  // MARK: Taps

  private func installTaps(anchorHostTime anchor: UInt64, writing shouldWrite: Bool) {
    let session = AVAudioSession.sharedInstance()
    // The user hears the backing after the output latency and the mic reaches the
    // tap after the input latency, so the file starts that much later than the
    // anchor to land exactly on the timeline.
    let latency = session.inputLatency + session.outputLatency
    meterLock.lock()
    anchorHostTime = anchor == 0 ? 0 : anchor + AttoRecorderEngine.hostTicks(seconds: latency)
    alignmentDone = anchor == 0
    writing = shouldWrite
    meterLock.unlock()

    limiter.installTap(onBus: 0, bufferSize: AttoRecorderEngine.tapBufferFrames, format: tapFormat) {
      [weak self] buffer, _ in
      self?.accumulateInput(buffer)
    }
    recordMixer.installTap(onBus: 0, bufferSize: AttoRecorderEngine.tapBufferFrames, format: tapFormat) {
      [weak self] buffer, when in
      self?.writeBuffer(buffer, at: when)
    }
    engine.mainMixerNode.installTap(onBus: 0, bufferSize: AttoRecorderEngine.tapBufferFrames, format: nil) {
      [weak self] buffer, _ in
      self?.accumulateOutput(buffer)
    }
    tapsInstalled = true
  }

  /// Moves the alignment anchor of taps that are already installed. Separate
  /// from installTaps so the blocks can go on before the engine starts.
  private func setTapAnchor(_ anchor: UInt64) {
    let session = AVAudioSession.sharedInstance()
    let latency = session.inputLatency + session.outputLatency
    meterLock.lock()
    anchorHostTime = anchor == 0 ? 0 : anchor + AttoRecorderEngine.hostTicks(seconds: latency)
    alignmentDone = anchor == 0
    meterLock.unlock()
  }

  private func removeTaps() {
    guard tapsInstalled else { return }
    limiter.removeTap(onBus: 0)
    recordMixer.removeTap(onBus: 0)
    engine.mainMixerNode.removeTap(onBus: 0)
    tapsInstalled = false
    meterLock.lock()
    writing = false
    meterLock.unlock()
  }

  private func writeBuffer(_ buffer: AVAudioPCMBuffer, at when: AVAudioTime) {
    meterLock.lock()
    let shouldWrite = writing
    let pendingAnchor = alignmentDone ? 0 : anchorHostTime
    meterLock.unlock()
    guard shouldWrite, let file = file, let data = buffer.floatChannelData else { return }

    var skip = 0
    if pendingAnchor != 0 {
      if when.isHostTimeValid {
        let frames = Double(buffer.frameLength)
        let bufferTicks = AttoRecorderEngine.hostTicks(seconds: frames / AttoRecorderEngine.sampleRate)
        if when.hostTime + bufferTicks <= pendingAnchor {
          return  // still before the anchor, nothing of this buffer belongs to the take
        }
        if pendingAnchor > when.hostTime {
          let ahead = AttoRecorderEngine.seconds(hostTicks: pendingAnchor - when.hostTime)
          skip = min(Int(buffer.frameLength), Int(ahead * AttoRecorderEngine.sampleRate))
        }
      }
      meterLock.lock()
      alignmentDone = true
      meterLock.unlock()
    }

    let count = Int(buffer.frameLength) - skip
    guard count > 0 else { return }
    let samples = data[0]
    var peak: Float = 0
    for i in skip..<(skip + count) {
      let v = abs(samples[i])
      if v > peak { peak = v }
    }

    do {
      if skip == 0 {
        try file.write(from: buffer)
      } else if let slice = AVAudioPCMBuffer(pcmFormat: buffer.format, frameCapacity: AVAudioFrameCount(count)),
        let out = slice.floatChannelData {
        out[0].update(from: samples + skip, count: count)
        slice.frameLength = AVAudioFrameCount(count)
        try file.write(from: slice)
      }
      meterLock.lock()
      framesWritten += Int64(count)
      if peak > takePeak { takePeak = peak }
      meterLock.unlock()
    } catch {
      NSLog("[AttoRecorder] write failed: %@", error.localizedDescription)
      meterLock.lock()
      writing = false
      meterLock.unlock()
      queue.async { self.setState(.error, reason: "write_failed") }
    }
  }

  private func accumulateInput(_ buffer: AVAudioPCMBuffer) {
    guard let data = buffer.floatChannelData else { return }
    let (peak, sumSquares, count) = AttoRecorderEngine.measure(data, channels: Int(buffer.format.channelCount), frames: Int(buffer.frameLength))
    meterLock.lock()
    if peak > inPeak { inPeak = peak }
    inSumSquares += sumSquares
    inCount += count
    meterLock.unlock()
  }

  private func accumulateOutput(_ buffer: AVAudioPCMBuffer) {
    guard let data = buffer.floatChannelData else { return }
    let (peak, sumSquares, count) = AttoRecorderEngine.measure(data, channels: Int(buffer.format.channelCount), frames: Int(buffer.frameLength))
    meterLock.lock()
    if peak > outPeak { outPeak = peak }
    outSumSquares += sumSquares
    outCount += count
    meterLock.unlock()
  }

  private static func measure(_ data: UnsafePointer<UnsafeMutablePointer<Float>>, channels: Int, frames: Int) -> (Float, Double, Int) {
    var peak: Float = 0
    var sum: Double = 0
    for ch in 0..<max(1, channels) {
      let samples = data[ch]
      for i in 0..<frames {
        let v = samples[i]
        let a = abs(v)
        if a > peak { peak = a }
        sum += Double(v * v)
      }
    }
    return (peak, sum, frames * max(1, channels))
  }

  // MARK: Meters

  private func startMeterTimer() {
    guard meterTimer == nil else { return }
    let timer = DispatchSource.makeTimerSource(queue: queue)
    timer.schedule(deadline: .now() + .milliseconds(AttoRecorderEngine.meterIntervalMs),
                   repeating: .milliseconds(AttoRecorderEngine.meterIntervalMs))
    timer.setEventHandler { [weak self] in self?.emitMeters() }
    timer.resume()
    meterTimer = timer
  }

  private func stopMeterTimer() {
    meterTimer?.cancel()
    meterTimer = nil
  }

  private func emitMeters() {
    guard engine.isRunning else { return }
    meterLock.lock()
    let ip = inPeak, isq = inSumSquares, ic = inCount
    let op = outPeak, osq = outSumSquares, oc = outCount
    let frames = framesWritten
    inPeak = 0; inSumSquares = 0; inCount = 0
    outPeak = 0; outSumSquares = 0; outCount = 0
    meterLock.unlock()
    let inRms = ic > 0 ? Float(sqrt(isq / Double(ic))) : 0
    let outRms = oc > 0 ? Float(sqrt(osq / Double(oc))) : 0
    onMeters?([
      "inputPeakDb": AttoRecorderEngine.toDb(ip),
      "inputRmsDb": AttoRecorderEngine.toDb(inRms),
      "outputPeakDb": AttoRecorderEngine.toDb(op),
      "outputRmsDb": AttoRecorderEngine.toDb(outRms),
      "elapsedMs": Double(frames) / AttoRecorderEngine.sampleRate * 1000,
      "state": state.rawValue,
    ])
  }

  static func toDb(_ linear: Float) -> Double {
    guard linear > 0 else { return silenceDb }
    return max(silenceDb, Double(20 * log10(linear)))
  }

  // MARK: Notifications

  private func registerObservers() {
    let center = NotificationCenter.default
    observers.append(center.addObserver(
      forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil
    ) { [weak self] note in
      self?.handleRouteChange(note)
    })
    observers.append(center.addObserver(
      forName: AVAudioSession.interruptionNotification, object: nil, queue: nil
    ) { [weak self] note in
      self?.handleInterruption(note)
    })
    observers.append(center.addObserver(
      // Not bound to one engine instance: the engine is rebuilt when the input
      // node is stale, and an observer tied to the old object would go deaf.
      forName: .AVAudioEngineConfigurationChange, object: nil, queue: nil
    ) { [weak self] _ in
      self?.handleConfigurationChange()
    })
  }

  private func handleRouteChange(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
      let reason = AVAudioSession.RouteChangeReason(rawValue: raw)
    else { return }
    switch reason {
    case .newDeviceAvailable, .oldDeviceUnavailable, .override, .routeConfigurationChange, .wakeFromSleep:
      queue.async { self.recoverGraph(reason: "route_change") }
    default:
      break
    }
  }

  private func handleConfigurationChange() {
    queue.async { self.recoverGraph(reason: "route_change") }
  }

  private func recoverGraph(reason: String) {
    if engine.isRunning && Date().timeIntervalSince(lastEngineStart) < 1.0 { return }
    switch state {
    case .recording, .ready:
      do {
        try restartGraph(reason: reason)
        setState(state, reason: reason)
      } catch let error as AttoRecorderError {
        setState(.error, reason: error.message)
      } catch {
        setState(.error, reason: error.localizedDescription)
      }
    case .paused:
      needsRestartOnResume = true
      setState(.paused, reason: reason)
    default:
      break
    }
  }

  private func handleInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
      let type = AVAudioSession.InterruptionType(rawValue: raw)
    else { return }
    queue.async {
      switch type {
      case .began:
        if self.state == .recording {
          self.pausedByUser = false
          self.needsRestartOnResume = true
          self.setState(.paused, reason: "interruption")
        } else if self.state == .ready {
          self.setState(.ready, reason: "interruption")
        }
      case .ended:
        if self.state == .ready {
          self.recoverGraph(reason: "interruption_ended")
        } else if self.state == .paused {
          self.setState(.paused, reason: "interruption_ended")
        }
      @unknown default:
        break
      }
    }
  }

  // MARK: Helpers

  private func setState(_ next: AttoRecorderState, reason: String?) {
    state = next
    var body: [String: Any] = ["state": next.rawValue]
    if let reason = reason { body["reason"] = reason }
    if let path = filePath { body["path"] = path }
    onState?(body)
  }

  private func makeTakePath(_ requested: String?) throws -> String {
    if let requested = requested, !requested.isEmpty {
      let clean = requested.replacingOccurrences(of: "file://", with: "")
      let dir = (clean as NSString).deletingLastPathComponent
      try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
      return clean
    }
    let dir = (NSTemporaryDirectory() as NSString).appendingPathComponent("atto-recorder")
    try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
    return (dir as NSString).appendingPathComponent("take-\(UUID().uuidString).caf")
  }

  private static let timebase: mach_timebase_info_data_t = {
    var info = mach_timebase_info_data_t()
    mach_timebase_info(&info)
    return info
  }()

  static func hostTicks(seconds: Double) -> UInt64 {
    let nanos = seconds * 1_000_000_000
    return UInt64(nanos * Double(timebase.denom) / Double(timebase.numer))
  }

  static func seconds(hostTicks: UInt64) -> Double {
    Double(hostTicks) * Double(timebase.numer) / Double(timebase.denom) / 1_000_000_000
  }
}
