// Artwork distances for the scan accuracy harness, like CardArtwork.compare in the app: a Vision feature print
// of the cropped scan preview against each shortlisted card's TCGdex low.png.
//
//   swiftc -O -parse-as-library scripts/scan-eval/artwork.swift modules/card-scanner/ios/CardVision.swift \
//     -o /tmp/scan-eval/bin/artwork
//   node scripts/scan-eval/evaluate.cjs <ocr.jsonl> <manifest.json> [build] --emit-compare /tmp/scan-eval/compare.jsonl
//   /tmp/scan-eval/bin/artwork /tmp/scan-eval/compare.jsonl /tmp/scan-eval/artwork.jsonl [--cache /tmp/scan-eval/artwork-cache]
//   node scripts/scan-eval/evaluate.cjs <ocr.jsonl> <manifest.json> [build] --artwork /tmp/scan-eval/artwork.jsonl
import CoreImage
import Foundation
import Vision

@main struct ArtworkBatch {
  static func main() throws {
    var args = Array(CommandLine.arguments.dropFirst())
    var cachePath = "/tmp/scan-eval/artwork-cache"
    if let i = args.firstIndex(of: "--cache"), i + 1 < args.count { cachePath = args[i + 1]; args.removeSubrange(i...(i + 1)) }
    guard args.count == 2 else {
      FileHandle.standardError.write(Data("usage: artwork <compare.jsonl> <out.jsonl> [--cache dir]\n".utf8))
      exit(2)
    }
    let cache = URL(fileURLWithPath: cachePath, isDirectory: true)
    try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
    var references: [String: VNFeaturePrintObservation] = [:]
    var lines: [String] = []
    for line in try String(contentsOfFile: args[0], encoding: .utf8).split(separator: "\n") {
      guard let request = try JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any],
        let preview = request["preview"] as? String, let urls = request["urls"] as? [String] else { continue }
      var row: [String: Any] = ["id": request["id"] ?? "", "mode": request["mode"] ?? "", "ids": request["ids"] ?? []]
      do {
        let photo = try CardVision.feature(CardVision.open(URL(fileURLWithPath: preview)))
        var distances: [Double] = []
        for value in urls.prefix(6) {
          do {
            let reference: VNFeaturePrintObservation
            if let cached = references[value] { reference = cached } else {
              let file = cache.appendingPathComponent(value.replacingOccurrences(of: "https://assets.tcgdex.net/", with: "").replacingOccurrences(of: "/", with: "_"))
              if !FileManager.default.fileExists(atPath: file.path), let url = URL(string: value) {
                let data = try Data(contentsOf: url)
                try data.write(to: file)
              }
              guard let image = CIImage(contentsOf: file) else { throw CardVision.failure("bad reference") }
              reference = try CardVision.feature(image)
              references[value] = reference
            }
            var distance: Float = 0
            try photo.computeDistance(&distance, to: reference)
            distances.append(Double(distance))
          } catch { distances.append(-1) }
        }
        row["distances"] = distances
      } catch { row["error"] = error.localizedDescription }
      let data = try JSONSerialization.data(withJSONObject: row, options: [.sortedKeys])
      lines.append(String(data: data, encoding: .utf8)!)
    }
    try (lines.joined(separator: "\n") + "\n").write(toFile: args[1], atomically: true, encoding: .utf8)
    FileHandle.standardError.write(Data("artwork: \(lines.count) comparisons\n".utf8))
  }
}
