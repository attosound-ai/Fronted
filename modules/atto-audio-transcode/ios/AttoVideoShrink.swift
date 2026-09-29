import AVFoundation
import CoreVideo

/**
 * ATTO's own video compressor for posts: HEVC at 1080p and a FIXED bit rate,
 * AAC audio, HDR tone mapped to SDR (Rec. 709).
 *
 * Why not react-native-compressor: it hands back the ORIGINAL file whenever
 * its export fails for any reason but a cancel, with no error, and iPhone
 * video (HDR, 10 bit HLG) makes it fail. A 4.9 GB video came back untouched
 * and the post failed as too large after an eight minute wait (Sep 29 2026).
 * AVAssetExportSession handles HDR but picks its own bit rate, so the size
 * could not be known in advance. Here the bit rate is fixed, so the size is
 * duration times rate: the app tells the person before posting whether the
 * video fits (see videoPostLimits.ts, which mirrors these numbers).
 */
enum AttoVideoShrink {
  static let videoBitRate = 2_000_000
  static let audioBitRate = 128_000
  static let maxLongSide: CGFloat = 1920

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

  private static func even(_ v: CGFloat) -> Int { max(2, Int((v / 2).rounded()) * 2) }

  static func shrink(
    inputPath: String,
    outputPath: String,
    progress: @escaping (Double) -> Void,
    completion: @escaping (Result<[String: Any], Error>) -> Void
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      do {
        let info = try run(inputPath: inputPath, outputPath: outputPath, progress: progress)
        completion(.success(info))
      } catch {
        completion(.failure(error))
      }
    }
  }

  private static func run(
    inputPath: String,
    outputPath: String,
    progress: @escaping (Double) -> Void
  ) throws -> [String: Any] {
    let started = CFAbsoluteTimeGetCurrent()
    let input = fileURL(inputPath)
    let output = fileURL(outputPath)
    try? FileManager.default.removeItem(at: output)

    let asset = AVURLAsset(url: input)
    guard let videoTrack = asset.tracks(withMediaType: .video).first else {
      throw Failure(message: "No video track")
    }
    let audioTrack = asset.tracks(withMediaType: .audio).first
    let duration = CMTimeGetSeconds(asset.duration)

    // Upright size after the rotation the camera recorded, scaled so the long
    // side is at most 1920, never upscaled.
    let natural = videoTrack.naturalSize
    let transform = videoTrack.preferredTransform
    let rotated = CGRect(origin: .zero, size: natural).applying(transform)
    let upright = CGSize(width: abs(rotated.width), height: abs(rotated.height))
    let scale = min(1, maxLongSide / max(upright.width, upright.height))
    let outW = even(upright.width * scale)
    let outH = even(upright.height * scale)
    let fps = videoTrack.nominalFrameRate > 0 ? min(60, videoTrack.nominalFrameRate) : 30

    // The composition does rotation, scaling and the HDR to SDR tone map.
    let composition = AVMutableVideoComposition()
    composition.renderSize = CGSize(width: outW, height: outH)
    composition.frameDuration = CMTime(value: 1, timescale: CMTimeScale(fps.rounded()))
    composition.colorPrimaries = AVVideoColorPrimaries_ITU_R_709_2
    composition.colorTransferFunction = AVVideoTransferFunction_ITU_R_709_2
    composition.colorYCbCrMatrix = AVVideoYCbCrMatrix_ITU_R_709_2
    let instruction = AVMutableVideoCompositionInstruction()
    instruction.timeRange = CMTimeRange(start: .zero, duration: asset.duration)
    let layer = AVMutableVideoCompositionLayerInstruction(assetTrack: videoTrack)
    let placed = transform
      .concatenating(CGAffineTransform(translationX: -rotated.minX, y: -rotated.minY))
      .concatenating(CGAffineTransform(scaleX: scale, y: scale))
    layer.setTransform(placed, at: .zero)
    instruction.layerInstructions = [layer]
    composition.instructions = [instruction]

    let reader = try AVAssetReader(asset: asset)
    let videoOut = AVAssetReaderVideoCompositionOutput(
      videoTracks: [videoTrack],
      videoSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
      ])
    videoOut.videoComposition = composition
    videoOut.alwaysCopiesSampleData = false
    guard reader.canAdd(videoOut) else { throw Failure(message: "Cannot read the video") }
    reader.add(videoOut)

    let pcm: [String: Any] = [
      AVFormatIDKey: kAudioFormatLinearPCM,
      AVSampleRateKey: 44100,
      AVNumberOfChannelsKey: 2,
      AVLinearPCMBitDepthKey: 16,
      AVLinearPCMIsFloatKey: false,
      AVLinearPCMIsBigEndianKey: false,
      AVLinearPCMIsNonInterleaved: false,
    ]
    var audioOut: AVAssetReaderTrackOutput?
    if let audioTrack {
      let out = AVAssetReaderTrackOutput(track: audioTrack, outputSettings: pcm)
      out.alwaysCopiesSampleData = false
      if reader.canAdd(out) {
        reader.add(out)
        audioOut = out
      }
    }

    let writer = try AVAssetWriter(outputURL: output, fileType: .mp4)
    writer.shouldOptimizeForNetworkUse = true
    let videoIn = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.hevc,
        AVVideoWidthKey: outW,
        AVVideoHeightKey: outH,
        AVVideoColorPropertiesKey: [
          AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
          AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
          AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ],
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: videoBitRate,
          AVVideoExpectedSourceFrameRateKey: Int(fps.rounded()),
          AVVideoMaxKeyFrameIntervalKey: Int(fps.rounded()) * 2,
        ],
      ])
    videoIn.expectsMediaDataInRealTime = false
    guard writer.canAdd(videoIn) else { throw Failure(message: "Cannot write HEVC") }
    writer.add(videoIn)

    var audioIn: AVAssetWriterInput?
    if audioOut != nil {
      let aIn = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVSampleRateKey: 44100,
          AVNumberOfChannelsKey: 2,
          AVEncoderBitRateKey: audioBitRate,
        ])
      aIn.expectsMediaDataInRealTime = false
      if writer.canAdd(aIn) {
        writer.add(aIn)
        audioIn = aIn
      }
    }

    guard reader.startReading() else {
      throw Failure(message: reader.error?.localizedDescription ?? "startReading failed")
    }
    guard writer.startWriting() else {
      throw Failure(message: writer.error?.localizedDescription ?? "startWriting failed")
    }
    writer.startSession(atSourceTime: .zero)

    let group = DispatchGroup()
    var lastReport = 0.0

    group.enter()
    videoIn.requestMediaDataWhenReady(on: DispatchQueue(label: "atto.shrink.video")) {
      while videoIn.isReadyForMoreMediaData {
        guard reader.status == .reading, let sample = videoOut.copyNextSampleBuffer() else {
          videoIn.markAsFinished()
          group.leave()
          return
        }
        if duration > 0 {
          let at = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sample)) / duration
          if at - lastReport >= 0.01 {
            lastReport = at
            progress(min(0.99, max(0, at)))
          }
        }
        if !videoIn.append(sample) {
          videoIn.markAsFinished()
          group.leave()
          return
        }
      }
    }

    if let audioIn, let audioOut {
      group.enter()
      audioIn.requestMediaDataWhenReady(on: DispatchQueue(label: "atto.shrink.audio")) {
        while audioIn.isReadyForMoreMediaData {
          guard reader.status == .reading, let sample = audioOut.copyNextSampleBuffer() else {
            audioIn.markAsFinished()
            group.leave()
            return
          }
          if !audioIn.append(sample) {
            audioIn.markAsFinished()
            group.leave()
            return
          }
        }
      }
    }

    group.wait()
    if reader.status == .failed || writer.status == .failed {
      let reason = reader.error?.localizedDescription ?? writer.error?.localizedDescription ?? "failed"
      writer.cancelWriting()
      reader.cancelReading()
      throw Failure(message: reason)
    }

    let done = DispatchSemaphore(value: 0)
    writer.finishWriting { done.signal() }
    done.wait()
    guard writer.status == .completed else {
      throw Failure(message: writer.error?.localizedDescription ?? "Write did not complete")
    }
    progress(1)

    return [
      "outputPath": output.absoluteString,
      "inputBytes": bytes(input),
      "outputBytes": bytes(output),
      "durationMs": Int(duration * 1000),
      "encodeMs": Int((CFAbsoluteTimeGetCurrent() - started) * 1000),
      "width": outW,
      "height": outH,
      "preset": "hevc-\(videoBitRate / 1000)k",
    ]
  }
}
