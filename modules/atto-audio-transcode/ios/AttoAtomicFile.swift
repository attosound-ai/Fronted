import Foundation

/**
 * Temp file plus atomic rename helpers shared by the canonical converter and
 * the stem renderer.
 *
 * WHY THIS EXISTS: both writers produce files under a content addressed cache
 * key. If the process is killed mid write (iOS jetsam, a crash, the user
 * swiping the app away) the next launch would find the key present and trust a
 * truncated file. So every writer produces a sibling temp file first and only
 * moves it into place once it is completely finished. The temp file lives in
 * the SAME directory as the destination, so the final move is a rename on one
 * volume (atomic at the file system level), never a copy.
 */
enum AttoAtomicFile {

  /**
   * Returns a sibling path for the in progress write and makes sure the
   * destination directory exists. The temp name always carries `pathExtension`
   * because AVAssetWriter and AVAudioFile pick the container format from the
   * extension of the URL they are handed, so a bare `.partial` name would break
   * both writers.
   */
  static func temporaryURL(for outputURL: URL, pathExtension: String) throws -> URL {
    let directory = outputURL.deletingLastPathComponent()
    try FileManager.default.createDirectory(
      at: directory, withIntermediateDirectories: true, attributes: nil)
    let stem = outputURL.deletingPathExtension().lastPathComponent
    let token = UUID().uuidString.prefix(8)
    return directory
      .appendingPathComponent("\(stem).partial-\(token)")
      .appendingPathExtension(pathExtension)
  }

  /**
   * Moves the finished temp file onto the final path. removeItem + moveItem:
   * the destination is never left truncated, at worst it is briefly absent,
   * which the cache treats as a miss and simply renders again.
   */
  static func commit(temporaryURL: URL, to outputURL: URL) throws {
    let fm = FileManager.default
    if fm.fileExists(atPath: outputURL.path) {
      try fm.removeItem(at: outputURL)
    }
    try fm.moveItem(at: temporaryURL, to: outputURL)
  }

  /// Best effort cleanup of a temp file after a failed or cancelled write.
  static func discard(_ url: URL) {
    try? FileManager.default.removeItem(at: url)
  }

  /// Size in bytes of the file at `url`, or 0 when it cannot be stat'ed.
  static func size(of url: URL) -> Int {
    let attrs = try? FileManager.default.attributesOfItem(atPath: url.path)
    return (attrs?[.size] as? NSNumber)?.intValue ?? 0
  }
}
