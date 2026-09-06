// Compile with modules/card-scanner/ios/CardVision.swift. Uses the production algorithm.
// macOS checks cannot substitute for the physical iPhone camera test.
import Foundation
@main struct Smoke {
  static func main() throws {
    let args = CommandLine.arguments
    let url = URL(fileURLWithPath: args[1])
    let language = args.count > 2 ? args[2] : "en"
    let cardsURL = URL(fileURLWithPath: "src/data/cards-\(language).json")
    let cards = try JSONSerialization.jsonObject(with: Data(contentsOf: cardsURL)) as! [[String: Any]]
    let words = Array(Set(cards.compactMap { $0["name"] as? String })).sorted()
    let crop = args.count > 3 ? args[3].split(separator: ",").compactMap { Double($0) } : []
    let result = try CardVision.recognize(url, language: language, words: words, crop: crop)
    let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
    print(String(data: data, encoding: .utf8)!)
  }
}
