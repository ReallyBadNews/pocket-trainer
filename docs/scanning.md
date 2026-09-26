# Card identification (build 4)

The original scanner ran one Apple Vision text-recognition pass across the entire photo. It searched the local TCGdex catalog using the printed name and collector fraction. It did not compare artwork. Binder neighbors, tiny footer text, foil glare, and stylized Mega/ex lettering could cause poor suggestions. Switching languages also cleared the previous matches without reading the photo again.

## Current flow

1. Normalize photo orientation and retain up to 3,000 pixels on the longest edge. Try to locate a centered card rectangle and correct its perspective. If no suitable edges are detected, keep the original photo. The displayed preview shows what is being read.
2. First read the whole card and an enlarged footer, then show usable matches immediately. Only ambiguous scans run an enlarged header and contrast-adjusted footer pass. The name pass uses English/Japanese card names as custom vocabulary; number passes disable word correction. Alternative OCR readings help with stylized lettering.
3. Rank the bundled catalog using header names, approximate spelling, collector number, set size, and set code. Recognized Mega lettering favors Mega versions. Missing “ex” lettering can still match when the underlying name and number agree. Collector parsing repairs common letter/digit confusion and full-width Japanese digits.
4. For close text matches, compare the photo with up to six smaller public reference images using Apple Vision image features. This happens locally after the first suggestions are usable. Only catalog image downloads go online; the user's photo is never uploaded. Missing images, network errors, and uninformative picture comparisons retain text-based suggestions. An exact set-code/number match is protected from this tie-breaking step.
5. The user checks the exact picture, set and number before adding a card. Edition/foil choices remain manual. No scanner result automatically modifies the binder.

“Adjust crop” opens the original photo with four draggable corners. “Read this card” reruns recognition on that selection. “Read again” retries the current selection. Changing languages also rereads the photo. Manual name/number search remains available; “Mega Charizard” also finds catalog names written “M Charizard EX.”

## Language detection

Auto-detect is the default. The first whole-card pass sets Apple Vision's `automaticallyDetectsLanguage` rather than a fixed language. Listing several CJK languages does not work, because Vision then uses only the first. `detectCardLanguage` then classifies the card body text. The footer is excluded because it is always read with the English model.

- Hangul means Korean; kana means Japanese; fewer than three CJK characters means English.
- Han text without kana is Chinese. An exact set/number printing in one Chinese catalog decides first. Otherwise Simplified or Traditional character forms decide (基础/基礎, 宝可梦/寶可夢, and characters that differ between the two scripts' Pokémon names). With no evidence either way, the stronger catalog match decides. A name match alone never overrides character evidence, because both scripts share many names (四季鹿) and mainland coverage is thin.

The optional detailed pass, ranking, manual entry and search then use the detected language. The scan screen shows what it read ("Read as 한국어 · Korean"); choosing a language chip turns detection off and rereads the photo. In auto mode, typed searches start with the detected language, or the query's script, and otherwise show matches from every catalog, so `CBB4C 17 07/07` works without choosing a language. Japanese, Korean and Traditional Chinese share set codes, so `SV4K 001/066` lists all three printings, each labeled with its language.

On macOS, the production core's auto pass read and classified all nine samples in `tests/fixtures/scan-auto-text.json`. These are the user's four photos, Korean SV5K retailer scans, and Japanese, Traditional Chinese and English reference images. Timing matched single-language reads (about 0.4–0.5 s). The Korean and reference images are clean scans, not phone photos.

## English set codes

English cards print a set abbreviation beside the regulation mark (`30C EN`, `MEG EN`) rather than the TCGdex set ID (`30th`, `me01`). The catalog refresh stores each English set's official abbreviation in `sets-en.json`, and ranking treats it as exact-printing evidence when it appears, uppercase, in the footer next to a matching collector number. OCR often joins the code and language box (`30CEN`); both forms count. Matching is case-sensitive so words in flavor text, such as "Mew", are not mistaken for the MEW (151) code. Other languages already print their TCGdex set IDs (`SV5K`, `CBB4C`).

The 30th Celebration (`30th`, 128 + 30 secret) and 30th Classic Collection (`30th-c`) sets share the `30C` code. The supplied Illumise 004/128 and Nidoran♀ 087/128 photos read `30C EN` / `30CEN` and rank as exact printings. The sleeved Pikachu 044/128 photo lost its code to glare but still ranks first by name and number; its Pikachu badge fraction (`22/30`) does not surface a Classic Collection card. The production OCR output for all three is kept in `tests/fixtures/scan-30th-text.json`.

Collector totals are shown and searched zero-padded to the number's width (`001/066`), as printed.

## Images

`src/data/image-overrides.json` repairs 154 verified links for Dragon Majesty and Shining Legends, whose catalog IDs contain a dot but whose image-server paths do not. Overrides are keyed to the exact language and card ID and survive metadata refreshes. They also apply to saved cards without an image link. Review/detail fetching retains an override if the API omits its image field.

The image component tries alternate size/format URLs when a download fails and resets its failure state when the card changes. Its small placeholder is readable. Some catalog entries, including McDonald's Collection 2024 Charizard, still have no known reference artwork; the app does not substitute a different printing.

## Validation and limits

- 24 JavaScript tests cover collection behavior, bilingual search, noisy Mega/ex names and numbers, exact-printing priority, safe crop bounds, image overrides, and actual Apple Vision output fixtures.
- `scripts/ocr-smoke.swift` compiles with the production `CardVision.swift` core. The public Wugtrio ex SV5K-025 and Mega Charizard EX xy2-69 images ranked correctly. The card area extracted from the user's low-resolution binder screenshot also ranked SV5K-025 first.
- The production core detected a public reference card composited onto a plain synthetic background. The binder screenshot did **not** yield reliable automatic edges; its OCR still produced useful clues, and the manual crop succeeded.
- The production picture-comparison path favored SV5K-025 over its SV5K-087 alternate art, while an unavailable image returned a nonfatal miss. This is a small check, not an accuracy benchmark.
- The crop component was visually checked in a temporary phone-size browser harness, including dragging and submitting updated coordinates. The test route and sample asset were removed before packaging. These checks do not substitute for physical iPhone testing.

No paid recognition service is configured. Picture comparison cannot search the whole catalog without text clues, and many Japanese catalog entries lack reference images. Blurry numbers, sleeve glare, extreme perspective, and cards cropped out of frame can still require another photo or manual search.

## Card types

`card-types.json` classifies every bundled English/Japanese physical card from TCGdex category, trainer-type and TAG TEAM-GX indexes. Trainer includes its Item, Stadium, Supporter and Tool subtypes. Exact names identify the six TAG TEAM Supporters because TCGdex does not assign those cards the Pokémon TAG TEAM-GX suffix. Legacy Trainers with no subtype remain in Trainer. Refresh with `scripts/refresh-card-types.py`; the catalog refresh script also invokes it.

The scanner uses printed type headings as ranking evidence. Search and binder filters cover Pokémon, Trainer, Item, Energy, TAG TEAM and Stadium. Basic Energy with only a generic ENERGY heading is not treated as a named card; energy-type shortcuts help narrow the manual search. Exact printing still requires checking artwork, set and number.

TAG TEAM Pokémon unlock all distinct linked species, including three-Pokémon cards. Trainers (including TAG TEAM Supporters), Items, Stadiums and Energy increase binder counts and collecting badges without unlocking Pokémon. Category/subtype metadata survives backup export/import; older saved cards use the bundled classifications.

See [performance measurements and progressive scanning](scan-performance.md). The official [TAG TEAM Supporter overview](https://www.pokemon.com/us/strategy/tag-team-supporters-take-control-in-the-pokemon-tcg-sun-moon-cosmic-eclipse-expansion) and [TCGdex field indexes](https://tcgdex.dev/rest/other-fields) describe the source classifications.
