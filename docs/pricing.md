# Card and collection values

Pocket Trainer shows estimated USD values in scan/search results, card review, saved-card details, the binder, and the cards inside each Pokédex entry. Both the Pokédex home and binder show the active trainer's entire collection value, including Trainer and Energy cards. The family profiles remain separate.

## Public APIs selected

[TCGdex's public card endpoint](https://tcgdex.dev/markets-prices) already matches our exact language/set/card identifiers. It includes `pricing.tcgplayer` (USD market prices) and `pricing.cardmarket` (EUR trends). These calls work without a key or new account. TCGdex omits marketplace data when it has no listing; coverage is not universal.

Live checks on September 6, 2026 found TCGplayer USD prices for English Pikachu, Viridian Forest and Arceus & Dialga & Palkia GX. The Japanese Wugtrio ex and Cacnea examples had Cardmarket EUR data and no TCGplayer data. The app therefore uses a same-printing TCGplayer market price first, then an eligible Cardmarket trend converted to USD. It never substitutes an English card's price for a Japanese card.

[Frankfurter](https://frankfurter.dev/) supplies EUR/USD reference rates without an API key. We request `https://api.frankfurter.dev/v2/rate/EUR/USD?providers=ECB`. Converted prices are labeled, with the original price date and exchange-rate date visible in card details. The September 6 check returned the September 4 ECB rate, as expected over a weekend.

Other evaluated providers required accounts/keys, imposed small free quotas, or charged more than the family's $5/month target. TCGCSV's public category request returned HTTP 401 in the live check. The selected integration adds no subscription or backend.

## Valuation rules

- Use positive `marketPrice` values, not high/low asking prices. Map observed TCGplayer keys including `holofoil`, `reverse-holofoil` and `1st-edition-holofoil` to the app's printing choices.
- Cardmarket's base trend is used only when the catalog identifies one primary Regular/Holo printing and USD data does not contradict that printing. Ambiguous `*-holo` values are excluded because they do not reliably resolve every reverse/special printing.
- A first-edition, reverse-holo or promo printing never borrows a regular price. Unavailable, zero, malformed or wrong-currency values stay unavailable.
- A saved “Not sure yet” printing shows the range of available quotes and is counted as unconfirmed, including when no price is available. The range only covers prices the provider actually supplies.
- Multiply each printing's displayed USD cents by its saved quantity. Each physical card counts once, including TAG TEAM cards that unlock several Pokémon. Missing quotes are excluded, with priced/total copy counts shown prominently. Filtered binder views retain the entire active trainer's total.
- Saved printing choices can be corrected. If the destination printing already exists, quantities merge and favorites are preserved. The 999-copy limit still applies.
- Prices are ungraded estimates, not guaranteed sale proceeds. Condition, buyer demand and selling fees can change the amount received.

## Performance, caching and privacy

Pricing is separate from OCR. Scan results remain usable; new scan-price requests start after recognition/refinement finishes. Details and prices share an in-flight card request. A three-request queue prioritizes opened cards, deduplicates cards across copies, and drops queued work for screens that have been left. Refresh buttons are nonblocking.

Successful quotes, empty provider results and EUR/USD rates are cached for a day. Prices live in a separate local cache, so failed/corrupt cache reads cannot block collection loading or damage backups. Failed requests keep older estimates and use a five-minute retry backoff; manual refresh can retry immediately. Stale estimates are labeled. Source dates older than seven days also trigger a stale label even after a successful fetch.

The price API receives the requested public card identifier and language. Frankfurter receives only the currency pair. Neither receives card photos, trainer names, quantities or the family's collection file.

## Typography, sorting and printing review

Price amounts use the app's system typeface with tabular numerals and a quieter currency caption. Card prices omit “/ copy”; quantities still affect collection totals. Ranges wrap between complete amounts on narrow card tiles.

The binder supports Recently added, Highest price, Lowest price and Needs printing first. Price order uses each printing's unit value, converted to USD where needed, and the lower estimate for ranges. Unpriced entries stay last in both price directions. Equal prices retain their existing order; new quotes update the order without blocking the UI.

The Needs printing toggle combines with search, language and card-type filters. The Confirm printings shortcut on the Pokédex or binder total opens the pending-printings list with other filters cleared. Its count is the number of saved printing entries, including unpriced entries, rather than the number of physical copies. Saving a confirmed printing removes it from the filtered list while preserving quantities.

## Validation

38 tests pass, including live-response fixtures from five English/Japanese cards, integer-cent duplicate totals, TAG TEAM/non-Pokémon accounting, missing prices, first-edition isolation, printing corrections, cache restoration for all 33,849 catalog identifiers (including Unown ! and ?), concurrency, cancelled queued work and FX/network failures. Sorting tests cover both price directions, ranges, missing prices, quantity independence, selected printings, conversion, stable ties, arriving quotes and unpriced pending printings. Type checking and both web/iOS JavaScript exports pass.

Browser validation used the separate Test Trainer profile: changing the Arceus & Dialga & Palkia GX printing from Regular to Holo changed the six-copy total from $32.70 (5/6 priced) to $600.74 (6/6 priced), using the recorded September 6 quotes. This is sample test data, not the child's collection valuation.

Browser checks also confirmed per-copy prices inside Pikachu’s Pokédex entry, regular/reverse-holo ranges in scan search results, and Japanese Cacnea’s source, exchange-rate date and two-copy total. The corrected printing and collection value survived reopening the preview.

Build 6 browser checks at 375 and 430 pixels confirmed the revised price typography, the Jungle Jolteon $99.06–$258.06 range, high/low ordering across English and converted Japanese values, the Pokédex confirmation shortcut, and the all-printings-confirmed state after saving a printing without changing its two-copy quantity. Browser accessibility checks confirmed expanded, selected-radio and checked-filter states. Screenshots were shared in the chat. These checks use the separate browser Test Trainer profile.

The final [signed iOS build 5](https://expo.dev/accounts/reallybadnews/projects/pokedex/builds/1af63f45-4d5f-4e0c-aee7-7d0c458be472) finished September 6, 2026 at 20:20 UTC. Expo Doctor passed 21/21 checks. The downloaded IPA passed strict signature verification; its profile uses Kenneth Elshoff’s team and includes the registered iPhone. The standalone bundle contains the USD pricing feature and retains the native scanner. Physical iPhone validation remains pending installation.
