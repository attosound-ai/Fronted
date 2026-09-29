import ActivityKit
import ExpoModulesCore
import UIKit

/**
 * Starts, updates and ends the "post on its way out" Live Activity
 * (targets/publish-activity). Every call is a no op below iOS 16.2 or when
 * the person turned Live Activities off: the in app strip still says it all.
 */
public class AttoLiveActivityModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AttoLiveActivity")

    Function("isSupported") { () -> Bool in
      if #available(iOS 16.2, *) {
        return ActivityAuthorizationInfo().areActivitiesEnabled
      }
      return false
    }

    AsyncFunction("start") {
      (thumbnailUri: String?, kind: String, progress: Double, phase: String, message: String)
        -> String? in
      guard #available(iOS 16.2, *), ActivityAuthorizationInfo().areActivitiesEnabled else {
        return nil
      }
      let attributes = AttoPublishAttributes(thumbnail: Self.tinyJpeg(thumbnailUri), kind: kind)
      let state = AttoPublishAttributes.ContentState(
        progress: progress, phase: phase, message: message)
      let activity = try Activity.request(
        attributes: attributes,
        content: ActivityContent(state: state, staleDate: nil),
        pushType: nil)
      return activity.id
    }

    AsyncFunction("update") {
      (id: String, progress: Double, phase: String, message: String) in
      guard #available(iOS 16.2, *),
        let activity = Activity<AttoPublishAttributes>.activities.first(where: { $0.id == id })
      else { return }
      let state = AttoPublishAttributes.ContentState(
        progress: progress, phase: phase, message: message)
      await activity.update(ActivityContent(state: state, staleDate: nil))
    }

    AsyncFunction("end") {
      (id: String, phase: String, message: String, dismissAfterSeconds: Double) in
      guard #available(iOS 16.2, *),
        let activity = Activity<AttoPublishAttributes>.activities.first(where: { $0.id == id })
      else { return }
      let state = AttoPublishAttributes.ContentState(progress: 1, phase: phase, message: message)
      await activity.end(
        ActivityContent(state: state, staleDate: nil),
        dismissalPolicy: .after(Date().addingTimeInterval(max(0, dismissAfterSeconds))))
    }

    // Anything left from a run that died: the queue brings those posts back
    // as interrupted, so their activities must not linger.
    AsyncFunction("endAll") { () in
      guard #available(iOS 16.2, *) else { return }
      for activity in Activity<AttoPublishAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }
  }

  /// The post's thumbnail scaled to 60 by 106 pixels at low JPEG quality:
  /// about 2 KB, inside ActivityKit's 4 KB payload.
  static func tinyJpeg(_ uri: String?) -> Data? {
    guard let uri, !uri.isEmpty else { return nil }
    let url = uri.hasPrefix("file://") ? URL(string: uri) : URL(fileURLWithPath: uri)
    guard let url, let image = UIImage(contentsOfFile: url.path) else { return nil }
    let target = CGSize(width: 60, height: 106)
    let scale = max(target.width / image.size.width, target.height / image.size.height)
    let drawn = CGSize(width: image.size.width * scale, height: image.size.height * scale)
    let format = UIGraphicsImageRendererFormat()
    format.scale = 1
    let small = UIGraphicsImageRenderer(size: target, format: format).image { _ in
      image.draw(in: CGRect(
        x: (target.width - drawn.width) / 2, y: (target.height - drawn.height) / 2,
        width: drawn.width, height: drawn.height))
    }
    for quality in [0.5, 0.35, 0.2] {
      if let data = small.jpegData(compressionQuality: quality), data.count <= 2600 {
        return data
      }
    }
    return nil
  }
}
