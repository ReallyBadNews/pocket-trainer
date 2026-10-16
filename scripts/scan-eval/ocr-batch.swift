// Batch OCR for the scan accuracy harness, using the production recognition core. Vision's first read in a
// process takes seconds (model warm-up), so one process warms up once and then reads every photo.
//
//   swiftc -O -parse-as-library scripts/scan-eval/ocr-batch.swift modules/card-scanner/ios/CardVision.swift \
//     -o /tmp/scan-eval/bin/ocr-batch
//   /tmp/scan-eval/bin/ocr-batch <manifest.json> <out.jsonl> [--repo .] [--modes specific,auto]
//     [--previews /tmp/scan-eval/previews] [--only <id substring>] [--resume]
//
// For each photo and mode ("specific" = the card's own language, "auto" = Auto-detect) this runs
// CardVision.recognize like the app, then CardVision.refine on the cropped preview recognize saved, and writes one
// JSON line: {id, file, language, recognize, refine, refines, preview}. `refine` is the pass in the language the
// app would refine in; for auto that is the script guess below (both Chinese catalogs when the text is Chinese),
// and `refines` keys every refine pass by language so JavaScript can pick the one matching detectCardLanguage.
// macOS checks cannot substitute for the physical iPhone camera test.
import Foundation

@main struct OCRBatch {
  static var wordCache: [String: [String]] = [:]

  /// The app's recognitionWords(language): unique names in catalog order, then supplemental cards. CardVision
  /// keeps the first 5000 itself.
  static func words(_ language: String, repo: URL) throws -> [String] {
    if language == "auto" { return [] }
    if let cached = wordCache[language] { return cached }
    let data = try Data(contentsOf: repo.appendingPathComponent("src/data/cards-\(language).json"))
    let cards = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
    var seen = Set<String>(), ids = Set<String>(), names: [String] = []
    for card in cards {
      if let id = card["id"] as? String { ids.insert(id) }
      if let name = card["name"] as? String, seen.insert(name).inserted { names.append(name) }
    }
    if let extra = try? Data(contentsOf: repo.appendingPathComponent("src/data/card-supplements.json")),
      let all = try? JSONSerialization.jsonObject(with: extra) as? [String: [String: [String: Any]]],
      let supplements = all[language] {
      for key in supplements.keys.sorted() {
        let card = supplements[key]!
        if let id = card["id"] as? String, ids.contains(id) { continue }
        if let name = card["name"] as? String, seen.insert(name).inserted { names.append(name) }
      }
    }
    wordCache[language] = names
    return names
  }

  /// Mirrors the script test in detectCardLanguage/textLanguage (src/lib/language-detect.ts). Chinese also needs
  /// catalog matches to pick a script, so both Chinese refine passes run and JavaScript chooses.
  static func refineLanguages(_ scan: [String: Any]) -> [String] {
    let body = "\(scan["topText"] as? String ?? "")\n\(scan["text"] as? String ?? "")"
    var hangul = 0, kana = 0, han = 0
    for s in body.unicodeScalars {
      switch s.value {
      case 0xAC00...0xD7AF: hangul += 1
      case 0x3041...0x3096, 0x30A1...0x30FA: kana += 1
      case 0x4E00...0x9FFF: han += 1
      default: break
      }
    }
    if hangul + kana + han < 3 { return ["en"] }
    var h = 0, k = 0, c = 0
    for s in body.precomposedStringWithCompatibilityMapping.unicodeScalars {
      switch s.value {
      case 0xAC00...0xD7AF, 0x1100...0x11FF, 0x3130...0x318F: h += 1
      case 0x3041...0x3096, 0x30A1...0x30FA: k += 1
      case 0x4E00...0x9FFF, 0x3400...0x4DBF: c += 1
      default: break
      }
    }
    let cjk = Double(h + k + c)
    if cjk == 0 { return ["en"] }
    if Double(h) >= max(1, cjk * 0.3) { return ["ko"] }
    if Double(k) >= max(1, cjk * 0.08) { return ["ja"] }
    if c == 0 { return ["en"] }
    return ["zh-tw", "zh-cn"]
  }

  static func json(_ value: Any) -> String {
    let data = (try? JSONSerialization.data(withJSONObject: value, options: [.sortedKeys, .withoutEscapingSlashes])) ?? Data("{}".utf8)
    return String(data: data, encoding: .utf8)!
  }

  static func main() throws {
    var positional: [String] = []
    var options: [String: String] = [:]
    var args = Array(CommandLine.arguments.dropFirst())
    while !args.isEmpty {
      let a = args.removeFirst()
      if a == "--resume" { options["resume"] = "1" } else if a.hasPrefix("--") { options[String(a.dropFirst(2))] = args.isEmpty ? "" : args.removeFirst() } else { positional.append(a) }
    }
    guard positional.count == 2 else {
      FileHandle.standardError.write(Data("usage: ocr-batch <manifest.json> <out.jsonl> [--repo dir] [--modes specific,auto] [--previews dir] [--only substr] [--resume]\n".utf8))
      exit(2)
    }
    let repo = URL(fileURLWithPath: options["repo"] ?? FileManager.default.currentDirectoryPath)
    let modes = (options["modes"] ?? "specific,auto").split(separator: ",").map(String.init)
    let previews = URL(fileURLWithPath: options["previews"] ?? "/tmp/scan-eval/previews", isDirectory: true)
    try FileManager.default.createDirectory(at: previews, withIntermediateDirectories: true)
    let manifest = try JSONSerialization.jsonObject(with: Data(contentsOf: URL(fileURLWithPath: positional[0]))) as! [String: Any]
    var photos = (manifest["photos"] as! [[String: Any]]).filter { FileManager.default.fileExists(atPath: $0["file"] as! String) }
    if let only = options["only"] { photos = photos.filter { ($0["id"] as! String).contains(only) } }

    let outURL = URL(fileURLWithPath: positional[1])
    var done = Set<String>()
    if options["resume"] != nil, let existing = try? String(contentsOf: outURL, encoding: .utf8) {
      for line in existing.split(separator: "\n") {
        if let row = try? JSONSerialization.jsonObject(with: Data(line.utf8)) as? [String: Any], row["error"] == nil,
          let id = row["id"] as? String, let mode = row["mode"] as? String { done.insert("\(id)|\(mode)") }
      }
    } else {
      FileManager.default.createFile(atPath: outURL.path, contents: nil)
    }
    let out = try FileHandle(forWritingTo: outURL)
    out.seekToEndOfFile()

    // Warm up every recognizer this run uses, so per-photo timings reflect steady state.
    if let first = photos.first {
      let url = URL(fileURLWithPath: first["file"] as! String)
      var languages = Set(photos.map { ($0["expected"] as! [String: Any])["language"] as! String })
      if modes.contains("auto") { languages.formUnion(["auto", "en"]) }
      for language in languages.sorted() {
        let started = Date()
        _ = try? CardVision.recognize(url, language: language, words: try words(language, repo: repo), fromCamera: true)
        FileHandle.standardError.write(Data("warm-up \(language): \(Int(Date().timeIntervalSince(started) * 1000)) ms\n".utf8))
      }
    }

    var count = 0
    for photo in photos {
      let id = photo["id"] as! String
      let file = photo["file"] as! String
      let expected = (photo["expected"] as! [String: Any])["language"] as! String
      let preview = previews.appendingPathComponent("\(id).jpg")
      for mode in modes {
        let language = mode == "auto" ? "auto" : expected
        if done.contains("\(id)|\(mode)") { continue }
        var row: [String: Any] = ["id": id, "file": file, "mode": mode, "language": language]
        do {
          let started = Date()
          // The bench photos stand in for live-camera frames of a binder page.
          var scan = try CardVision.recognize(URL(fileURLWithPath: file), language: language, words: try words(language, repo: repo), fromCamera: true)
          scan["wallMs"] = Date().timeIntervalSince(started) * 1000
          // recognize keeps only the newest few previews, so keep a copy for refine, artwork checks and review.
          let photoUri = URL(string: scan["photoUri"] as! String)!
          try? FileManager.default.removeItem(at: preview)
          try FileManager.default.copyItem(at: photoUri, to: preview)
          row["preview"] = preview.path
          row["recognize"] = scan
          var refines: [String: Any] = [:]
          let refineIn = language == "auto" ? refineLanguages(scan) : [language]
          for lang in refineIn {
            let t = Date()
            var extra: [String: Any] = try CardVision.refine(CardVision.open(preview), language: lang, words: try words(lang, repo: repo))
            extra["wallMs"] = Date().timeIntervalSince(t) * 1000
            extra["language"] = lang
            refines[lang] = extra
          }
          row["refine"] = refines[refineIn[0]]
          row["refines"] = refines
        } catch {
          row["error"] = error.localizedDescription
        }
        out.write(Data((json(row) + "\n").utf8))
        count += 1
        if count % 20 == 0 { FileHandle.standardError.write(Data("\(count) reads\n".utf8)) }
      }
    }
    out.closeFile()
    FileHandle.standardError.write(Data("done: \(count) reads\n".utf8))
  }
}
