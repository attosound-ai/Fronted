import ActivityKit
import Foundation

/**
 * One post on its way out. Duplicated in the app (modules/atto-live-activity)
 * and in the widget extension (targets/publish-activity): ActivityKit matches
 * the two by type name, so both copies must stay identical.
 */
public struct AttoPublishAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /// 0...1 over compression, upload and the create call.
    public var progress: Double
    /// uploading | posting | paused | posted | failed
    public var phase: String
    /// The line the Lock Screen and the expanded island show.
    public var message: String

    public init(progress: Double, phase: String, message: String) {
      self.progress = progress
      self.phase = phase
      self.message = message
    }
  }

  /// A tiny JPEG of the post (about 60 by 106 pixels), so the extension needs
  /// no App Group to show it. ActivityKit caps a payload at 4 KB.
  public var thumbnail: Data?
  /// video | reel | image | audio | text
  public var kind: String

  public init(thumbnail: Data?, kind: String) {
    self.thumbnail = thumbnail
    self.kind = kind
  }
}
