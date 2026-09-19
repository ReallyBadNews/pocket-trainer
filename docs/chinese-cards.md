# Chinese cards

The scan screen offers Simplified Chinese (`zh-cn`) and Traditional Chinese (`zh-tw`) separately. Both support printed and English Pokémon names, set codes, card numbers, type filters, collection saving and backups. Chinese species names also work in the Pokédex. Binder entries show ZH-CN or ZH-TW and can be filtered with the Chinese chip. The World collector badge requires any two card languages.

Apple Vision uses `zh-Hans` or `zh-Hant` for the name pass, with English retained for Latin set codes. The enlarged footer passes still disable language correction. Two-character Pokémon names such as 伊布 count as names. Gem Pack numbers preserve the card group and variant: `17 07/07` and OCR's joined `1707/07` both identify CBB4C-1707. A different variant such as `17 06/07` does not get exact-printing evidence for that card.

## Coverage and sources

The September 18, 2026 snapshot adds 7,436 Traditional Chinese cards and 48 Simplified Chinese TCGdex cards. The Simplified endpoint also returned 829 Traditional Chinese SV entries; the refresh excludes those non-C-prefixed set identities instead of relabeling them as mainland printings. Simplified coverage is consequently very limited. Refresh just the Chinese data with `python3 scripts/refresh-catalog.py --languages zh-cn zh-tw`, or use the normal full refresh command.

`src/data/card-supplements.json` adds the supplied Simplified Chinese 四季鹿 (Deerling) photo as CBB4C-1707: printed number `17 07/07`, HP 70, Grass, three-star rarity, holo, Pokédex #585. These details were transcribed from the supplied card, not inferred from a Japanese printing. The set is [Pokémon宝石包VOL.4](https://www.pokemon.cn/post_products/pokemon%E5%AE%9D%E7%9F%B3%E5%8C%85vol-4); TCGdex lists the set with no card details. Supplemental records survive refreshes and open offline. No reference artwork or market price is supplied for this card. The photo itself is not bundled in the repository.

Catalog metadata counts include supplements (49 Simplified Chinese cards in total). Upstream card indexes and classifications remain generated data. [TCGdex language codes](https://tcgdex.dev/errors/language-invalid) and [PokéAPI species names](https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv) supply the remaining Chinese metadata.

## Missing cards

Choose **Enter an unlisted card** in either Chinese language. Enter the printed name, set code and full collector fraction, then choose Pokémon, Trainer or Energy. Pokémon links are optional and explicitly selected; Trainer and Energy entries never unlock species. Review the printing and quantity before saving. Manual IDs preserve language, set, collector number and Gem Pack variant independently. They carry no automatic market value.

On iOS, the selected photo is copied into app documents when saving a manual card or a catalog card with no reference artwork. Photos remain on-device. As with existing backups, device-local pictures are excluded from JSON exports; metadata and Pokémon links survive. Browser manual entries save metadata without a photo.

## Validation

The production `CardVision.swift` core compiled and read the original supplied photo on macOS. Its footer contained `CBB4C` and `1707/07`; ranking returned CBB4C-1707 first with exact set/number evidence. Automatic rectangle detection did not crop this photo, but recognition still succeeded. The text-only output is retained in `tests/fixtures/scan-chinese-text.json`.

Regression tests cover both scripts, English aliases, two-character names, Gem Pack variants, the real photo OCR, offline supplemental details, manual input validation, language/printing identity, backup round trips and separate price caches. iPhone-width browser checks cover language selection, search and card review. Native camera and photo persistence still need a physical iPhone check after rebuilding the app; an OTA JavaScript update cannot add the new native OCR languages.
