# Card-scan accuracy harness

Measures how often the scanner identifies the right printing, using the production Vision core
(`modules/card-scanner/ios/CardVision.swift`) on macOS and the app's JavaScript ranking. The corpus is synthetic phone
photos of sleeved binder cards built from TCGdex art, plus real photos. macOS results cannot replace a test on a
physical iPhone.

Scratch data lives in `/tmp/scan-eval/` (about 150 MB). Run every command from the repo root.

## 1. Generate the corpus

```sh
node scripts/scan-eval/generate.cjs            # --seed 20261015 --jobs 6 --real /tmp/scan-lab/photos
```

This samples 100 cards with a fixed seed: 30 recent English main-set cards, 20 English Black Star promos, 20 older
English cards, 15 Japanese, 5 Traditional Chinese and 10 many-printing names. It downloads `high.png` art to
`art/`, renders `photos/*.jpg`, and writes `manifest.json` with each photo's expected card, language, rendering
parameters and the card's true corners. The renderer composes a binder page with neighbouring cards, rotation,
perspective, sleeve haze and glare (inner-sleeve rims on about half), uneven light, blur, noise and JPEG compression. Every fourth photo is "hard":
strong glare over the header or footer, more blur, a smaller card. Real photos in `--real` named in `REAL_PHOTOS` are
copied in as `real-*`. `--limit N` and `--only <id>` render a few photos to `manifest.partial.json` for quick
visual checks.

## 2. Run OCR (macOS)

```sh
mkdir -p /tmp/scan-eval/bin
swiftc -O -parse-as-library scripts/scan-eval/ocr-batch.swift modules/card-scanner/ios/CardVision.swift \
  -o /tmp/scan-eval/bin/ocr-batch
/tmp/scan-eval/bin/ocr-batch /tmp/scan-eval/manifest.json /tmp/scan-eval/ocr.jsonl
```

One process warms Vision up once (the first read takes 6–20 s), then reads each photo twice: in the card's
own language and with Auto-detect. Each read runs `recognize` with the app's vocabulary, then `refine` on the
cropped preview. `--resume` skips reads already in the output, and `--only <id>` limits the run. Cropped previews
are kept in `/tmp/scan-eval/previews/` so you can check what auto-crop picked.

## 3. Evaluate

```sh
npx tsc -p tsconfig.test.json                  # or --outDir /tmp/scan-eval/build-x for a second build
node scripts/scan-eval/evaluate.cjs /tmp/scan-eval/ocr.jsonl /tmp/scan-eval/manifest.json [.test-build] \
  [--json /tmp/scan-eval/eval.json]
```

The evaluator ranks the saved OCR like `scan-pipeline.ts` does. It reports top-1 accuracy after `recognize` and after
the refine merge, the live auto-accept rate (`!needsScanRefinement` on the first read) and wrong auto-accepts, which
are the worst outcome. It also lists each failure with what was read, the top candidates, and the likely causes:
crop failed or picked a neighbour, wrong language, name or number not read, missing set code, or a card missing
from the catalog. Point it at another build directory to compare ranking changes on the same OCR without reading
the photos again.

It also prints how often auto-crop found the card, and which crops overlap the true card by IoU < 0.8.

Optional artwork tie-break (`CardArtwork.compare`). The synthetic photos are made from the same TCGdex art the app
compares against, so this step flatters the synthetic results:

```sh
swiftc -O -parse-as-library scripts/scan-eval/artwork.swift modules/card-scanner/ios/CardVision.swift \
  -o /tmp/scan-eval/bin/artwork
node scripts/scan-eval/evaluate.cjs /tmp/scan-eval/ocr.jsonl /tmp/scan-eval/manifest.json --quiet \
  --emit-compare /tmp/scan-eval/compare.jsonl
/tmp/scan-eval/bin/artwork /tmp/scan-eval/compare.jsonl /tmp/scan-eval/artwork.jsonl
node scripts/scan-eval/evaluate.cjs /tmp/scan-eval/ocr.jsonl /tmp/scan-eval/manifest.json \
  --artwork /tmp/scan-eval/artwork.jsonl
```
