import AVFoundation
import CallKit

/// ATTO (Oct 10 2026). One rule for every library that writes the shared
/// audio session: while CallKit holds a call that has not ended, the session
/// belongs to the call. The library skips its write and says so with the
/// `AttoAudioSessionWriteDenied` notification, which the app counts. The same
/// rule and notification live in expo-audio, expo-video and atto-recorder; see
/// front/docs/arquitectura/audio-y-reanudacion.md.
///
/// Why: on Oct 10 2026 a library write (category Playback) in the middle of a
/// call took its microphone away and the call ran 36 s in silence. Library
/// internal state (modes, recorder flags) keeps updating; only the
/// AVAudioSession write is skipped.
enum AttoCallSession {
  private static let observer = CXCallObserver()

  /// True when a call owns the session; posts the denial for `client` then.
  static func ownsSession(denying client: String) -> Bool {
    let live = observer.calls.contains { !$0.hasEnded }
    if live {
      NotificationCenter.default.post(
        name: Notification.Name("AttoAudioSessionWriteDenied"),
        object: nil,
        userInfo: ["client": client])
    }
    return live
  }
}
