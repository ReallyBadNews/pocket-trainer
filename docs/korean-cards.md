# Korean cards

Korean cards are [detected automatically](scanning.md#language-detection), or you can choose Korean (`ko`) on the scan screen. It supports printed and English Pokémon names, set codes, card numbers, type filters, collection saving and backups. Korean species names also work in the Pokédex. Binder entries show KO and can be filtered with the Korean chip.

Apple Vision uses `ko-KR` for the name pass, with English retained for Latin set codes. Hangul Pokémon names can be two syllables (딩루, 뮤츠), so those count as names. Korean headings give type evidence: 트레이너스, 서포트 and 포켓몬의 도구 are Trainer; 굿즈 is Item; 스타디움 is Stadium; 기본 에너지 / 특수 에너지 is Energy.

## Coverage and sources

The September 26, 2026 snapshot has 239 Korean cards, from 고대의 포효 (SV4K), 미래의 일섬 (SV4M) and 와일드포스 (SV5K). TCGdex lists 95 Korean sets but has card details only for these three, and has no Korean reference images. Coverage is consequently limited. Refresh just Korean data with `python3 scripts/refresh-catalog.py --languages ko`, or use the normal full refresh command. [PokéAPI species names](https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv) supply Korean species names.

## Missing cards

Choose **Enter an unlisted card** with Korean selected. This works like [Chinese manual entry](chinese-cards.md#missing-cards): enter the printed name, set code (such as SV8K) and full collector fraction, then choose Pokémon, Trainer or Energy and optionally link Pokémon. Manual entries keep the Korean language identity and have no automatic market price. On iOS, the photo is kept on-device.

## Validation

Regression tests cover Korean and English-name search, zero-padded collector search, Korean-heading type hints, two-syllable names, exact set/number ranking from Korean text, manual entries, backups and separate price-cache identities. No Korean phone photo was available. Two Korean SV5K retailer scans read through the production auto-detect pass are kept as fixtures; the other Korean OCR tests use typed text. Korean OCR needs a new native iOS build; physical iPhone testing with a Korean card remains to be done.
