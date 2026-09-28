import ExpoModulesCore
import UIKit

// MARK: - Records received from JS (plain JSON props)

struct AttoTimelineTrackRecord: Record {
  @Field var id: String = ""
  @Field var height: Double = 124
}

struct AttoTimelineClipRecord: Record {
  @Field var id: String = ""
  @Field var trackIndex: Int = 0
  @Field var startMs: Double = 0
  @Field var durationMs: Double = 0
  @Field var selected: Bool? = nil
  @Field var muted: Bool? = nil
  @Field var color: String? = nil
}

/**
 * La onda de un clip: sus picos y el tramo que cubren.
 *
 * NO es una prop, y eso es lo importante de este archivo.
 *
 * Los picos iban dentro del clip, y el clip es una prop. Una prop de Fabric se
 * reconvierte ENTERA cada vez que cambia cualquier otra prop de la misma
 * vista, aunque esa no haya cambiado: expo-modules pasa todas de folly a
 * objetos, de objetos a Swift, y compara la nueva con la anterior castea a
 * AnyHashable. Tres recorridos completos por cada valor.
 *
 * Mientras suena, la cabeza de reproducción viaja como prop animada a 60 por
 * segundo. Con un proyecto de 41 minutos, los picos de sus clips son unos
 * 60.000 números, así que eran tres recorridos por 60.000 valores, sesenta
 * veces por segundo, en el hilo principal. Medido el 28 de septiembre de 2026
 * en el teléfono: la huella subía 280 MB cada cinco segundos con el hilo
 * principal al 93 por ciento dentro de swift_dynamicCast, hasta que el sistema
 * mataba la app a los 1185 MB. Con un proyecto de 11 segundos no se movía,
 * porque son 2000 números en vez de 60.000.
 *
 * Por eso la onda entra por una función y no por una prop: cruza una vez
 * cuando cambia, y las props se quedan con lo que de verdad es pequeño.
 */
// Nota: la onda NO viaja como Record. Entra por `setWaveform` con argumentos
// sueltos (texto, array de números, dos números), que es el tipo más simple
// que la conversión a nativo sabe hacer sin dudas. Con un array de Records la
// llamada se rechazaba en silencio y los clips salían sin onda, y como la
// promesa iba a la basura no había ni un error donde mirarlo.

struct AttoTimelineSelectionRecord: Record {
  @Field var trackIndex: Int = 0
  @Field var startMs: Double = 0
  @Field var endMs: Double = 0
}

struct AttoTimelineColorsRecord: Record {
  @Field var background: String? = nil
  @Field var laneBackground: String? = nil
  @Field var laneBorder: String? = nil
  @Field var waveform: String? = nil
  @Field var waveformSelected: String? = nil
  @Field var playhead: String? = nil
  @Field var selectionLine: String? = nil
  @Field var selectionFill: String? = nil
  @Field var selectionBorder: String? = nil
  @Field var rulerText: String? = nil
  @Field var rulerTick: String? = nil
  @Field var clipBorder: String? = nil
  // Optional extras, derived from the required keys when absent.
  @Field var clipFill: String? = nil
  @Field var rulerBackground: String? = nil
}

// MARK: - Internal model

struct AttoTimelineTrack {
  let id: String
  let height: CGFloat
}

struct AttoTimelineClip {
  let id: String
  let trackIndex: Int
  let startMs: Double
  let durationMs: Double
  let selected: Bool
  let muted: Bool
  /// The lane's colour, when the editor sends one (track colour picker).
  let color: UIColor?

  var endMs: Double { startMs + durationMs }

  init(record: AttoTimelineClipRecord) {
    id = record.id
    trackIndex = max(0, record.trackIndex)
    startMs = max(0, record.startMs)
    durationMs = max(0, record.durationMs)
    selected = record.selected ?? false
    muted = record.muted ?? false
    color = record.color.flatMap { UIColor(hex: $0) }
  }
}

/// Lo mismo que `AttoTimelineWaveformRecord`, ya saneado y con su huella.
struct AttoTimelineWaveform {
  let peaks: [Float]
  /// Tramo cubierto, o nil cuando cubren el clip entero.
  let startMs: Double?
  let endMs: Double?
  /// Huella barata para que la caché de reducción sepa si cambió, sin volver
  /// a recorrer miles de valores.
  let signature: Int

  init?(peaks crudos: [Double], startMs desde: Double, endMs hasta: Double) {
    guard !crudos.isEmpty else { return nil }
    peaks = crudos.map { Float(min(1, max(0, $0))) }
    let tieneVentana = hasta > desde
    startMs = tieneVentana ? max(0, desde) : nil
    endMs = tieneVentana ? hasta : nil
    var hasher = Hasher()
    hasher.combine(peaks.count)
    hasher.combine(startMs ?? -1)
    hasher.combine(endMs ?? -1)
    let stride = max(1, peaks.count / 16)
    var i = 0
    while i < peaks.count {
      hasher.combine(peaks[i])
      i += stride
    }
    signature = hasher.finalize()
  }
}

struct AttoTimelineSelection: Equatable {
  var trackIndex: Int
  var startMs: Double
  var endMs: Double

  init(trackIndex: Int, startMs: Double, endMs: Double) {
    self.trackIndex = trackIndex
    self.startMs = min(startMs, endMs)
    self.endMs = max(startMs, endMs)
  }

  init(record: AttoTimelineSelectionRecord) {
    self.init(trackIndex: record.trackIndex, startMs: record.startMs, endMs: record.endMs)
  }
}

struct AttoTimelineColors {
  var background = UIColor(hex: "#000000")!
  var laneBackground = UIColor(hex: "#0d0d0d")!
  var laneBorder = UIColor(hex: "#222222")!
  var waveform = UIColor(hex: "#3B82F6")!
  var waveformSelected = UIColor(hex: "#FFFFFF")!
  var playhead = UIColor(hex: "#EF4444")!
  var selectionLine = UIColor(hex: "#F59E0B")!
  var selectionFill = UIColor(hex: "#FFFFFF26")!
  var selectionBorder = UIColor(hex: "#F59E0B")!
  var rulerText = UIColor(hex: "#8A8A8A")!
  var rulerTick = UIColor(hex: "#4A4A4A")!
  var clipBorder = UIColor(hex: "#3A3A3A")!
  var clipFill = UIColor(hex: "#1A1A1A")!
  var rulerBackground = UIColor(hex: "#0a0a0a")!

  init() {}

  init(record: AttoTimelineColorsRecord?) {
    self.init()
    guard let record else { return }
    func apply(_ hex: String?, _ target: inout UIColor) {
      if let hex, let color = UIColor(hex: hex) { target = color }
    }
    apply(record.background, &background)
    apply(record.laneBackground, &laneBackground)
    apply(record.laneBorder, &laneBorder)
    apply(record.waveform, &waveform)
    apply(record.waveformSelected, &waveformSelected)
    apply(record.playhead, &playhead)
    apply(record.selectionLine, &selectionLine)
    apply(record.selectionFill, &selectionFill)
    apply(record.selectionBorder, &selectionBorder)
    apply(record.rulerText, &rulerText)
    apply(record.rulerTick, &rulerTick)
    apply(record.clipBorder, &clipBorder)
    // Derived defaults: the clip box is a slightly lighter lane, the ruler
    // shares the page background unless told otherwise.
    clipFill = laneBackground.blended(with: .white, fraction: 0.05)
    rulerBackground = background
    apply(record.clipFill, &clipFill)
    apply(record.rulerBackground, &rulerBackground)
  }
}

// MARK: - Geometry (milliseconds to points)

/// Everything the drawing and hit testing code needs to map time to content
/// coordinates. Content x = leftInset + ms * pixelsPerSecond / 1000.
struct AttoTimelineGeometry {
  var pixelsPerSecond: CGFloat = 100
  var leftInset: CGFloat = 110
  var rulerHeight: CGFloat = 30
  var trackGap: CGFloat = 0
  var durationMs: Double = 0
  var viewportWidth: CGFloat = 0
  var laneHeights: [CGFloat] = []

  /// Vertical padding between the lane edge and the clip box.
  static let clipPadding: CGFloat = 3
  /// The floor when JS has not said otherwise: about 28 seconds across a phone.
  static let minPixelsPerSecond: CGFloat = 2
  /// The floor JS may lower to. One point is 50 seconds, so a three hour
  /// project still fits in 216 points.
  ///
  /// It is exactly where the ruler runs out: the largest candidate below is
  /// one hour, and one hour at 0.02 pt/s is 72 points, which is the minimum
  /// spacing `intervals` keeps between labels. Any further out and the
  /// labels would start landing on top of each other.
  static let absoluteMinPixelsPerSecond: CGFloat = 0.02
  static let maxPixelsPerSecond: CGFloat = 4000

  func x(forMs ms: Double) -> CGFloat {
    leftInset + CGFloat(ms) * pixelsPerSecond / 1000
  }

  func ms(forX x: CGFloat) -> Double {
    Double((x - leftInset) * 1000 / pixelsPerSecond)
  }

  func px(forDurationMs ms: Double) -> CGFloat {
    CGFloat(ms) * pixelsPerSecond / 1000
  }

  func ms(forPx px: CGFloat) -> Double {
    Double(px * 1000 / pixelsPerSecond)
  }

  var lanesHeight: CGFloat {
    let gaps = CGFloat(max(0, laneHeights.count - 1)) * trackGap
    return laneHeights.reduce(0, +) + gaps
  }

  var totalHeight: CGFloat { rulerHeight + lanesHeight }

  /// Scrollable width: the inset, the whole project and one extra screen.
  var contentWidth: CGFloat {
    leftInset + px(forDurationMs: durationMs) + max(viewportWidth, 1)
  }

  func laneTop(_ index: Int) -> CGFloat {
    var y = rulerHeight
    var i = 0
    while i < index && i < laneHeights.count {
      y += laneHeights[i] + trackGap
      i += 1
    }
    return y
  }

  func laneHeight(_ index: Int) -> CGFloat {
    index >= 0 && index < laneHeights.count ? laneHeights[index] : 0
  }

  func laneRect(_ index: Int) -> CGRect {
    CGRect(x: 0, y: laneTop(index), width: contentWidth, height: laneHeight(index))
  }

  /// Lane under a content y, or nil on the ruler, in a gap, or below the lanes.
  func laneIndex(forY y: CGFloat) -> Int? {
    guard y >= rulerHeight else { return nil }
    var top = rulerHeight
    for (i, h) in laneHeights.enumerated() {
      if y >= top && y < top + h { return i }
      top += h + trackGap
    }
    return nil
  }

  func clipRect(_ clip: AttoTimelineClip) -> CGRect {
    let pad = Self.clipPadding
    let x0 = x(forMs: clip.startMs)
    let w = max(2, px(forDurationMs: clip.durationMs))
    return CGRect(
      x: x0,
      y: laneTop(clip.trackIndex) + pad,
      width: w,
      height: max(0, laneHeight(clip.trackIndex) - pad * 2)
    )
  }
}

// MARK: - Ruler intervals

enum AttoTimelineRuler {
  /// Los escalones van de una centésima a una hora. Los tres primeros son para
  /// el zoom profundo: a 4000 puntos por segundo la pantalla cubre 80 ms, y sin
  /// ellos el escalón más pequeño era 100 ms y cabía UNA etiqueta en pantalla.
  private static let majorCandidatesMs: [Double] = [
    10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000,
    120000, 300000, 600000, 1_200_000, 1_800_000, 3_600_000,
  ]

  /// Major (labelled) and minor tick spacing for a zoom level. Labels keep at
  /// least 72 pt between them so they never overlap.
  static func intervals(pixelsPerSecond: CGFloat) -> (major: Double, minor: Double) {
    let minLabelSpacing: CGFloat = 72
    let targetMs = Double(minLabelSpacing * 1000 / pixelsPerSecond)
    var major = majorCandidatesMs.last!
    for candidate in majorCandidatesMs where candidate >= targetMs {
      major = candidate
      break
    }
    let minor: Double
    if major <= 1000 {
      minor = major / 2
    } else if major <= 5000 {
      minor = 1000
    } else if major <= 30000 {
      minor = major / 5
    } else {
      minor = major / 4
    }
    return (major, minor)
  }

  /// Plain seconds, the other marker SoundLab offers: 5, 30, 125.
  static func secondsLabel(ms: Double, majorMs: Double) -> String {
    if majorMs < 100 {
      return String(format: "%.2f", ms / 1000)
    }
    if majorMs < 1000 {
      return String(format: "%.1f", ms / 1000)
    }
    return String(Int((ms / 1000).rounded()))
  }

  /// 00:05, 01:00, 1:02:03 for hours, and 00:00.5 when the major step is sub second.
  static func label(ms: Double, majorMs: Double) -> String {
    let totalSeconds = ms / 1000
    let hours = Int(totalSeconds / 3600)
    let minutes = Int(totalSeconds / 60) % 60
    let seconds = Int(totalSeconds) % 60
    var text: String
    if hours > 0 {
      text = String(format: "%d:%02d:%02d", hours, minutes, seconds)
    } else {
      text = String(format: "%02d:%02d", minutes, seconds)
    }
    if majorMs < 100 {
      // Centésimas: con escalones de 10 o 20 ms, las décimas repetirían la
      // misma etiqueta en ticks distintos.
      let hundredths = Int((ms.truncatingRemainder(dividingBy: 1000)) / 10)
      text += String(format: ".%02d", hundredths)
    } else if majorMs < 1000 {
      let tenths = Int((ms.truncatingRemainder(dividingBy: 1000)) / 100)
      text += ".\(tenths)"
    }
    return text
  }
}

// MARK: - UIColor helpers

extension UIColor {
  /// Parses #RGB, #RGBA, #RRGGBB and #RRGGBBAA (leading # optional).
  convenience init?(hex: String) {
    var text = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if text.hasPrefix("#") { text.removeFirst() }
    guard let value = UInt64(text, radix: 16) else { return nil }
    var r: UInt64 = 0
    var g: UInt64 = 0
    var b: UInt64 = 0
    var a: UInt64 = 255
    switch text.count {
    case 3:
      r = ((value >> 8) & 0xF) * 17
      g = ((value >> 4) & 0xF) * 17
      b = (value & 0xF) * 17
    case 4:
      r = ((value >> 12) & 0xF) * 17
      g = ((value >> 8) & 0xF) * 17
      b = ((value >> 4) & 0xF) * 17
      a = (value & 0xF) * 17
    case 6:
      r = (value >> 16) & 0xFF
      g = (value >> 8) & 0xFF
      b = value & 0xFF
    case 8:
      r = (value >> 24) & 0xFF
      g = (value >> 16) & 0xFF
      b = (value >> 8) & 0xFF
      a = value & 0xFF
    default:
      return nil
    }
    self.init(
      red: CGFloat(r) / 255, green: CGFloat(g) / 255, blue: CGFloat(b) / 255,
      alpha: CGFloat(a) / 255)
  }

  func blended(with other: UIColor, fraction: CGFloat) -> UIColor {
    var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0
    var r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
    getRed(&r1, green: &g1, blue: &b1, alpha: &a1)
    other.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
    let f = min(1, max(0, fraction))
    return UIColor(
      red: r1 + (r2 - r1) * f, green: g1 + (g2 - g1) * f, blue: b1 + (b2 - b1) * f,
      alpha: a1 + (a2 - a1) * f)
  }
}
