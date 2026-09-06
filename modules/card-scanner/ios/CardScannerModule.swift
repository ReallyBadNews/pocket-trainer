import ExpoModulesCore
import Foundation

public class CardScannerModule: Module {
  public func definition() -> ModuleDefinition {
    Name("CardScanner")
    AsyncFunction("recognize") { (uri: String, language: String, words: [String], crop: [Double]) -> [String: Any] in
      guard let url = URL(string: uri) else { throw CardVision.failure("The card photo could not be opened.") }
      return try CardVision.recognize(url, language: language, words: words, crop: crop)
    }.runOnQueue(.global(qos: .userInitiated))
    AsyncFunction("refine") { (uri: String, language: String, words: [String]) -> [String: String] in
      guard let url = URL(string: uri) else { throw CardVision.failure("The card photo could not be opened.") }
      return try CardVision.refine(CardVision.open(url), language: language, words: words)
    }.runOnQueue(.global(qos: .userInitiated))
    AsyncFunction("compare") { (uri: String, urls: [String]) async throws -> [Double] in
      return try await CardArtwork.compare(uri, urls: urls)
    }
  }
}
