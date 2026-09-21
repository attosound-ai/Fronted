import AVFoundation
import ExpoModulesCore

/**
 * Expo bridge for the studio take recorder. All the audio work lives in
 * AttoRecorderEngine; this file only marshals promises and events.
 *
 * Session ownership: during a phone call the Twilio custom audio device owns
 * the AVAudioSession, so JS asks `isSessionBusy()` first and passes
 * `allowDuringCall` explicitly. The module never fights the call for the
 * session on its own.
 */
public class AttoRecorderModule: Module {
  private let recorder = AttoRecorderEngine()

  public func definition() -> ModuleDefinition {
    Name("AttoRecorder")

    Events("AttoRecorderMeters", "AttoRecorderState", "AttoRecorderPreviewEnded")

    OnCreate {
      self.recorder.onMeters = { [weak self] body in
        self?.sendEvent("AttoRecorderMeters", body)
      }
      self.recorder.onState = { [weak self] body in
        self?.sendEvent("AttoRecorderState", body)
      }
      self.recorder.onPreviewEnded = { [weak self] body in
        self?.sendEvent("AttoRecorderPreviewEnded", body)
      }
    }

    OnDestroy {
      self.recorder.discard { _ in }
      self.recorder.disarm { _ in }
    }

    // Synchronous on purpose: cheap session reads the sheet needs before it opens.
    Function("isSessionBusy") { () -> Bool in
      AttoRecorderEngine.isSessionBusy()
    }

    Function("getSessionInfo") { () -> [String: Any] in
      AttoRecorderEngine.sessionInfo()
    }

    Function("getState") { () -> [String: Any] in
      self.recorder.snapshot()
    }

    AsyncFunction("requestPermission") { (promise: Promise) in
      AVAudioSession.sharedInstance().requestRecordPermission { granted in
        promise.resolve(granted)
      }
    }

    AsyncFunction("listInputs") { (promise: Promise) in
      promise.resolve(AttoRecorderEngine.listInputs())
    }

    AsyncFunction("setInput") { (id: String, promise: Promise) in
      self.recorder.setInput(id: id) { result in Self.settle(promise, result) }
    }

    AsyncFunction("listOutputs") { (promise: Promise) in
      promise.resolve(AttoRecorderEngine.listOutputs())
    }

    AsyncFunction("configure") { (options: [String: Any], promise: Promise) in
      self.recorder.configure(options) { result in Self.settle(promise, result) }
    }

    AsyncFunction("arm") { (options: [String: Any]?, promise: Promise) in
      let allow = AttoRecorderConfig.bool(options?["allowDuringCall"]) ?? false
      self.recorder.arm(allowDuringCall: allow) { result in Self.settle(promise, result) }
    }

    AsyncFunction("disarm") { (promise: Promise) in
      self.recorder.disarm { result in Self.settle(promise, result) }
    }

    AsyncFunction("start") { (options: [String: Any]?, promise: Promise) in
      let fromMs = AttoRecorderConfig.number(options?["fromMs"]) ?? 0
      let allow = AttoRecorderConfig.bool(options?["allowDuringCall"]) ?? false
      let outputPath = options?["outputPath"] as? String
      self.recorder.start(fromMs: fromMs, outputPath: outputPath, allowDuringCall: allow) { result in
        Self.settle(promise, result)
      }
    }

    AsyncFunction("pause") { (promise: Promise) in
      self.recorder.pause { result in Self.settle(promise, result) }
    }

    AsyncFunction("resume") { (promise: Promise) in
      self.recorder.resume { result in Self.settle(promise, result) }
    }

    AsyncFunction("stop") { (promise: Promise) in
      self.recorder.stop { result in Self.settle(promise, result) }
    }

    AsyncFunction("discard") { (promise: Promise) in
      self.recorder.discard { result in Self.settle(promise, result) }
    }

    AsyncFunction("previewPlay") { (path: String, promise: Promise) in
      self.recorder.previewPlay(path: path) { result in Self.settle(promise, result) }
    }

    AsyncFunction("previewStop") { (promise: Promise) in
      self.recorder.previewStop { result in Self.settle(promise, result) }
    }
  }

  private static func settle<T>(_ promise: Promise, _ result: Result<T, AttoRecorderError>) {
    switch result {
    case .success(let value):
      if T.self == Void.self {
        promise.resolve()
      } else {
        promise.resolve(value)
      }
    case .failure(let error):
      promise.reject(error.code, error.message)
    }
  }
}
