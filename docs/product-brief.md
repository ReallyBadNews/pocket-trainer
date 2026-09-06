# Pocket Trainer — v1

An iPhone/iPad Pokédex and physical card binder for a nine-year-old with about 600 English and Japanese cards. Separate local trainer profiles; family sync deferred. No recurring service required for v1. Target future hosting/recognition spend: at most $5/month, with explicit limits before enabling a paid service.

## Collection loop

Photograph one card → read text on the device → suggest actual catalog matches → confirm printing, language, finish and quantity → add to binder → celebrate newly discovered Pokémon. Search is always available. Recognition never silently adds a card and cannot reliably infer foil finish from a photograph.

Catalog Pokémon, Trainer and Energy cards. Only cards with species IDs unlock Pokémon. Language and finish are part of collection identity. Favorites and milestone badges belong to each trainer. Export/import provides a portable family backup; it is not live sync.

## Design

- Shell red #C93240; dark red #8D2431; display green #EDF3DD; ink #25382F; scanner blue #57C7E8; badge gold #EAC55A.
- Rounded system type for friendly readable controls. Monospaced numbers only for Pokédex IDs and device readouts.
- The red housing and blue lens are the visual signature. A recessed green display contains the collection; quiet white binder pages keep card art legible.
- Phone: device header / trainer selector / active display / thumb navigation. iPad: wider display with more grid columns, capped reading width.
- Scan is the prominent center control. Visible action labels, 44-point minimum controls, scalable text, reduced-motion discovery animation.
- Blender creates reusable device, Poké Ball and badge source scenes plus transparent renders. Animated Pokémon are a stretch goal.

## Data and offline behavior

TCGdex supplies physical card indexes, exact printing details and images. PokéAPI's species name dataset supplies English/Japanese names. Bundled indexes allow offline search. Card details and art are saved when a card is added; obtaining a previously unseen printing requires connectivity. Image downloads may fail independently; collection text must still save.

## Validation

Test profile isolation, language/finish identity, duplicate arithmetic, species milestones, backup validation and OCR candidate ranking. Export the web bundle and inspect phone/tablet UI. Native OCR is a local Expo module using Apple Vision and requires a development build, not Expo Go. Validate real Japanese/English photos on-device before calling recognition production-ready.
