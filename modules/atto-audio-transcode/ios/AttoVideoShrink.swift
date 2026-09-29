import AVFoundation

/**
 * Apple's own video conversion, used when the JS compressor gives up.
 *
 * react-native-compressor (NextLevelSessionExporter) hands back the ORIGINAL
 * file whenever its export fails for any reason but a cancel, with no error.
 * iPhone videos are HDR (10 bit HLG) by default, and a 146 MB one came back
 * untouched in two seconds (Sep 29 2026), so the post failed as too large.
 * AVAssetExportSession handles HDR, runs on the hardware encoder, and HEVC
 * at 1080p keeps a minute of video around 40 MB.
 */
enum AttoVideoShrink {
  struct Failure: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  static func fileURL(_ path: String) -> URL {
    if path.hasPrefix("file://"), let url = URL(string: path) { return url }
    return URL(fileURLWithPath: path)
  }

  static func bytes(_ url: URL) -> Int64 {
    let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size]) as? NSNumber
    return size?.int64Value ?? -1
  }

  /// Presets in order of preference; the first one the asset supports wins.
  static let presets = [AVAssetExportPresetHEVC1920x1080, AVAssetExportPreset1920x1080]

  static func shrink(
    inputPath: String,
    outputPath: String,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    let input = fileURL(inputPath)
    let output = fileURL(outputPath)
    let asset = AVURLAsset(url: input)
    let started = CFAbsoluteTimeGetCurrent()
    try? FileManager.default.removeItem(at: output)

    AVAssetExportSession.determineCompatibility(
      ofExportPreset: presets[0], with: asset, outputFileType: .mp4
    ) { hevcOk in
      let preset = hevcOk ? presets[0] : presets[1]
      guard let session = AVAssetExportSession(asset: asset, presetName: preset) else {
        completion(.failure(Failure(message: "No export session for \(preset)")))
        return
      }
      session.outputURL = output
      session.outputFileType = .mp4
      session.shouldOptimizeForNetworkUse = true
      session.exportAsynchronously {
        switch session.status {
        case .completed:
          completion(.success([
            "outputPath": output.absoluteString,
            "inputBytes": bytes(input),
            "outputBytes": bytes(output),
            "durationMs": Int(CMTimeGetSeconds(asset.duration) * 1000),
            "encodeMs": Int((CFAbsoluteTimeGetCurrent() - started) * 1000),
            "preset": preset,
          ]))
        default:
          let reason = session.error?.localizedDescription ?? "status \(session.status.rawValue)"
          completion(.failure(Failure(message: reason)))
        }
      }
    }
  }
}
