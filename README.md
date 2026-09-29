# Pocket Trainer

App Store Connect and installed app name: **Pocket Pokédex**. See [automated iOS builds and TestFlight setup](docs/automated-builds.md) for the `dev`/`main` workflows and remaining account setup.

A classic red Pokédex and physical Pokémon card binder for iPhone and iPad, built with Expo SDK 57.

**Private preview:** https://kenny-mini.grayling-vibe.ts.net:8443/

**Install on the registered iPhone:** https://expo.dev/accounts/reallybadnews/projects/pokedex/builds/749bd3cb-806c-4158-bf09-5764448d2854

The browser preview supports catalog search, card review, collecting, favorites, duplicates, trainer profiles, badges and backups. The signed iOS preview includes automatic photo matching through a local Apple Vision module and runs without a development server. Automatic matching is not available in the browser or Expo Go.

## First version

- Separate trainer profiles saved on each device; no account or recurring backend bill.
- English, Japanese, Korean, Simplified Chinese and Traditional Chinese physical card catalogs, including the 30th Celebration (30C) set. Coverage and manual entry are described in [Korean cards](docs/korean-cards.md) and [Chinese cards](docs/chinese-cards.md).
- Search using an English, Japanese, Korean or Chinese Pokémon name, set code, or collector number.
- Photograph or choose one card image, review suggested matches, choose its printing and quantity, then add it. The card's language is detected automatically; choosing a language overrides it.
- A clear scan asks one big question, "Is this your card?", next to a thumbnail of the photo; "Yes! Add it" adds one copy with the only known printing (or "Not sure yet"). The celebration offers "Scan another card" straight back to the camera, and an Undo banner takes back what was just added. Language, crop and rereading live under Tools.
- "Take a photo" opens a live viewfinder with a card-shaped guide and a flashlight button. It reads frames on the device and takes the picture by itself once a card is clearly recognized; the shutter button works any time, and binder pages get a pocket grid guide. The regular camera remains as a fallback.
- Scan a whole binder page (9, 4 or 12 pockets). Each pocket is read in turn and flips to its matched card; clear matches are ready to add, uncertain ones wait for a tap to confirm, and cards that will unlock a new Pokémon are marked NEW. One tap adds the page. See [binder pages](docs/scanning.md#binder-pages).
- Scan and filter Pokémon, Trainer, Item, Energy, Stadium and TAG TEAM cards. Pokémon cards unlock their species entries, including every partner on a TAG TEAM; non-Pokémon cards count toward the binder and collection badges.
- Delete a saved printing and all its copies with confirmation from card details.
- Tap card artwork or a scan photo for a full-screen viewer with pinch zoom (1–5×), panning in a clean viewer styled to match the Pokédex.
- Each Pokédex entry shows the Pokémon's types, its English Pokédex text once it is discovered, and its whole evolution family, including baby Pokémon and branches like Eevee's. Tap a stage to jump to it. The Pokédex tab counts discovered Pokémon by type; tap a type to show only that type.
- A new Pokémon arrives in a Poké Ball that wiggles three times with haptic taps, then bursts open with confetti (tap to skip; Reduce Motion shows it straight away). Holo and special-rarity cards get a rainbow foil shine in the binder and card sheet that follows the device's tilt, or drifts slowly where motion sensors aren't available.
- Pokédex voice: a discovered entry shows the Pokémon's animated sprite and can be read aloud ("Bulbasaur, the Seed Pokémon…") with the device's speech voice, and "Hear its cry" plays its cry. A new discovery calls out and reads its entry automatically, unless VoiceOver is on. Cries follow the silent switch.
- Favorites, extra-copy counts, 22 achievement badges and discovery animations. Starter challenges cover all 27 Grass, Fire and Water starters and their 81 species across Kanto–Paldea, with a badge for each region. Eevee’s family, legendary birds, Kanto fossils, the original 151 and collection milestones have their own goals. Expand a species checklist to see what’s missing and find its cards; any printing or language counts. Progress follows each trainer’s current collection, including existing cards and imported backups.
- "Who's That Pokémon?" on the Pokédex tab: guess 10 silhouettes from the trainer's discovered Pokémon (the original 151 until four are discovered), with same-generation answer choices, a color reveal, gentle streaks, 1–3 stars and each trainer's best score, which backups keep. Answers don't repeat until every Pokémon in the pool has had a turn. Reveal animations follow Reduce Motion.
- Favorites, extra-copy counts, 23 achievement badges and discovery animations. Starter challenges cover all 27 Grass, Fire and Water starters and their 81 species across Kanto–Paldea, with a badge for each region. Eevee’s family, legendary birds, Kanto fossils, the original 151 and collection milestones have their own goals. Expand a species checklist to see what’s missing and find its cards; any printing or language counts. Progress follows each trainer’s current collection, including existing cards and imported backups.
- Estimated USD values on scan matches, card details and the binder, plus a total for each trainer's collection. Duplicate copies count; missing prices and unconfirmed printings are labeled.
- Sort the binder by highest/lowest price, recently added or printings needing confirmation. Filter pending printings directly from the collection value panel.
- Switch the binder between a card grid and 9-pocket binder pages you swipe through like a real binder (two-page spreads on iPad). Filters and sorting apply to both.
- Set progress for each language's sets (for example 34 / 165), closest to complete first. Each set opens a checklist of every card: collected cards in color, missing ones dimmed with their numbers. Each number counts once, whatever the finish or number of copies. Secret rares numbered past the set size are bonus cards: they never push progress past 100% and are not needed for the Set master badge.
- Export/import the family's collections as JSON. Imports add independent profile copies and preserve existing data.
- Original Blender device, Poké Ball, badges and app icon, with editable `.blend` files and reproducible scripts.

Family sync, trading and animated Pokémon characters are deferred.

## Run and check

```sh
pnpm install
pnpm web
pnpm typecheck
pnpm test
pnpm export:web
pnpm export:ios
```

`pnpm export:ios` validates JavaScript bundling, not a native iOS build. The 38 tests cover collection identity, duplicate arithmetic, invalid quantities, backup compatibility, multilingual searching, all card categories, TAG TEAM discovery, OCR ranking, progressive scan results, printing-specific prices, currency conversion, totals, price sorting, printing-review filters and cache/network behavior.

The earlier signed iOS preview (1.0.0, build 5) compiled successfully on EAS under Kenneth Elshoff's individual team. All 21 Expo Doctor checks passed. The downloaded IPA passed signature verification and includes the registered iPhone in its provisioning profile, the standalone JavaScript bundle, and the updated native scanner, crop and artwork-comparison code. Build 5 adds USD card estimates, collection totals, price caching and saved-printing corrections. Build 4’s faster recognition, card-type support and previous fixes are retained. Pricing screens were verified in the browser at iPhone width; physical iPhone validation of this update remains to be done. See [iOS build and signing details](docs/ios-build.md) for the installation link, team selection and repeat-build command. Register additional iPhones/iPads and include them in a new build or re-sign before installing there.

Build 8 includes card deletion, fitted-image pan limits and the cleaned-up Pokédex-themed photo viewer without the bottom control bar. Its EAS build and IPA signature verification passed, and its provisioning profile includes the registered iPhone under the individual Apple team. Type checking, all 43 tests and both platform exports passed. Browser checks covered the updated phone-width viewer layout and close action, plus earlier deletion confirmation/cancellation; physical iPhone gesture validation remains pending.

## Data, photos and offline use

The app bundles compact card indexes, Pokémon species names, and species types, evolution links and English Pokédex text. New card details and artwork are fetched from TCGdex when first opened. Added card metadata is saved locally; on native devices, the app also attempts to save its card artwork in app documents. A failed image download does not block saving the collection. Search and saved collection metadata work offline. Uncached artwork and previously unseen card details require internet access.

Photo recognition uses Apple's on-device Vision models and deterministic catalog-ranking rules, with no LLM or photo uploads. Automatic suggestions always require review, and foil/edition choices are manual. The scanner isolates cards when edges are detectable and publishes suggestions after two OCR passes. Clear matches skip additional work; uncertain matches get extra text reading and optional local picture comparison while suggestions remain usable. Crop adjustment and language changes rerun recognition; card-type filters reuse the recognized text. The shared native core and ranking tests correctly matched public reference cards and the supplied Wugtrio binder screenshot; physical iPhone validation remains necessary. See [how scanning works](docs/scanning.md) and [performance measurements](docs/scan-performance.md) for the pipeline and limits.

Web preview collections live in that browser's local storage. They are separate from native app data and other browsers. Export a backup before clearing browser/app storage or moving devices. Backups contain card metadata, counts and favorites; artwork is reloaded from the public catalog after import. Backups are not live sync.

Refresh the public catalog with:

```sh
pnpm catalog:refresh
pnpm species:refresh
```

`pnpm species:refresh` runs `scripts/refresh-species.py` (Python 3 standard library only) to rebuild `src/data/species-details.json` (about 138 KB) from [PokéAPI's CSV data](https://github.com/PokeAPI/pokeapi/tree/master/data/v2/csv): each species' default-form types, what it evolves from, and its English Pokédex text from the newest main-series game that has one (the journal-style Legends entries are used only when nothing else exists). The output is deterministic, so a rerun only changes when PokéAPI does.

TCGdex language coverage varies; some cards have no artwork or incomplete metadata. Physical cards are filtered separately from Pokémon TCG Pocket. Current sources and snapshot counts are recorded in `src/data/catalog-meta.json`.

## Estimated collection value

[TCGdex](https://tcgdex.dev/markets-prices) supplies TCGplayer USD market prices and Cardmarket EUR trends. [Frankfurter](https://frankfurter.dev/) supplies EUR/USD reference rates for converted estimates, including Japanese cards where same-card EUR pricing is available. The UI shows the source and dates; it never substitutes an English printing's value for a Japanese one. No API key, subscription or backend is required. Quotes are cached separately from the collection for a day and refresh without blocking scanning. See [pricing rules and validation](docs/pricing.md), including missing prices, special printings, condition limits and how the total is calculated.

## Blender

See [Blender setup](docs/blender-setup.md). Blender 5.2.1 LTS and the pinned `blender-mcp` 1.9.1 integration are installed on Kenny Mini. The actual MCP connection, tool listing and scene inspection were verified. Interactive MCP use requires Blender to remain open.

## Remote preview

Port 8443 is reserved for this preview on Kenny Mini. The existing Community Creators proxy on 443 and the service on 4096 are preserved. The stable web export is served on loopback port 8877 by `scripts/serve-preview.py` and forwarded with Tailscale Serve. No public Funnel is enabled.

After changes, run `pnpm export:web`, then refresh the HTTPS preview. To inspect routing: `tailscale serve status`. To remove only this preview's route: `tailscale serve --https=8443 off`.

The preview's user LaunchAgent is `com.reallybadnews.pokedex-preview`; it runs the static server with KeepAlive. It logs to `/private/tmp/pokedex-preview.log` and `/private/tmp/pokedex-preview.error.log`.

## Credits

Card metadata and images: [TCGdex](https://tcgdex.dev/). Pokémon names, types, evolutions, Pokédex text and artwork: [PokéAPI](https://pokeapi.co/). Cries and animated sprites: [Pokémon Showdown](https://play.pokemonshowdown.com/), loaded when played. Pokémon is owned by its respective rights holders. This is an unofficial family fan project.
