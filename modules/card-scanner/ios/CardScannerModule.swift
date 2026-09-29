import AVFoundation
import CoreMedia
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
    // expo-camera uses this default back lens; the viewfinder zooms so cards stay within its focus range.
    Function("backCameraOptics") { () -> [String: Double] in
      guard let device = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else { return [:] }
      let format = device.activeFormat
      let size = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
      guard size.width > 0, size.height > 0 else { return [:] }
      return [
        "minimumFocusDistance": Double(device.minimumFocusDistance),
        "fieldOfView": Double(format.videoFieldOfView),
        "aspect": Double(min(size.width, size.height)) / Double(max(size.width, size.height)),
        "maxZoom": Double(format.videoMaxZoomFactor),
      ]
    }
    AsyncFunction("compare") { (uri: String, urls: [String]) async throws -> [Double] in
      return try await CardArtwork.compare(uri, urls: urls)
    }
  }
}
