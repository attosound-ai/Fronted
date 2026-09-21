import AVFoundation
import MediaPlayer
import UIKit

/// The system music picker, the way SoundLab's "Import from Music Library"
/// works. Songs bought from the store or downloaded from a subscription are
/// protected and cannot be exported; those are reported so the caller can say
/// so instead of failing silently.
final class AttoMusicLibraryPicker: NSObject, MPMediaPickerControllerDelegate {
  struct Picked {
    let path: String
    let title: String
    let artist: String
    let durationSec: Double
  }

  private var completion: ((Result<Picked?, Error>) -> Void)?
  private var picker: MPMediaPickerController?
  private static var current: AttoMusicLibraryPicker?

  static func authorizationStatus() -> String {
    switch MPMediaLibrary.authorizationStatus() {
    case .authorized: return "granted"
    case .denied: return "denied"
    case .restricted: return "restricted"
    default: return "undetermined"
    }
  }

  static func requestAuthorization(_ completion: @escaping (Bool) -> Void) {
    MPMediaLibrary.requestAuthorization { status in
      DispatchQueue.main.async { completion(status == .authorized) }
    }
  }

  /// Presents the picker and copies the chosen song into `outputPath` as m4a.
  /// Answers nil when the person cancels.
  static func pick(
    outputPath: String,
    completion: @escaping (Result<Picked?, Error>) -> Void
  ) {
    DispatchQueue.main.async {
      guard
        let root = UIApplication.shared.connectedScenes
          .compactMap({ $0 as? UIWindowScene })
          .flatMap({ $0.windows })
          .first(where: { $0.isKeyWindow })?.rootViewController
      else {
        completion(.failure(AttoProcessError(AttoProcessError.generic, "No screen to present on")))
        return
      }
      let instance = AttoMusicLibraryPicker()
      instance.completion = completion
      instance.outputPath = outputPath
      current = instance

      let picker = MPMediaPickerController(mediaTypes: .music)
      picker.delegate = instance
      picker.allowsPickingMultipleItems = false
      picker.showsCloudItems = false
      picker.modalPresentationStyle = .formSheet
      instance.picker = picker
      var presenter = root
      while let presented = presenter.presentedViewController { presenter = presented }
      presenter.present(picker, animated: true)
    }
  }

  private var outputPath = ""

  func mediaPicker(
    _ mediaPicker: MPMediaPickerController, didPickMediaItems collection: MPMediaItemCollection
  ) {
    mediaPicker.dismiss(animated: true)
    guard let item = collection.items.first, let url = item.assetURL else {
      finish(.failure(AttoProcessError(
        AttoProcessError.input,
        "That song is protected and cannot be exported")))
      return
    }
    let asset = AVURLAsset(url: url)
    guard
      let session = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A)
    else {
      finish(.failure(AttoProcessError(AttoProcessError.generic, "Could not read the song")))
      return
    }
    let out = URL(fileURLWithPath: outputPath)
    try? FileManager.default.removeItem(at: out)
    session.outputURL = out
    session.outputFileType = .m4a
    let title = item.title ?? "Song"
    let artist = item.artist ?? ""
    let duration = item.playbackDuration
    session.exportAsynchronously { [weak self] in
      switch session.status {
      case .completed:
        self?.finish(.success(Picked(
          path: out.path, title: title, artist: artist, durationSec: duration)))
      case .cancelled:
        self?.finish(.success(nil))
      default:
        self?.finish(.failure(session.error
          ?? AttoProcessError(AttoProcessError.generic, "The song could not be exported")))
      }
    }
  }

  func mediaPickerDidCancel(_ mediaPicker: MPMediaPickerController) {
    mediaPicker.dismiss(animated: true)
    finish(.success(nil))
  }

  private func finish(_ result: Result<Picked?, Error>) {
    let block = completion
    completion = nil
    picker = nil
    AttoMusicLibraryPicker.current = nil
    DispatchQueue.main.async { block?(result) }
  }
}
