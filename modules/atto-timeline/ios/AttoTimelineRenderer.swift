import UIKit

/**
 * Owns the timeline model, the per zoom peak cache and every Core Graphics
 * drawing routine. Canvas views ask it to draw a slice (in content
 * coordinates) of the ruler or of one lane; overlays (playhead, selection)
 * are separate layers and never go through here.
 *
 * Live gesture state (a clip being dragged, a whole track being shifted) is
 * kept here as pixel offsets so a drag only redraws the lane it touches.
 */
final class AttoTimelineRenderer {
  /// Ruler labels as plain seconds instead of minutes and seconds.
  var secondsRuler = false

  var geometry = AttoTimelineGeometry()
  var colors = AttoTimelineColors()
  var tracks: [AttoTimelineTrack] = []
  var clips: [AttoTimelineClip] = []

  /// Clips grouped by lane, sorted by start, rebuilt when `clips` is set.
  private(set) var clipsByLane: [[AttoTimelineClip]] = []

  /// Live clip move: the clip is drawn at its start plus this many points and
  /// the original spot keeps a dimmed copy until JS commits the new start.
  var draggingClipId: String?
  var draggingClipOffsetPx: CGFloat = 0

  /// Live track shift (pan on the empty part of a lane), in points per lane.
  var laneDragOffsetPx: [Int: CGFloat] = [:]

  // MARK: Peaks cache

  private struct PeaksCacheKey: Hashable {
    let clipId: String
    let bucket: Int
  }

  private struct PeaksCacheEntry {
    let signature: Int
    let peaks: [Float]
  }

  private var peaksCache: [PeaksCacheKey: PeaksCacheEntry] = [:]

  func setClips(_ newClips: [AttoTimelineClip]) {
    clips = newClips
    var byLane = [[AttoTimelineClip]](repeating: [], count: max(tracks.count, 0))
    for clip in newClips {
      while byLane.count <= clip.trackIndex { byLane.append([]) }
      byLane[clip.trackIndex].append(clip)
    }
    clipsByLane = byLane.map { $0.sorted { $0.startMs < $1.startMs } }
    // Drop cache rows whose clip disappeared or whose peaks changed.
    let signatures = Dictionary(newClips.map { ($0.id, $0.peaksSignature) }, uniquingKeysWith: { a, _ in a })
    peaksCache = peaksCache.filter { key, entry in
      signatures[key.clipId] == entry.signature
    }
  }

  func clipsOnLane(_ index: Int) -> [AttoTimelineClip] {
    index >= 0 && index < clipsByLane.count ? clipsByLane[index] : []
  }

  func clip(withId id: String) -> AttoTimelineClip? {
    clips.first { $0.id == id }
  }

  /// Zoom buckets are third octaves: one downsample serves every zoom within
  /// about 12 percent of the bucket's representative pixelsPerSecond.
  private func zoomBucket(_ pixelsPerSecond: CGFloat) -> Int {
    Int((log2(Double(max(1, pixelsPerSecond))) * 3).rounded())
  }

  private func representativePixelsPerSecond(bucket: Int) -> CGFloat {
    CGFloat(pow(2, Double(bucket) / 3))
  }

  /// Peaks reduced to about one value per point at this zoom (max per bucket
  /// so transients survive). Never more values than the source array.
  func peaks(for clip: AttoTimelineClip) -> [Float] {
    let bucket = zoomBucket(geometry.pixelsPerSecond)
    let key = PeaksCacheKey(clipId: clip.id, bucket: bucket)
    if let cached = peaksCache[key], cached.signature == clip.peaksSignature {
      return cached.peaks
    }
    let widthAtBucket = CGFloat(clip.durationMs) * representativePixelsPerSecond(bucket: bucket) / 1000
    let target = max(2, Int(widthAtBucket.rounded(.up)))
    let source = clip.peaks
    let result: [Float]
    if source.count <= target {
      result = source
    } else {
      var out = [Float](repeating: 0, count: target)
      let bucketSize = Double(source.count) / Double(target)
      for i in 0..<target {
        let start = Int(Double(i) * bucketSize)
        let end = max(start + 1, Int(Double(i + 1) * bucketSize))
        var peak: Float = 0
        var j = start
        while j < end && j < source.count {
          if source[j] > peak { peak = source[j] }
          j += 1
        }
        out[i] = peak
      }
      result = out
    }
    peaksCache[key] = PeaksCacheEntry(signature: clip.peaksSignature, peaks: result)
    return result
  }

  func clearPeaksCache() {
    peaksCache.removeAll()
  }

  // MARK: Ruler

  private lazy var rulerFont = UIFont.monospacedDigitSystemFont(ofSize: 10, weight: .medium)

  /// Draws the ruler for content x in `rect` (content coordinates).
  func drawRuler(in ctx: CGContext, rect: CGRect) {
    let g = geometry
    ctx.setFillColor(colors.rulerBackground.cgColor)
    ctx.fill(rect)

    // Bottom border shared with the first lane.
    ctx.setFillColor(colors.laneBorder.cgColor)
    ctx.fill(CGRect(x: rect.minX, y: g.rulerHeight - 1, width: rect.width, height: 1))

    let (major, minor) = AttoTimelineRuler.intervals(pixelsPerSecond: g.pixelsPerSecond)
    guard minor > 0, major > 0 else { return }
    let firstVisibleX = max(rect.minX, g.leftInset)
    guard rect.maxX > g.leftInset else { return }
    // One extra label on each side so a label centred just outside the slice
    // still gets its half drawn.
    let msStart = max(0, g.ms(forX: firstVisibleX) - major)
    let msEnd = g.ms(forX: rect.maxX) + major
    var ms = (msStart / minor).rounded(.down) * minor
    if ms < 0 { ms = 0 }

    let textAttributes: [NSAttributedString.Key: Any] = [
      .font: rulerFont,
      .foregroundColor: colors.rulerText,
    ]
    let tickColor = colors.rulerTick.cgColor
    let majorTickHeight: CGFloat = 9
    let minorTickHeight: CGFloat = 4

    while ms <= msEnd {
      let x = g.x(forMs: ms)
      let isMajor = abs(ms.truncatingRemainder(dividingBy: major)) < 0.5
        || abs(major - ms.truncatingRemainder(dividingBy: major)) < 0.5
      let tickHeight = isMajor ? majorTickHeight : minorTickHeight
      ctx.setFillColor(tickColor)
      ctx.fill(CGRect(x: x - 0.5, y: g.rulerHeight - 1 - tickHeight, width: 1, height: tickHeight))
      if isMajor {
        let text =
          (secondsRuler
            ? AttoTimelineRuler.secondsLabel(ms: ms, majorMs: major)
            : AttoTimelineRuler.label(ms: ms, majorMs: major)) as NSString
        let size = text.size(withAttributes: textAttributes)
        let origin = CGPoint(x: x - size.width / 2, y: max(1, (g.rulerHeight - majorTickHeight - size.height) / 2))
        text.draw(at: origin, withAttributes: textAttributes)
      }
      ms += minor
    }
  }

  // MARK: Lanes

  /// Draws lane `index` for content x in `rect`. The rect is the lane's own
  /// vertical band (the canvas is one lane tall).
  func drawLane(_ index: Int, in ctx: CGContext, rect: CGRect) {
    let g = geometry
    let laneTop = g.laneTop(index)
    let laneHeight = g.laneHeight(index)
    guard laneHeight > 0 else { return }

    ctx.setFillColor(colors.laneBackground.cgColor)
    ctx.fill(rect)

    // Lane centre line (SoundLab draws it across the whole lane) and border.
    let centreY = laneTop + laneHeight / 2
    ctx.setFillColor(colors.waveform.withAlphaComponent(0.22).cgColor)
    ctx.fill(CGRect(x: max(rect.minX, g.leftInset), y: centreY - 0.5, width: rect.width, height: 1))
    ctx.setFillColor(colors.laneBorder.cgColor)
    ctx.fill(CGRect(x: rect.minX, y: laneTop + laneHeight - 1, width: rect.width, height: 1))

    let laneOffset = laneDragOffsetPx[index] ?? 0
    for clip in clipsOnLane(index) {
      let isDragging = clip.id == draggingClipId
      var offset = laneOffset
      if isDragging {
        // The resting copy stays dimmed where the clip was.
        ctx.saveGState()
        ctx.setAlpha(0.35)
        drawClip(clip, offsetPx: laneOffset, in: ctx, visible: rect)
        ctx.restoreGState()
        offset += draggingClipOffsetPx
      }
      drawClip(clip, offsetPx: offset, in: ctx, visible: rect)
    }
  }

  private func drawClip(_ clip: AttoTimelineClip, offsetPx: CGFloat, in ctx: CGContext, visible: CGRect) {
    let g = geometry
    var box = g.clipRect(clip).offsetBy(dx: offsetPx, dy: 0)
    guard box.maxX >= visible.minX - 4, box.minX <= visible.maxX + 4 else { return }

    // Keep huge boxes bounded so Core Graphics never builds a 60000 pt path;
    // the cut edges land off screen so the rounded corners are not missed.
    let fullBox = box
    let clampMin = visible.minX - 24
    let clampMax = visible.maxX + 24
    if box.minX < clampMin {
      box.size.width -= clampMin - box.minX
      box.origin.x = clampMin
    }
    if box.maxX > clampMax {
      box.size.width = clampMax - box.minX
    }
    guard box.width > 0, box.height > 0 else { return }

    ctx.saveGState()
    if clip.muted { ctx.setAlpha(0.4) }

    let radius: CGFloat = 4
    let boxPath = UIBezierPath(roundedRect: box, cornerRadius: radius).cgPath
    ctx.addPath(boxPath)
    ctx.setFillColor(colors.clipFill.cgColor)
    ctx.fillPath()

    // Waveform: a filled polygon mirrored around the lane centre.
    // The lane colour paints the clip (Sep 23 2026, David: the track colour
    // has to show like before); the selection stays white so it reads on any hue.
    let laneColor = clip.color ?? colors.waveform
    let waveColor = clip.selected ? colors.waveformSelected : laneColor
    ctx.saveGState()
    ctx.addPath(boxPath)
    ctx.clip()
    drawWaveform(clip, box: fullBox, visible: visible, color: waveColor, in: ctx)
    ctx.restoreGState()

    ctx.addPath(boxPath)
    if clip.selected {
      ctx.setStrokeColor(colors.waveformSelected.cgColor)
      ctx.setLineWidth(1.5)
    } else {
      ctx.setStrokeColor((clip.color?.withAlphaComponent(0.7) ?? colors.clipBorder).cgColor)
      ctx.setLineWidth(1)
    }
    ctx.strokePath()
    ctx.restoreGState()
  }

  private func drawWaveform(_ clip: AttoTimelineClip, box: CGRect, visible: CGRect, color: UIColor, in ctx: CGContext) {
    let midY = box.midY
    let halfHeight = max(1, box.height / 2 - 2)
    let minHalf: CGFloat = 0.5
    let data = peaks(for: clip)

    // Silent or still loading: a thin centre line is the whole waveform.
    let isSilent = data.isEmpty || !data.contains { $0 > 0.002 }
    if isSilent {
      ctx.setFillColor(color.withAlphaComponent(data.isEmpty ? 0.35 : 0.7).cgColor)
      let x0 = max(box.minX, visible.minX - 2)
      let x1 = min(box.maxX, visible.maxX + 2)
      if x1 > x0 {
        ctx.fill(CGRect(x: x0, y: midY - 0.5, width: x1 - x0, height: 1))
      }
      return
    }

    let inset: CGFloat = 1
    let x0 = box.minX + inset
    let width = max(1, box.width - inset * 2)
    let count = data.count
    let step = count > 1 ? width / CGFloat(count - 1) : width

    // Only the points that fall in the visible slice, plus one on each side.
    var i0 = 0
    var i1 = count - 1
    if step > 0 {
      i0 = max(0, Int(((visible.minX - x0) / step).rounded(.down)) - 1)
      i1 = min(count - 1, Int(((visible.maxX - x0) / step).rounded(.up)) + 1)
    }
    guard i1 >= i0 else { return }

    let path = CGMutablePath()
    var i = i0
    while i <= i1 {
      let x = x0 + CGFloat(i) * step
      let h = max(minHalf, CGFloat(data[i]) * halfHeight)
      let p = CGPoint(x: x, y: midY - h)
      if i == i0 { path.move(to: p) } else { path.addLine(to: p) }
      i += 1
    }
    i = i1
    while i >= i0 {
      let x = x0 + CGFloat(i) * step
      let h = max(minHalf, CGFloat(data[i]) * halfHeight)
      path.addLine(to: CGPoint(x: x, y: midY + h))
      i -= 1
    }
    path.closeSubpath()
    ctx.addPath(path)
    ctx.setFillColor(color.withAlphaComponent(0.92).cgColor)
    ctx.fillPath()
  }
}
