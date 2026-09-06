import Foundation
import Vision
import CoreImage

final class CardArtwork {
  private static let references: NSCache<NSString, VNFeaturePrintObservation> = {
    let cache = NSCache<NSString, VNFeaturePrintObservation>(); cache.countLimit = 80; return cache
  }()
  static func compare(_ uri: String, urls: [String]) async throws -> [Double] {
      guard let local = URL(string: uri), local.isFileURL else { return [] }
      return try await Task.detached(priority: .userInitiated) {
        let photo = try CardVision.feature(CardVision.open(local))
        return await withTaskGroup(of: (Int, Double).self) { group in
          for (index, value) in urls.prefix(6).enumerated() {
            group.addTask {
              do {
                guard let url = URL(string: value), url.scheme == "https", url.host == "assets.tcgdex.net" else { return (index, -1) }
                let reference: VNFeaturePrintObservation
                if let cached = Self.references.object(forKey: value as NSString) { reference = cached }
                else {
                  var request = URLRequest(url: url); request.timeoutInterval = 2.5
                  let (data, response) = try await URLSession.shared.data(for: request)
                  guard (response as? HTTPURLResponse)?.statusCode == 200, data.count < 4_000_000,
                    let image = CIImage(data: data) else { return (index, -1) }
                  reference = try CardVision.feature(image)
                  Self.references.setObject(reference, forKey: value as NSString)
                }
                var distance: Float = 0
                try photo.computeDistance(&distance, to: reference)
                return (index, Double(distance))
              } catch { return (index, -1) }
            }
          }
          var values = Array(repeating: -1.0, count: min(6, urls.count))
          for await (index, distance) in group { values[index] = distance }
          return values
        }
      }.value
  }
}
