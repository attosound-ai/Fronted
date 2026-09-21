import UIKit

/**
 * A window onto one row of the timeline (the ruler or a single lane). The
 * scroll content can be hundreds of thousands of points wide, so instead of
 * one giant backing store each row owns a canvas about two screens wide that
 * slides along with the visible rect and redraws only when the viewport
 * leaves the area it already painted.
 */
final class AttoTimelineCanvasView: UIView {
  enum Row {
    case ruler
    case lane(Int)
  }

  let row: Row
  weak var renderer: AttoTimelineRenderer?

  init(row: Row, renderer: AttoTimelineRenderer) {
    self.row = row
    self.renderer = renderer
    super.init(frame: .zero)
    isOpaque = true
    isUserInteractionEnabled = false
    contentScaleFactor = UIScreen.main.scale
    layer.contentsScale = UIScreen.main.scale
    // Drawing happens in content coordinates, so a frame move never needs a
    // redraw unless the covered range changed.
    contentMode = .redraw
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not supported") }

  override func draw(_ rect: CGRect) {
    guard let ctx = UIGraphicsGetCurrentContext(), let renderer else { return }
    // Translate so the renderer works in content coordinates.
    ctx.translateBy(x: -frame.origin.x, y: -frame.origin.y)
    let contentRect = rect.offsetBy(dx: frame.origin.x, dy: frame.origin.y)
    switch row {
    case .ruler:
      renderer.drawRuler(in: ctx, rect: contentRect)
    case .lane(let index):
      renderer.drawLane(index, in: ctx, rect: contentRect)
    }
  }
}
