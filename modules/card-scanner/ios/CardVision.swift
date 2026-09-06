// Shared by the iOS module and the macOS recognition regression harness.
import Foundation
import Vision
import CoreImage
import ImageIO

struct CardVision {
  static let context = CIContext(options: [.cacheIntermediates: false])

  static func open(_ url: URL) throws -> CIImage {
    guard url.isFileURL, let source = CGImageSourceCreateWithURL(url as CFURL, nil),
      let cg = CGImageSourceCreateThumbnailAtIndex(source, 0, [
        kCGImageSourceCreateThumbnailFromImageAlways: true,
        kCGImageSourceCreateThumbnailWithTransform: true,
        kCGImageSourceThumbnailMaxPixelSize: 3000
      ] as CFDictionary) else { throw failure("The card photo could not be opened.") }
    return CIImage(cgImage: cg)
  }

  static func failure(_ message: String) -> NSError {
    NSError(domain: "CardScanner", code: 1, userInfo: [NSLocalizedDescriptionKey: message])
  }

  static func zeroOrigin(_ image: CIImage) -> CIImage {
    image.transformed(by: CGAffineTransform(translationX: -image.extent.minX, y: -image.extent.minY))
  }

  // Normalized coordinates use a top-left origin, like the crop UI.
  static func prepare(_ url: URL, crop: [Double]) throws -> (CIImage, [Double], Bool) {
    let original = try open(url)
    var image = original
    var bounds: [Double] = [0, 0, 1, 1]
    if crop.count == 4 {
      guard crop.allSatisfy({ $0.isFinite }), crop[0] >= 0, crop[1] >= 0,
        crop[2] >= 0.05, crop[3] >= 0.05, crop[0] + crop[2] <= 1.001, crop[1] + crop[3] <= 1.001 else {
        throw failure("Choose a rectangle around the whole card.")
      }
      let e = image.extent
      image = zeroOrigin(image.cropped(to: CGRect(x: crop[0] * e.width, y: (1 - crop[1] - crop[3]) * e.height, width: crop[2] * e.width, height: crop[3] * e.height).intersection(e)))
      bounds = crop
      // Respect the user's crop, including borderless/full-art cards.
      return (image, bounds, false)
    }
    let request = VNDetectRectanglesRequest()
    request.maximumObservations = 12
    request.minimumConfidence = 0.45
    request.minimumAspectRatio = 0.48
    request.maximumAspectRatio = 0.88
    request.minimumSize = 0.18
    request.quadratureTolerance = 30
    try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
    let e = image.extent
    func score(_ rect: VNRectangleObservation) -> Double {
      let b = rect.boundingBox
      let ratio = b.width * e.width / (b.height * e.height)
      guard ratio > 0.43 && ratio < 1.05 else { return -1 }
      let centerDistance = hypot(b.midX - 0.5, b.midY - 0.5)
      return Double(b.width * b.height) * 2 - centerDistance * 1.5 - abs(ratio - 0.716) * 0.5
    }
    if let rect = request.results?.max(by: { score($0) < score($1) }), score(rect) > -0.15 {
      func point(_ p: CGPoint) -> CIVector { CIVector(x: p.x * e.width, y: p.y * e.height) }
      let corrected = image.applyingFilter("CIPerspectiveCorrection", parameters: [
        "inputTopLeft": point(rect.topLeft), "inputTopRight": point(rect.topRight),
        "inputBottomLeft": point(rect.bottomLeft), "inputBottomRight": point(rect.bottomRight)
      ])
      if corrected.extent.width > 100 && corrected.extent.height > 140 {
        let b = rect.boundingBox
        bounds = [b.minX, 1 - b.maxY, b.width, b.height]
        image = zeroOrigin(corrected)
        return (image, bounds, true)
      }
    }
    return (image, bounds, false)
  }

  static func read(_ image: CIImage, language: String, words: [String], correction: Bool) throws -> [VNRecognizedTextObservation] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = correction
    request.customWords = correction ? Array(words.prefix(5000)) : []
    request.minimumTextHeight = 0.005
    let supported = try request.supportedRecognitionLanguages()
    let wanted = language == "ja" ? ["ja-JP", "en-US"] : ["en-US"]
    request.recognitionLanguages = wanted.filter { supported.contains($0) }
    if language == "ja" && !supported.contains("ja-JP") {
      throw failure("Japanese text recognition is not available on this device. Try searching by the card number.")
    }
    try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
    return (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
  }

  static func text(_ lines: [VNRecognizedTextObservation], alternatives: Int = 1) -> String {
    lines.flatMap { $0.topCandidates(alternatives).map { $0.string } }.joined(separator: "\n")
  }

  static func region(_ image: CIImage, top: CGFloat, height: CGFloat, targetWidth: CGFloat) -> CIImage {
    let e = image.extent
    let part = zeroOrigin(image.cropped(to: CGRect(x: 0, y: e.height * (1 - top - height), width: e.width, height: e.height * height)))
    let scale = min(3, max(1, targetWidth / e.width))
    return part.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
  }

  static func feature(_ image: CIImage) throws -> VNFeaturePrintObservation {
    let request = VNGenerateImageFeaturePrintRequest()
    request.imageCropAndScaleOption = .scaleFill
    try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
    guard let result = request.results?.first else { throw failure("This picture could not be compared.") }
    return result
  }

  static func recognize(_ url: URL, language: String, words: [String], crop: [Double] = [], detailed: Bool = false) throws -> [String: Any] {
    let started = Date()
    let (image, bounds, detected) = try prepare(url, crop: crop)
    let prepared = Date()
    // Read the whole card at a useful text resolution; preserve the original
    // crop for the small footer and any optional detailed pass.
    let scale = min(1, 1600 / max(image.extent.width, image.extent.height))
    let whole = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    let lines = try read(whole, language: language, words: words, correction: true)
    let wholeRead = Date()
    let footerImage = region(image, top: 0.76, height: 0.24, targetWidth: 1800)
    let footer = try read(footerImage, language: "en", words: [], correction: false)
    let footerRead = Date()
    var extra: [String: String] = [:]
    if detailed { extra = try refine(image, language: language, words: words) }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent("card-scanner", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    // These disposable previews never enter backups or the cloud.
    let old = (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey])) ?? []
    let newestFirst = old.sorted {
      ((try? $0.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast) >
      ((try? $1.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast)
    }
    for (index, file) in newestFirst.enumerated() {
      let date = (try? file.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
      if index >= 8 || date < Date().addingTimeInterval(-86400) { try? FileManager.default.removeItem(at: file) }
    }
    let preview = directory.appendingPathComponent(UUID().uuidString + ".jpg")
    try context.writeJPEGRepresentation(of: image, to: preview, colorSpace: CGColorSpaceCreateDeviceRGB(), options: [:])
    return ["text": text(lines),
      "topText": text(lines.filter { $0.boundingBox.midY > 0.73 }, alternatives: 3) + "\n" + (extra["topText"] ?? ""),
      "bottomText": text(footer, alternatives: 3) + "\n" + text(lines.filter { $0.boundingBox.midY < 0.24 }) + "\n" + (extra["bottomText"] ?? ""),
      "photoUri": preview.absoluteString, "crop": bounds, "autoCropped": detected,
      "timings": ["prepareMs": prepared.timeIntervalSince(started) * 1000, "wholeMs": wholeRead.timeIntervalSince(prepared) * 1000,
        "footerMs": footerRead.timeIntervalSince(wholeRead) * 1000, "totalMs": Date().timeIntervalSince(started) * 1000]]
  }

  static func refine(_ image: CIImage, language: String, words: [String]) throws -> [String: String] {
    let header = try read(region(image, top: 0, height: 0.34, targetWidth: 1800), language: language, words: words, correction: true)
    let footer = region(image, top: 0.76, height: 0.24, targetWidth: 2200)
      .applyingFilter("CIColorControls", parameters: ["inputSaturation": 0, "inputContrast": 1.6])
    let numbers = try read(footer, language: "en", words: [], correction: false)
    return ["text": "", "topText": text(header, alternatives: 3), "bottomText": text(numbers, alternatives: 2)]

  }
}
