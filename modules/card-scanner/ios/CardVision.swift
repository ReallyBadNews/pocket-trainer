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
  // `fromCamera` marks a live-camera photo: the card sits in the centred guide, often among binder neighbours.
  static func prepare(_ url: URL, crop: [Double], fromCamera: Bool = false) throws -> (CIImage, [Double], Bool) {
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
    let e = image.extent
    if let card = try findCard(image) {
      func point(_ p: CGPoint) -> CIVector { CIVector(x: p.x * e.width, y: p.y * e.height) }
      let corrected = image.applyingFilter("CIPerspectiveCorrection", parameters: [
        "inputTopLeft": point(card[0]), "inputTopRight": point(card[1]),
        "inputBottomRight": point(card[2]), "inputBottomLeft": point(card[3])
      ])
      if corrected.extent.width > 100 && corrected.extent.height > 140 {
        let xs = card.map(\.x), ys = card.map(\.y)
        bounds = [Double(xs.min()!), Double(1 - ys.max()!), Double(xs.max()! - xs.min()!), Double(ys.max()! - ys.min()!)]
        return (zeroOrigin(corrected), bounds, true)
      }
    }
    // No card found. A chosen photo is read whole: it is often a close-up whose card fills the frame, and
    // its edges are cut off by a smaller area. A live-camera photo reads a card-shaped area in the middle,
    // around the guide, rather than the whole frame and its neighbours. autoCropped stays false either
    // way, so the camera still asks to move closer.
    guard fromCamera, abs(e.width / e.height - 0.716) > 0.03 else { return (image, bounds, false) }
    let width = min(e.width * 0.8, e.height * 0.9 * 0.716), height = width / 0.716
    let middle = CGRect(x: (e.width - width) / 2, y: (e.height - height) / 2, width: width, height: height)
    bounds = [Double(middle.minX / e.width), Double(middle.minY / e.height), Double(width / e.width), Double(height / e.height)]
    return (zeroOrigin(image.cropped(to: middle)), bounds, false)
  }

  /// Corners in Vision's normalized, bottom-left-origin space: top left, top right, bottom right, bottom left.
  typealias Quad = [CGPoint]

  // Vision's rectangle detector mostly traces the inner edge of a card's border, and the busy art of
  // ex, V and GX cards breaks that edge up. So look at the frame a few ways and keep the most
  // card-shaped quad near the middle: the photo, its negative (dark binder gaps turn bright and
  // outline the card), a lifted grayscale, and the photo and negative again inside the area document
  // segmentation marks. Each look costs several milliseconds, so stop early when two agree.
  static func findCard(_ photo: CIImage) throws -> Quad? {
    // Normalized corners don't depend on scale, and the filters render faster on a smaller copy.
    let scale = min(1, 1024 / max(photo.extent.width, photo.extent.height))
    let image = zeroOrigin(photo.transformed(by: CGAffineTransform(scaleX: scale, y: scale)))
    let negative = image.applyingFilter("CIColorInvert")
    var looks = [try rectangles(image), try rectangles(negative)]
    // The photo and its negative finding the same card settles most photos.
    if let best = bestCard(looks, size: image.extent.size), best.agreeing > 0 { return best.quad }
    looks.append(try rectangles(image.applyingFilter("CIColorControls", parameters: ["inputSaturation": 0])
      .applyingFilter("CIGammaAdjust", parameters: ["inputPower": 0.5])))
    let documents = VNDetectDocumentSegmentationRequest()
    try VNImageRequestHandler(ciImage: image, options: [:]).perform([documents])
    if let document = documents.results?.first, document.confidence >= 0.3 {
      let corners = [document.topLeft, document.topRight, document.bottomRight, document.bottomLeft]
      // A confident segmentation is a candidate itself; it is rounder than the detector's quads.
      if document.confidence >= 0.7 { looks.append([corners]) }
      let xs = corners.map(\.x), ys = corners.map(\.y)
      let found = CGRect(x: xs.min()!, y: ys.min()!, width: xs.max()! - xs.min()!, height: ys.max()! - ys.min()!)
      let window = found.insetBy(dx: -found.width * 0.12, dy: -found.height * 0.12).intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
      if window.width > 0.1 && window.height > 0.1 {
        looks += [try rectangles(image, in: window), try rectangles(negative, in: window)]
      }
    }
    return bestCard(looks, size: image.extent.size)?.quad
  }

  /// The most card-shaped quad near the middle, and how many other looks found the same corners.
  static func bestCard(_ looks: [[Quad]], size: CGSize) -> (quad: Quad, agreeing: Int)? {
    var best: (quad: Quad, agreeing: Int, score: Double)?
    for (look, quads) in looks.enumerated() {
      for quad in quads {
        let p = quad.map { CGPoint(x: $0.x * size.width, y: $0.y * size.height) }
        let top = hypot(p[0].x - p[1].x, p[0].y - p[1].y), right = hypot(p[1].x - p[2].x, p[1].y - p[2].y)
        let bottom = hypot(p[2].x - p[3].x, p[2].y - p[3].y), left = hypot(p[3].x - p[0].x, p[3].y - p[0].y)
        guard min(top, right, bottom, left) > 1 else { continue }
        // Shape from the corners, so a tilted card still measures 63 × 88 mm and half a card or a
        // card with its neighbour does not.
        let aspect = Double((top + bottom) / (left + right))
        let skew = max(top / bottom, bottom / top, left / right, right / left)
        var area: CGFloat = 0
        for i in 0..<4 { area += p[i].x * p[(i + 1) % 4].y - p[(i + 1) % 4].x * p[i].y }
        let share = Double(abs(area) / 2 / (size.width * size.height))
        guard abs(aspect - 0.716) <= 0.12, skew <= 1.35, share >= 0.08 else { continue }
        let center = Double(hypot(quad.map(\.x).reduce(0, +) / 4 - 0.5, quad.map(\.y).reduce(0, +) / 4 - 0.5))
        let agreeing = looks.enumerated().filter { other in
          other.offset != look && other.element.contains { zip(quad, $0).allSatisfy { hypot($0.x - $1.x, $0.y - $1.y) < 0.03 } }
        }.count
        // Size matters less than shape and position: a card plus a sliver of its neighbour is bigger.
        let score = share * 0.5 - center * 1.5 - abs(aspect - 0.716) * 4 + Double(min(agreeing, 2)) * 0.05
        if score > -0.5 && score > best?.score ?? -.infinity { best = (quad, agreeing, score) }
      }
    }
    return best.map { ($0.quad, $0.agreeing) }
  }

  /// Rectangles in `window` (normalized, bottom-left origin) of the image, in whole-image coordinates.
  static func rectangles(_ image: CIImage, in window: CGRect = CGRect(x: 0, y: 0, width: 1, height: 1)) throws -> [Quad] {
    let e = image.extent
    let area = CGRect(x: e.minX + window.minX * e.width, y: e.minY + window.minY * e.height, width: window.width * e.width, height: window.height * e.height)
    let request = VNDetectRectanglesRequest()
    request.maximumObservations = 12
    request.minimumConfidence = 0.45
    request.minimumAspectRatio = 0.48
    request.maximumAspectRatio = 0.88
    request.minimumSize = 0.18
    request.quadratureTolerance = 30
    try VNImageRequestHandler(ciImage: zeroOrigin(image.cropped(to: area)), options: [:]).perform([request])
    return (request.results ?? []).map { rect in
      [rect.topLeft, rect.topRight, rect.bottomRight, rect.bottomLeft].map {
        CGPoint(x: window.minX + $0.x * window.width, y: window.minY + $0.y * window.height)
      }
    }
  }

  static func read(_ image: CIImage, language: String, words: [String], correction: Bool) throws -> [VNRecognizedTextObservation] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = correction
    request.customWords = correction ? Array(words.prefix(5000)) : []
    request.minimumTextHeight = 0.005
    // "auto" lets Vision pick the script; JavaScript identifies the card language from the text.
    // Listing several CJK languages instead only uses the first one.
    if language == "auto" {
      request.automaticallyDetectsLanguage = true
      try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
      return (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
    }
    let supported = try request.supportedRecognitionLanguages()
    let locale = ["ja": "ja-JP", "ko": "ko-KR", "zh-cn": "zh-Hans", "zh-tw": "zh-Hant"][language] ?? "en-US"
    let wanted = locale == "en-US" ? [locale] : [locale, "en-US"]
    request.recognitionLanguages = wanted.filter { supported.contains($0) }
    if !supported.contains(locale) {
      let name = ["ja": "Japanese", "ko": "Korean", "zh-cn": "Simplified Chinese", "zh-tw": "Traditional Chinese"][language] ?? "English"
      throw failure("\(name) text recognition is not available on this device. Try searching by the card number.")
    }
    try VNImageRequestHandler(ciImage: image, options: [:]).perform([request])
    return (request.results ?? []).sorted { $0.boundingBox.midY > $1.boundingBox.midY }
  }

  static let warming = NSLock()
  static var warmed = Set<String>()

  // Vision loads its models on first use, which costs seconds; the camera calls this as it opens so
  // the first live frame doesn't pay. Reads a little rendered text the way `recognize` does: the
  // card's language, then the English footer pass. Failures only mean the first read is slower.
  @discardableResult static func warmUp(language: String) -> Bool {
    warming.lock()
    defer { warming.unlock() }
    if warmed.contains(language) { return true }
    guard let text = CIFilter(name: "CITextImageGenerator", parameters: [
      "inputText": "Pikachu  HP 60\n025/165", "inputFontSize": 36, "inputScaleFactor": 1
    ])?.outputImage else { return false }
    let image = zeroOrigin(text.composited(over: CIImage(color: .white)).cropped(to: text.extent.insetBy(dx: -60, dy: -120)))
    do {
      if warmed.isEmpty { _ = try findCard(image) }
      _ = try read(image, language: language, words: [], correction: true)
      if language != "en" && !warmed.contains("en") { _ = try read(image, language: "en", words: [], correction: false) }
    } catch { return false }
    warmed.formUnion([language, "en"])
    return true
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

  static func recognize(_ url: URL, language: String, words: [String], crop: [Double] = [], detailed: Bool = false, fromCamera: Bool = false) throws -> [String: Any] {
    let started = Date()
    let (image, bounds, detected) = try prepare(url, crop: crop, fromCamera: fromCamera)
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
