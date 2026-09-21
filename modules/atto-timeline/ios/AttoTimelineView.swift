import ExpoModulesCore
import UIKit

/**
 * The native timeline: a horizontal UIScrollView whose content is drawn with
 * Core Graphics (ruler, lanes, waveforms) plus thin CALayers for the overlays
 * that move often (playhead, selection line, selection range).
 *
 * Ownership rules, so JS and native never fight:
 *   scroll   native owns it; JS observes through onScroll and drives it with
 *            the scrollToMs view function.
 *   zoom     the pixelsPerSecond prop is the source of truth whenever it
 *            changes; a pinch applies the zoom natively first for smoothness,
 *            reports it through onZoom and ignores prop echoes until the
 *            pinch ends.
 *   playhead the prop is applied on every change; while followPlayhead is on
 *            and the prop keeps arriving, a display link extrapolates the
 *            position between updates and pages the scroll view so the
 *            playhead stays visible.
 *   gestures every gesture reports begin, update and end; the view draws its
 *            own live preview (range, ghost clip, shifted lane) and drops it as
 *            soon as the matching prop changes, or after a short grace period
 *            if JS never commits.
 */
final class AttoTimelineView: ExpoView, UIScrollViewDelegate, UIGestureRecognizerDelegate {
  // MARK: Events

  let onTap = EventDispatcher()
  let onDoubleTap = EventDispatcher()
  let onSelectionChange = EventDispatcher()
  let onClipMove = EventDispatcher()
  let onTrackDrag = EventDispatcher()
  let onZoom = EventDispatcher()
  let onScroll = EventDispatcher()
  let onPlayheadScrub = EventDispatcher()

  // MARK: Constants

  // A fingertip covers about 44 pt. At 12 and 14 the line and the range
  // edges were so thin that starting a range by hand almost never worked
  // (Sep 20 2026); half a fingertip on each side makes them grabbable.
  private static let selectionLineHitSlop: CGFloat = 24
  private static let rangeEdgeHitSlop: CGFloat = 24
  private static let clipLongPressSeconds: TimeInterval = 0.35
  private static let scrollEventInterval: TimeInterval = 1.0 / 30.0
  private static let liveStateGraceSeconds: TimeInterval = 0.45
  private static let playheadHeadWidth: CGFloat = 12
  private static let playheadHeadHeight: CGFloat = 7

  // MARK: Views and layers

  private let renderer = AttoTimelineRenderer()
  private let scrollView = UIScrollView()
  private let contentView = UIView()
  private let rulerCanvas: AttoTimelineCanvasView
  private var laneCanvases: [AttoTimelineCanvasView] = []

  private let selectionLineLayer = CALayer()
  private let selectionRangeLayer = CALayer()
  private let selectionHandleLeft = CALayer()
  private let selectionHandleRight = CALayer()
  private let playheadLayer = CALayer()
  private let playheadHeadLayer = CAShapeLayer()

  // MARK: Gesture recognizers

  private let tapRecognizer = UITapGestureRecognizer()
  private let doubleTapRecognizer = UITapGestureRecognizer()
  private let longPressRecognizer = UILongPressGestureRecognizer()
  private let panRecognizer = UIPanGestureRecognizer()
  private let pinchRecognizer = UIPinchGestureRecognizer()

  // MARK: Prop state

  private var playheadMs: Double = 0
  private var selectionLineMs: Double?
  private var selection: AttoTimelineSelection?
  private var followPlayhead = false
  private var needsContentRebuild = true
  private var needsFullRedraw = true

  // MARK: Live gesture state

  private enum PanMode {
    case scrub
    case createRange(trackIndex: Int, anchorMs: Double)
    case resizeRange(movingStart: Bool)
    case trackDrag(trackIndex: Int, minDeltaPx: CGFloat)
  }

  private var panMode: PanMode?
  private var liveSelection: AttoTimelineSelection?
  private var livePlayheadMs: Double?
  private var isPinching = false
  private var pinchStartPixelsPerSecond: CGFloat = 1
  private var pinchAnchorMs: Double = 0
  private var clipDragStartX: CGFloat = 0
  private var clipDragClip: AttoTimelineClip?
  private var liveStateTimer: Timer?
  private var haptics: UIImpactFeedbackGenerator?

  // MARK: Scroll event throttle

  private var lastScrollEventTime: CFTimeInterval = 0
  private var scrollEventPending = false

  // MARK: Playhead follow

  private var displayLink: CADisplayLink?
  private var lastPlayheadSample: (ms: Double, time: CFTimeInterval)?
  private var playheadVelocityMsPerSecond: Double = 0
  private var playheadSampleInterval: CFTimeInterval = 1
  /// Props arriving faster than this need no extrapolation (Reanimated
  /// animatedProps deliver one value per frame).
  private static let displayRateInterval: CFTimeInterval = 0.022

  // MARK: Init

  required init(appContext: AppContext? = nil) {
    rulerCanvas = AttoTimelineCanvasView(row: .ruler, renderer: renderer)
    super.init(appContext: appContext)
    clipsToBounds = true
    backgroundColor = renderer.colors.background

    scrollView.delegate = self
    scrollView.showsHorizontalScrollIndicator = false
    scrollView.showsVerticalScrollIndicator = false
    scrollView.isDirectionalLockEnabled = true
    scrollView.alwaysBounceVertical = false
    scrollView.alwaysBounceHorizontal = true
    scrollView.bounces = true
    scrollView.contentInsetAdjustmentBehavior = .never
    scrollView.delaysContentTouches = false
    scrollView.canCancelContentTouches = true
    scrollView.panGestureRecognizer.maximumNumberOfTouches = 1
    scrollView.decelerationRate = .normal
    scrollView.backgroundColor = renderer.colors.background
    addSubview(scrollView)

    contentView.backgroundColor = renderer.colors.background
    contentView.isOpaque = true
    scrollView.addSubview(contentView)
    contentView.addSubview(rulerCanvas)

    setupOverlays()
    setupGestures()
  }

  deinit {
    displayLink?.invalidate()
    liveStateTimer?.invalidate()
  }

  private func setupOverlays() {
    for layer in [selectionRangeLayer, selectionHandleLeft, selectionHandleRight, selectionLineLayer] {
      layer.zPosition = 10
      layer.isHidden = true
      contentView.layer.addSublayer(layer)
    }
    selectionRangeLayer.borderWidth = 1
    selectionHandleLeft.cornerRadius = 3
    selectionHandleRight.cornerRadius = 3
    playheadLayer.zPosition = 20
    playheadHeadLayer.zPosition = 21
    contentView.layer.addSublayer(playheadLayer)
    contentView.layer.addSublayer(playheadHeadLayer)
    applyOverlayColors()
  }

  private func applyOverlayColors() {
    let c = renderer.colors
    selectionLineLayer.backgroundColor = c.selectionLine.cgColor
    selectionRangeLayer.backgroundColor = c.selectionFill.cgColor
    selectionRangeLayer.borderColor = c.selectionBorder.cgColor
    selectionHandleLeft.backgroundColor = c.selectionBorder.cgColor
    selectionHandleRight.backgroundColor = c.selectionBorder.cgColor
    playheadLayer.backgroundColor = c.playhead.cgColor
    playheadHeadLayer.fillColor = c.playhead.cgColor
    backgroundColor = c.background
    scrollView.backgroundColor = c.background
    contentView.backgroundColor = c.background
  }

  private func setupGestures() {
    tapRecognizer.addTarget(self, action: #selector(handleTap(_:)))
    tapRecognizer.numberOfTapsRequired = 1
    tapRecognizer.delegate = self

    doubleTapRecognizer.addTarget(self, action: #selector(handleDoubleTap(_:)))
    doubleTapRecognizer.numberOfTapsRequired = 2
    doubleTapRecognizer.delegate = self

    longPressRecognizer.addTarget(self, action: #selector(handleLongPress(_:)))
    longPressRecognizer.minimumPressDuration = Self.clipLongPressSeconds
    longPressRecognizer.allowableMovement = 10
    longPressRecognizer.delegate = self

    panRecognizer.addTarget(self, action: #selector(handlePan(_:)))
    panRecognizer.maximumNumberOfTouches = 1
    panRecognizer.delegate = self

    pinchRecognizer.addTarget(self, action: #selector(handlePinch(_:)))
    pinchRecognizer.delegate = self

    // Priorities: a recognised long press or a classified pan wins over the
    // scroll view's own pan, which only starts once both have failed.
    scrollView.panGestureRecognizer.require(toFail: longPressRecognizer)
    scrollView.panGestureRecognizer.require(toFail: panRecognizer)
    panRecognizer.require(toFail: longPressRecognizer)

    for recognizer in [tapRecognizer, doubleTapRecognizer, longPressRecognizer, panRecognizer, pinchRecognizer] {
      scrollView.addGestureRecognizer(recognizer)
    }
  }

  // MARK: Prop setters (called by the module definition)

  func setTracks(_ records: [AttoTimelineTrackRecord]) {
    renderer.tracks = records.map { AttoTimelineTrack(id: $0.id, height: CGFloat(max(8, $0.height))) }
    renderer.geometry.laneHeights = renderer.tracks.map(\.height)
    renderer.setClips(renderer.clips)
    needsContentRebuild = true
  }

  func setClips(_ records: [AttoTimelineClipRecord]) {
    renderer.setClips(records.map(AttoTimelineClip.init(record:)))
    // A commit from JS ends any live clip or track preview.
    renderer.draggingClipId = nil
    renderer.draggingClipOffsetPx = 0
    renderer.laneDragOffsetPx.removeAll()
    needsFullRedraw = true
  }

  func setPixelsPerSecond(_ value: Double) {
    // Echoes of our own onZoom events during a pinch must not snap the view.
    if isPinching { return }
    let pps = clampZoom(CGFloat(value))
    guard pps != renderer.geometry.pixelsPerSecond else { return }
    let anchorX = bounds.midX
    let anchorMs = renderer.geometry.ms(forX: scrollView.contentOffset.x + anchorX)
    applyZoom(pps, anchorMs: anchorMs, anchorScreenX: anchorX)
  }

  /// Cheap on purpose: it moves two layers and never touches the canvases.
  /// Reanimated animatedProps may call it every frame; JS state may call it
  /// at 20 to 30 Hz, in which case the display link glides in between.
  func setPlayheadMs(_ value: Double) {
    let ms = max(0, value.isFinite ? value : 0)
    let now = CACurrentMediaTime()
    if let last = lastPlayheadSample, now - last.time > 0.001, now - last.time < 0.5 {
      playheadSampleInterval = now - last.time
      playheadVelocityMsPerSecond = (ms - last.ms) / (now - last.time)
    } else {
      playheadSampleInterval = 1
      playheadVelocityMsPerSecond = 0
    }
    lastPlayheadSample = (ms, now)
    playheadMs = ms
    livePlayheadMs = nil
    updateDisplayLinkState()
    // With the display link running the next tick places the line from this
    // sample; snapping here too would step backwards when JS lags a little.
    if displayLink == nil {
      layoutPlayhead(ms: ms)
      if followPlayhead { followPlayheadIfNeeded(ms: ms) }
    }
  }

  func setSelectionLineMs(_ value: Double?) {
    selectionLineMs = value.flatMap { $0.isFinite ? max(0, $0) : nil }
    layoutSelectionOverlays()
  }

  func setSelection(_ record: AttoTimelineSelectionRecord?) {
    selection = record.map(AttoTimelineSelection.init(record:))
    liveSelection = nil
    layoutSelectionOverlays()
  }

  /// "timecode" (default) or "second", the two markers SoundLab offers.
  func setRulerFormat(_ value: String) {
    let seconds = value == "second"
    guard renderer.secondsRuler != seconds else { return }
    renderer.secondsRuler = seconds
    needsContentRebuild = true
  }

  func setRulerHeight(_ value: Double) {
    renderer.geometry.rulerHeight = CGFloat(max(0, value))
    needsContentRebuild = true
  }

  func setLeftInset(_ value: Double) {
    renderer.geometry.leftInset = CGFloat(max(0, value))
    needsContentRebuild = true
  }

  func setTrackGap(_ value: Double) {
    renderer.geometry.trackGap = CGFloat(max(0, value))
    needsContentRebuild = true
  }

  func setDurationMs(_ value: Double) {
    renderer.geometry.durationMs = max(0, value.isFinite ? value : 0)
    needsContentRebuild = true
  }

  func setColors(_ record: AttoTimelineColorsRecord?) {
    renderer.colors = AttoTimelineColors(record: record)
    applyOverlayColors()
    needsFullRedraw = true
  }

  func setFollowPlayhead(_ value: Bool) {
    followPlayhead = value
    updateDisplayLinkState()
  }

  /// Called once per props batch (OnViewDidUpdateProps).
  func propsDidUpdate() {
    if needsContentRebuild {
      rebuildContent()
    } else if needsFullRedraw {
      redrawAllCanvases()
    }
    needsContentRebuild = false
    needsFullRedraw = false
  }

  // MARK: View functions

  func scrollToMs(_ ms: Double, animated: Bool) {
    let target = renderer.geometry.px(forDurationMs: max(0, ms))
    scrollView.setContentOffset(CGPoint(x: clampOffsetX(target), y: 0), animated: animated)
    if !animated { emitScroll(force: true) }
  }

  func setZoom(_ pixelsPerSecond: Double, anchorMs: Double?) {
    let pps = clampZoom(CGFloat(pixelsPerSecond))
    let g = renderer.geometry
    let anchor: Double
    let anchorScreenX: CGFloat
    if let anchorMs, anchorMs.isFinite, anchorMs >= 0 {
      anchor = anchorMs
      let screenX = g.x(forMs: anchorMs) - scrollView.contentOffset.x
      // Keep the anchor where it is if it is on screen, else bring it to the centre.
      anchorScreenX = (screenX >= g.leftInset && screenX <= bounds.width) ? screenX : bounds.midX
    } else {
      anchorScreenX = bounds.midX
      anchor = g.ms(forX: scrollView.contentOffset.x + anchorScreenX)
    }
    applyZoom(pps, anchorMs: anchor, anchorScreenX: anchorScreenX)
    onZoom(["pixelsPerSecond": Double(pps), "anchorMs": anchor, "phase": "end"])
  }

  // MARK: Layout

  override func layoutSubviews() {
    super.layoutSubviews()
    if scrollView.frame != bounds {
      scrollView.frame = bounds
      needsContentRebuild = true
    }
    if renderer.geometry.viewportWidth != bounds.width {
      renderer.geometry.viewportWidth = bounds.width
      needsContentRebuild = true
    }
    if needsContentRebuild {
      rebuildContent()
      needsContentRebuild = false
      needsFullRedraw = false
    }
  }

  /// Sizes the scroll content, matches one canvas per lane and redraws.
  private func rebuildContent() {
    let g = renderer.geometry
    let contentSize = CGSize(width: g.contentWidth, height: max(g.totalHeight, 1))
    contentView.frame = CGRect(origin: .zero, size: contentSize)
    scrollView.contentSize = contentSize

    while laneCanvases.count > renderer.tracks.count {
      laneCanvases.removeLast().removeFromSuperview()
    }
    while laneCanvases.count < renderer.tracks.count {
      let canvas = AttoTimelineCanvasView(row: .lane(laneCanvases.count), renderer: renderer)
      contentView.addSubview(canvas)
      laneCanvases.append(canvas)
    }

    let clamped = clampOffsetX(scrollView.contentOffset.x)
    if clamped != scrollView.contentOffset.x {
      scrollView.contentOffset = CGPoint(x: clamped, y: 0)
    }
    layoutCanvases(force: true)
    layoutOverlays()
  }

  private func redrawAllCanvases() {
    rulerCanvas.setNeedsDisplay()
    for canvas in laneCanvases { canvas.setNeedsDisplay() }
  }

  private func redrawLane(_ index: Int) {
    guard index >= 0, index < laneCanvases.count else { return }
    laneCanvases[index].setNeedsDisplay()
  }

  /// Slides each canvas so it covers the visible rect, redrawing only the ones
  /// whose covered range no longer contains it. Lane windows are staggered so
  /// they do not all repaint on the same frame during a long pan.
  private func layoutCanvases(force: Bool) {
    let g = renderer.geometry
    let viewportWidth = max(1, bounds.width)
    // No overscan during a pinch: every frame repaints, so paint the minimum.
    let overscan: CGFloat = isPinching ? 0 : (viewportWidth * 0.5).rounded()
    let visibleMinX = max(0, scrollView.contentOffset.x)
    let visibleMaxX = min(g.contentWidth, visibleMinX + viewportWidth)

    placeCanvas(
      rulerCanvas, y: 0, height: g.rulerHeight, overscan: overscan, phase: 0,
      visibleMinX: visibleMinX, visibleMaxX: visibleMaxX, force: force)
    for (index, canvas) in laneCanvases.enumerated() {
      let phase = overscan > 0 ? CGFloat((index * 37) % Int(overscan)) - overscan / 2 : 0
      placeCanvas(
        canvas, y: g.laneTop(index), height: g.laneHeight(index), overscan: overscan, phase: phase,
        visibleMinX: visibleMinX, visibleMaxX: visibleMaxX, force: force)
    }
  }

  private func placeCanvas(
    _ canvas: AttoTimelineCanvasView, y: CGFloat, height: CGFloat, overscan: CGFloat, phase: CGFloat,
    visibleMinX: CGFloat, visibleMaxX: CGFloat, force: Bool
  ) {
    let current = canvas.frame
    let covers = current.minX <= visibleMinX && current.maxX >= visibleMaxX
      && current.origin.y == y && current.height == height
    if covers && !force { return }

    let contentWidth = renderer.geometry.contentWidth
    let viewportWidth = visibleMaxX - visibleMinX
    var minX = max(0, visibleMinX - overscan - phase)
    let width = min(viewportWidth + overscan * 2, contentWidth - minX)
    if minX + width < visibleMaxX { minX = max(0, visibleMaxX - width) }
    canvas.frame = CGRect(x: minX, y: y, width: max(1, width), height: max(1, height))
    canvas.setNeedsDisplay()
  }

  private func layoutOverlays() {
    layoutPlayhead(ms: livePlayheadMs ?? playheadMs)
    layoutSelectionOverlays()
  }

  private func layoutPlayhead(ms: Double) {
    let g = renderer.geometry
    let x = g.x(forMs: ms)
    withoutAnimation {
      playheadLayer.frame = CGRect(x: x - 1, y: 0, width: 2, height: max(1, g.totalHeight))
      let head = CGMutablePath()
      let hw = Self.playheadHeadWidth / 2
      head.move(to: CGPoint(x: x - hw, y: 0))
      head.addLine(to: CGPoint(x: x + hw, y: 0))
      head.addLine(to: CGPoint(x: x, y: Self.playheadHeadHeight))
      head.closeSubpath()
      playheadHeadLayer.path = head
    }
  }

  private var effectiveSelection: AttoTimelineSelection? { liveSelection ?? selection }

  private func layoutSelectionOverlays() {
    let g = renderer.geometry
    withoutAnimation {
      if let lineMs = selectionLineMs {
        let x = g.x(forMs: lineMs)
        selectionLineLayer.frame = CGRect(x: x - 1, y: g.rulerHeight, width: 2, height: max(0, g.lanesHeight))
        selectionLineLayer.isHidden = false
      } else {
        selectionLineLayer.isHidden = true
      }

      if let sel = effectiveSelection, sel.trackIndex < g.laneHeights.count {
        let pad = AttoTimelineGeometry.clipPadding
        let x0 = g.x(forMs: sel.startMs)
        let x1 = g.x(forMs: sel.endMs)
        let top = g.laneTop(sel.trackIndex) + pad
        let height = max(0, g.laneHeight(sel.trackIndex) - pad * 2)
        selectionRangeLayer.frame = CGRect(x: x0, y: top, width: max(2, x1 - x0), height: height)
        let handleSize = CGSize(width: 6, height: min(28, height * 0.6))
        let handleY = top + (height - handleSize.height) / 2
        selectionHandleLeft.frame = CGRect(
          x: x0 - handleSize.width / 2, y: handleY, width: handleSize.width, height: handleSize.height)
        selectionHandleRight.frame = CGRect(
          x: x1 - handleSize.width / 2, y: handleY, width: handleSize.width, height: handleSize.height)
        selectionRangeLayer.isHidden = false
        selectionHandleLeft.isHidden = false
        selectionHandleRight.isHidden = false
      } else {
        selectionRangeLayer.isHidden = true
        selectionHandleLeft.isHidden = true
        selectionHandleRight.isHidden = true
      }
    }
  }

  private func withoutAnimation(_ body: () -> Void) {
    CATransaction.begin()
    CATransaction.setDisableActions(true)
    body()
    CATransaction.commit()
  }

  // MARK: Zoom

  private func clampZoom(_ pps: CGFloat) -> CGFloat {
    guard pps.isFinite else { return renderer.geometry.pixelsPerSecond }
    return min(AttoTimelineGeometry.maxPixelsPerSecond, max(AttoTimelineGeometry.minPixelsPerSecond, pps))
  }

  private func clampOffsetX(_ x: CGFloat) -> CGFloat {
    let maxX = max(0, renderer.geometry.contentWidth - bounds.width)
    return min(maxX, max(0, x))
  }

  /// Applies a zoom keeping `anchorMs` under `anchorScreenX` (view coordinates).
  private func applyZoom(_ pps: CGFloat, anchorMs: Double, anchorScreenX: CGFloat) {
    renderer.geometry.pixelsPerSecond = pps
    let g = renderer.geometry
    let contentSize = CGSize(width: g.contentWidth, height: max(g.totalHeight, 1))
    contentView.frame = CGRect(origin: .zero, size: contentSize)
    scrollView.contentSize = contentSize
    let offset = clampOffsetX(g.x(forMs: anchorMs) - anchorScreenX)
    scrollView.contentOffset = CGPoint(x: offset, y: 0)
    layoutCanvases(force: true)
    layoutOverlays()
    emitScroll(force: false)
  }

  // MARK: Scroll delegate

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    layoutCanvases(force: false)
    emitScroll(force: false)
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    emitScroll(force: true)
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { emitScroll(force: true) }
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    emitScroll(force: true)
  }

  private func scrollPayload() -> [String: Any] {
    let g = renderer.geometry
    let offsetMs = g.ms(forPx: max(0, scrollView.contentOffset.x))
    let visibleMs = g.ms(forPx: max(0, bounds.width - g.leftInset))
    return ["offsetMs": offsetMs, "visibleMs": visibleMs]
  }

  private func emitScroll(force: Bool) {
    let now = CACurrentMediaTime()
    if force || now - lastScrollEventTime >= Self.scrollEventInterval {
      lastScrollEventTime = now
      scrollEventPending = false
      onScroll(scrollPayload())
      return
    }
    guard !scrollEventPending else { return }
    scrollEventPending = true
    let delay = Self.scrollEventInterval - (now - lastScrollEventTime)
    DispatchQueue.main.asyncAfter(deadline: .now() + max(0.001, delay)) { [weak self] in
      guard let self, self.scrollEventPending else { return }
      self.scrollEventPending = false
      self.lastScrollEventTime = CACurrentMediaTime()
      self.onScroll(self.scrollPayload())
    }
  }

  // MARK: Hit testing helpers (content coordinates)

  private func hitClip(at point: CGPoint) -> AttoTimelineClip? {
    guard let lane = renderer.geometry.laneIndex(forY: point.y) else { return nil }
    let g = renderer.geometry
    return renderer.clipsOnLane(lane).first { clip in
      let rect = g.clipRect(clip)
      return point.x >= rect.minX && point.x <= rect.maxX
    }
  }

  private func isOnRuler(_ point: CGPoint) -> Bool {
    point.y >= 0 && point.y < renderer.geometry.rulerHeight && point.x >= renderer.geometry.leftInset
  }

  private func rangeEdge(at point: CGPoint) -> Bool? {
    guard let sel = effectiveSelection, renderer.geometry.laneIndex(forY: point.y) == sel.trackIndex
    else { return nil }
    let g = renderer.geometry
    let x0 = g.x(forMs: sel.startMs)
    let x1 = g.x(forMs: sel.endMs)
    let dStart = abs(point.x - x0)
    let dEnd = abs(point.x - x1)
    if dStart <= Self.rangeEdgeHitSlop || dEnd <= Self.rangeEdgeHitSlop {
      return dStart <= dEnd
    }
    return nil
  }

  private func isOnSelectionLine(_ point: CGPoint) -> Bool {
    guard let lineMs = selectionLineMs, point.y >= renderer.geometry.rulerHeight else { return false }
    return abs(point.x - renderer.geometry.x(forMs: lineMs)) <= Self.selectionLineHitSlop
  }

  private func clampMs(_ ms: Double) -> Double {
    max(0, ms.isFinite ? ms : 0)
  }

  /// JS receives null (not undefined) when no clip sits under the point.
  private func clipIdPayload(at point: CGPoint) -> Any {
    if let clip = hitClip(at: point) { return clip.id }
    return NSNull()
  }

  // MARK: Gesture delegate

  override func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    if gestureRecognizer === longPressRecognizer {
      let point = longPressRecognizer.location(in: contentView)
      return hitClip(at: point) != nil
    }
    if gestureRecognizer === panRecognizer {
      let translation = panRecognizer.translation(in: contentView)
      let location = panRecognizer.location(in: contentView)
      let start = CGPoint(x: location.x - translation.x, y: location.y - translation.y)
      panMode = classifyPan(start: start, translation: translation)
      return panMode != nil
    }
    return true
  }

  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
  ) -> Bool {
    // The pinch may start while the scroll view is already panning; it then
    // takes over by disabling the pan (see handlePinch).
    if gestureRecognizer === pinchRecognizer {
      return other === scrollView.panGestureRecognizer
    }
    // A single tap and a double tap both fire, JS gets onTap then onDoubleTap.
    if gestureRecognizer === tapRecognizer && other === doubleTapRecognizer { return true }
    if gestureRecognizer === doubleTapRecognizer && other === tapRecognizer { return true }
    return false
  }

  private func classifyPan(start: CGPoint, translation: CGPoint) -> PanMode? {
    let g = renderer.geometry
    guard start.x >= g.leftInset else { return nil }
    if isOnRuler(start) { return .scrub }
    guard let lane = g.laneIndex(forY: start.y) else { return nil }

    if let movingStart = rangeEdge(at: start) {
      return .resizeRange(movingStart: movingStart)
    }
    if isOnSelectionLine(start), let lineMs = selectionLineMs {
      return .createRange(trackIndex: lane, anchorMs: lineMs)
    }
    // On a clip a plain pan scrolls; on empty lane space it shifts the lane's
    // clips, but only for a mostly horizontal drag so the outer vertical
    // scroll view keeps working, and only when there is something to move.
    if hitClip(at: start) != nil { return nil }
    let laneClips = renderer.clipsOnLane(lane)
    guard !laneClips.isEmpty, abs(translation.x) > abs(translation.y) else { return nil }
    let minStartPx = laneClips.map { g.px(forDurationMs: $0.startMs) }.min() ?? 0
    return .trackDrag(trackIndex: lane, minDeltaPx: -minStartPx)
  }

  // MARK: Tap gestures

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended else { return }
    let point = recognizer.location(in: contentView)
    let g = renderer.geometry
    guard point.x >= g.leftInset else { return }
    if isOnRuler(point) {
      let ms = clampMs(g.ms(forX: point.x))
      livePlayheadMs = ms
      layoutPlayhead(ms: ms)
      scheduleLiveStateExpiry()
      onPlayheadScrub(["ms": ms, "phase": "begin"])
      onPlayheadScrub(["ms": ms, "phase": "end"])
      return
    }
    guard let lane = g.laneIndex(forY: point.y) else { return }
    let local = recognizer.location(in: self)
    onTap([
      "trackIndex": lane,
      "ms": clampMs(g.ms(forX: point.x)),
      "clipId": clipIdPayload(at: point),
      "x": Double(local.x),
      "y": Double(local.y),
    ])
  }

  @objc private func handleDoubleTap(_ recognizer: UITapGestureRecognizer) {
    guard recognizer.state == .ended else { return }
    let point = recognizer.location(in: contentView)
    let g = renderer.geometry
    guard point.x >= g.leftInset, let lane = g.laneIndex(forY: point.y) else { return }
    onDoubleTap([
      "trackIndex": lane,
      "ms": clampMs(g.ms(forX: point.x)),
      "clipId": clipIdPayload(at: point),
    ])
  }

  // MARK: Long press: move a clip

  @objc private func handleLongPress(_ recognizer: UILongPressGestureRecognizer) {
    let point = recognizer.location(in: contentView)
    let g = renderer.geometry
    switch recognizer.state {
    case .began:
      guard let clip = hitClip(at: point) else {
        recognizer.isEnabled = false
        recognizer.isEnabled = true
        return
      }
      clipDragClip = clip
      clipDragStartX = point.x
      renderer.draggingClipId = clip.id
      renderer.draggingClipOffsetPx = 0
      liveStateTimer?.invalidate()
      haptics = UIImpactFeedbackGenerator(style: .medium)
      haptics?.impactOccurred()
      redrawLane(clip.trackIndex)
      onClipMove(["clipId": clip.id, "startMs": clip.startMs, "phase": "begin"])
    case .changed:
      guard let clip = clipDragClip else { return }
      let minDx = -(g.x(forMs: clip.startMs) - g.leftInset)
      let dx = max(minDx, point.x - clipDragStartX)
      renderer.draggingClipOffsetPx = dx
      redrawLane(clip.trackIndex)
      onClipMove(["clipId": clip.id, "startMs": clampMs(clip.startMs + g.ms(forPx: dx)), "phase": "update"])
    case .ended, .cancelled, .failed:
      guard let clip = clipDragClip else { return }
      let dx = renderer.draggingClipOffsetPx
      clipDragClip = nil
      haptics = nil
      onClipMove(["clipId": clip.id, "startMs": clampMs(clip.startMs + g.ms(forPx: dx)), "phase": "end"])
      // The ghost stays until the clips prop commits, or the grace period ends.
      scheduleLiveStateExpiry()
    default:
      break
    }
  }

  // MARK: Pan: scrub, select, shift a lane

  @objc private func handlePan(_ recognizer: UIPanGestureRecognizer) {
    guard let mode = panMode else { return }
    let point = recognizer.location(in: contentView)
    let translation = recognizer.translation(in: contentView)
    let g = renderer.geometry
    let phase: String
    switch recognizer.state {
    case .began: phase = "begin"
    case .changed: phase = "update"
    case .ended, .cancelled, .failed: phase = "end"
    default: return
    }
    let isEnd = phase == "end"
    if recognizer.state == .began { liveStateTimer?.invalidate() }

    switch mode {
    case .scrub:
      let ms = clampMs(g.ms(forX: point.x))
      livePlayheadMs = ms
      layoutPlayhead(ms: ms)
      onPlayheadScrub(["ms": ms, "phase": phase])

    case .createRange(let trackIndex, let anchorMs):
      let ms = clampMs(g.ms(forX: point.x))
      let sel = AttoTimelineSelection(trackIndex: trackIndex, startMs: anchorMs, endMs: ms)
      liveSelection = sel
      layoutSelectionOverlays()
      onSelectionChange([
        "trackIndex": sel.trackIndex, "startMs": sel.startMs, "endMs": sel.endMs, "phase": phase,
      ])

    case .resizeRange(let movingStart):
      guard let base = effectiveSelection else { return }
      let ms = clampMs(g.ms(forX: point.x))
      let sel = movingStart
        ? AttoTimelineSelection(trackIndex: base.trackIndex, startMs: ms, endMs: base.endMs)
        : AttoTimelineSelection(trackIndex: base.trackIndex, startMs: base.startMs, endMs: ms)
      liveSelection = sel
      layoutSelectionOverlays()
      onSelectionChange([
        "trackIndex": sel.trackIndex, "startMs": sel.startMs, "endMs": sel.endMs, "phase": phase,
      ])

    case .trackDrag(let trackIndex, let minDeltaPx):
      let dx = max(minDeltaPx, translation.x)
      renderer.laneDragOffsetPx[trackIndex] = dx
      redrawLane(trackIndex)
      onTrackDrag(["trackIndex": trackIndex, "deltaMs": g.ms(forPx: dx), "phase": phase])
    }

    if isEnd {
      panMode = nil
      scheduleLiveStateExpiry()
    }
  }

  // MARK: Pinch: zoom around the fingers

  @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    let g = renderer.geometry
    let centerInView = recognizer.location(in: self)
    switch recognizer.state {
    case .began:
      isPinching = true
      // Cancel any scroll pan in flight so the offset has one owner.
      scrollView.panGestureRecognizer.isEnabled = false
      scrollView.panGestureRecognizer.isEnabled = true
      pinchStartPixelsPerSecond = g.pixelsPerSecond
      pinchAnchorMs = clampMs(g.ms(forX: scrollView.contentOffset.x + centerInView.x))
      onZoom(["pixelsPerSecond": Double(g.pixelsPerSecond), "anchorMs": pinchAnchorMs, "phase": "begin"])
    case .changed:
      let pps = clampZoom(pinchStartPixelsPerSecond * recognizer.scale)
      applyZoom(pps, anchorMs: pinchAnchorMs, anchorScreenX: centerInView.x)
      onZoom(["pixelsPerSecond": Double(pps), "anchorMs": pinchAnchorMs, "phase": "update"])
    case .ended, .cancelled, .failed:
      isPinching = false
      layoutCanvases(force: true)
      onZoom(["pixelsPerSecond": Double(g.pixelsPerSecond), "anchorMs": pinchAnchorMs, "phase": "end"])
    default:
      break
    }
  }

  // MARK: Live state expiry

  /// Live previews (range, ghost, shifted lane, scrubbed playhead) normally
  /// end when JS commits the matching prop; this is the safety net if it never does.
  private func scheduleLiveStateExpiry() {
    liveStateTimer?.invalidate()
    liveStateTimer = Timer.scheduledTimer(withTimeInterval: Self.liveStateGraceSeconds, repeats: false) {
      [weak self] _ in
      guard let self, self.panMode == nil, self.clipDragClip == nil else { return }
      var lanesToRedraw = Set(self.renderer.laneDragOffsetPx.keys)
      if let id = self.renderer.draggingClipId, let clip = self.renderer.clip(withId: id) {
        lanesToRedraw.insert(clip.trackIndex)
      }
      self.renderer.draggingClipId = nil
      self.renderer.draggingClipOffsetPx = 0
      self.renderer.laneDragOffsetPx.removeAll()
      for lane in lanesToRedraw { self.redrawLane(lane) }
      self.liveSelection = nil
      self.livePlayheadMs = nil
      self.layoutOverlays()
    }
  }

  // MARK: Playhead follow (display link)

  private func updateDisplayLinkState() {
    let shouldRun = followPlayhead && playheadVelocityMsPerSecond > 0 && window != nil
      && playheadSampleInterval > Self.displayRateInterval
    if shouldRun && displayLink == nil {
      let link = CADisplayLink(target: self, selector: #selector(displayLinkTick(_:)))
      link.add(to: .main, forMode: .common)
      displayLink = link
    } else if !shouldRun, let link = displayLink {
      link.invalidate()
      displayLink = nil
    }
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateDisplayLinkState()
  }

  @objc private func displayLinkTick(_ link: CADisplayLink) {
    guard let sample = lastPlayheadSample else { return }
    let elapsed = CACurrentMediaTime() - sample.time
    // Props stopped arriving (pause or stall): settle on the last value.
    if elapsed > 0.5 {
      playheadVelocityMsPerSecond = 0
      layoutPlayhead(ms: playheadMs)
      updateDisplayLinkState()
      return
    }
    guard livePlayheadMs == nil else { return }
    // Extrapolate a little ahead of the last sample so the line glides at
    // display rate instead of stepping at the JS update rate.
    let extrapolated = min(sample.ms + playheadVelocityMsPerSecond * elapsed, sample.ms + 250)
    layoutPlayhead(ms: extrapolated)
    followPlayheadIfNeeded(ms: extrapolated)
  }

  /// Pages the view when the playhead runs past the right edge, the way a DAW
  /// does, unless the user is holding or flinging the scroll view.
  private func followPlayheadIfNeeded(ms: Double) {
    guard followPlayhead, !scrollView.isTracking, !scrollView.isDecelerating, !isPinching else { return }
    let g = renderer.geometry
    let screenX = g.x(forMs: ms) - scrollView.contentOffset.x
    let leftEdge = g.leftInset
    let rightEdge = bounds.width - 24
    if screenX > rightEdge || screenX < leftEdge {
      let target = clampOffsetX(g.x(forMs: ms) - leftEdge - 16)
      scrollView.setContentOffset(CGPoint(x: target, y: 0), animated: false)
    }
  }
}
