import ExpoModulesCore

/**
 * Expo module exposing the native timeline view. Every prop is plain JSON
 * (times in milliseconds, lengths in points); see AttoTimelineView for the
 * ownership rules between JS state and native gesture previews.
 */
public class AttoTimelineModule: Module {
  public func definition() -> ModuleDefinition {
    Name("AttoTimeline")

    View(AttoTimelineView.self) {
      Events(
        "onTap",
        "onDoubleTap",
        "onSelectionChange",
        "onClipMove",
        "onTrackDrag",
        "onZoom",
        "onScroll",
        "onPlayheadScrub"
      )

      Prop("tracks") { (view: AttoTimelineView, tracks: [AttoTimelineTrackRecord]) in
        view.setTracks(tracks)
      }

      Prop("clips") { (view: AttoTimelineView, clips: [AttoTimelineClipRecord]) in
        view.setClips(clips)
      }

      Prop("pixelsPerSecond") { (view: AttoTimelineView, value: Double) in
        view.setPixelsPerSecond(value)
      }

      Prop("playheadMs") { (view: AttoTimelineView, value: Double) in
        view.setPlayheadMs(value)
      }

      Prop("selectionLineMs") { (view: AttoTimelineView, value: Double?) in
        view.setSelectionLineMs(value)
      }

      Prop("selection") { (view: AttoTimelineView, value: AttoTimelineSelectionRecord?) in
        view.setSelection(value)
      }

      Prop("rulerFormat") { (view: AttoTimelineView, value: String) in
        view.setRulerFormat(value)
      }

      Prop("rulerHeight") { (view: AttoTimelineView, value: Double) in
        view.setRulerHeight(value)
      }

      Prop("leftInset") { (view: AttoTimelineView, value: Double) in
        view.setLeftInset(value)
      }

      Prop("trackGap") { (view: AttoTimelineView, value: Double) in
        view.setTrackGap(value)
      }

      Prop("durationMs") { (view: AttoTimelineView, value: Double) in
        view.setDurationMs(value)
      }

      Prop("colors") { (view: AttoTimelineView, value: AttoTimelineColorsRecord?) in
        view.setColors(value)
      }

      Prop("followPlayhead") { (view: AttoTimelineView, value: Bool) in
        view.setFollowPlayhead(value)
      }

      OnViewDidUpdateProps { (view: AttoTimelineView) in
        view.propsDidUpdate()
      }

      // View functions, reachable from JS through the component ref.
      AsyncFunction("scrollToMs") { (view: AttoTimelineView, ms: Double, animated: Bool) in
        view.scrollToMs(ms, animated: animated)
      }

      AsyncFunction("setZoom") { (view: AttoTimelineView, pixelsPerSecond: Double, anchorMs: Double?) in
        view.setZoom(pixelsPerSecond, anchorMs: anchorMs)
      }
    }
  }
}
