# Recognition performance — build 4

Photo identification uses Apple's on-device Vision OCR and image-feature models. It does not call an LLM. Handwritten ranking rules combine the extracted name, collector fraction, set code, category and optional artwork distance. No recognition service or photo upload is configured.

## Work removed from the critical path

Build 3 always ran four OCR requests: whole card, enlarged header, footer, and contrast-adjusted footer. It then waited for as many as 12 high-resolution reference images before finishing.

Build 4 publishes results after a whole-card pass and an enlarged-footer pass. The whole-card image is limited to 1,600 pixels on the longest edge for OCR; the original crop remains available for the small footer. A clear name/number or exact set/number match stops there. Ambiguous scans can run an additional header/contrast pass after the first results are visible. Optional picture comparison follows without disabling the result buttons or retake controls.

Artwork comparison downloads at most six `low.png` references, with a shorter per-request timeout and the existing feature cache. For the Wugtrio example, the PNG shrank from 420,902 to 71,896 bytes. Thumbnail feature comparison still preferred SV5K-025 to its alternate-art SV5K-087 printing in the local check. Network errors retain text matches.

Changing the card-type filter reuses the current OCR text; it does not reread the photo. Scan generation IDs prevent an old refinement from replacing a new scan, language selection, crop or card choice.

## Local measurements

Measured on Kenny Mini using the same production Swift core, with each sample processed in alternating old/new order over four iterations. The first iteration was discarded; values below are medians of the remaining three. These are native preprocessing/OCR times, excluding JavaScript ranking and artwork downloads. They are not iPhone measurements or an accuracy benchmark.

| Sample | Build 3 four-pass time | Build 4 first results |
|---|---:|---:|
| Wugtrio binder screenshot | 405 ms | 252 ms |
| Mega Charizard reference | 573 ms | 375 ms |
| Potion | 390 ms | 250 ms |
| Grass Energy | 376 ms | 194 ms |
| Viridian Forest | 586 ms | 400 ms |
| Pikachu & Zekrom GX | 814 ms | 560 ms |
| Arceus & Dialga & Palkia GX | 855 ms | 615 ms |
| Red & Blue | 591 ms | 388 ms |
| Japanese Switch | 345 ms | 231 ms |

First results were 28–48% faster in these checks. Eight of these nine first-pass results met the rule for skipping all optional processing. Basic Grass Energy still needed closer review because only its generic ENERGY heading and collector number were readable. Eleven native-output fixtures, including Japanese Stadium and Special Energy cards, ranked their expected exact printing first. Unit tests also verify early result publication, skipping unnecessary work, handling failed optional work, and suppressing stale results.

The user should test camera timing with the same physical cards after installing build 4. Sleeves, glare, blur, and dense binder pages can still require refinement or a manual crop.
