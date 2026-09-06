# Signed iOS preview

Use only Kenneth Elshoff's individual Apple team: `8RUFK4742C` (provider `590559`). The user explicitly excluded Graham Media Group from this project.

The user approved uploading the project source to Expo EAS and storing its generated iOS signing credentials there. `.easignore` excludes local settings, credential files, documentation, scripts and editable Blender scenes from the source archive. The app's runtime assets and native scanner are included.

The registered test iPhone is named Kenny iPhone, UDID `00008150-0008046E2EF0401C`, and is recorded in EAS under the individual team. Apple portal registration occurs when the device is selected for provisioning.

## Latest preview — build 7

https://expo.dev/accounts/reallybadnews/projects/pokedex/builds/920075f6-847e-40c2-8921-97dff868f5d6

Build 7 completed successfully with card deletion and pinch-to-zoom artwork/scan photos. The downloaded IPA passed `codesign --verify --deep --strict`; its profile contains the individual team and registered iPhone above. Version 1.0.0, build 7 and the standalone JavaScript bundle were verified. Type checking, all 39 tests and iOS/web exports passed. Phone-width browser checks covered the viewer, zoom/reset and multi-copy deletion confirmation/cancellation. Physical iPhone pinch testing remains pending.

## Earlier build status — September 6, 2026

Initial attempts authenticated successfully as Kenneth Elshoff but failed while registering `com.reallybadnews.pockettrainer`. Apple returned HTTP 403:

> The selected team does not have a program membership that is eligible for this feature.

The account holder confirmed a paid individual membership active through September 6, 2027. A later retry with both the team and provider explicitly selected succeeded. Apple registered the bundle ID and generated a distribution certificate and active ad hoc provisioning profile for the specified iPhone.

The earlier preview, build 5, completed successfully at 20:20 UTC on September 6, 2026: https://expo.dev/accounts/reallybadnews/projects/pokedex/builds/1af63f45-4d5f-4e0c-aee7-7d0c458be472.

The downloaded IPA passed `codesign --verify --deep --strict`. Its embedded provisioning profile identifies Kenneth Elshoff's team and includes the specified iPhone. The app is version 1.0.0, build 5, requires iOS 16.4 or later, includes the standalone JavaScript bundle and camera permission description, and contains the compiled `CardScannerModule`, `CardArtwork`, perspective-correction code and manual-crop validation. Release optimization removes the helper struct name, so retained code markers were used to confirm its inclusion. Expo Doctor passed all 21 checks on the cloud builder.

Build 1 installed and launched on the user's iPhone, but rendering `expo-router/head` triggered its Apple Handoff origin alert. Build 2 separates browser metadata from native rendering. The native metadata component returns `null`. iOS export source maps confirmed this platform selection; the exported web HTML retains its title and description. A subsequent change to support server-rendered web metadata produced byte-for-byte identical iOS bytecode to the build 2 input. Type checking and all nine collection tests passed. The user subsequently reported poor Japanese and English card recognition, motivating build 3.

Build 3 adds multi-pass name/footer recognition, automatic and manual cropping, noisy Mega/ex name matching, optional local picture comparison, language-change rescanning, and 154 verified image-link repairs. Type checking and 15 tests passed. The shared native core matched the supplied Wugtrio screenshot and public English/Japanese references; see [scanner validation](scanning.md). The temporary crop-preview route was removed before the source upload.

Build 4 publishes initial matches after two OCR passes, skips optional work for clear matches, and uses smaller reference images for background picture comparison. It adds Trainer, Item, Energy, Stadium and TAG TEAM search/binder filters, including TAG TEAM Supporters and discovery of every Pokémon partner. Type checking, 24 tests and both platform exports passed. Local native measurements showed 28–48% faster first OCR results across nine samples, excluding network and JavaScript ranking; these are Mac measurements, not iPhone timing. See [performance details](scan-performance.md). Browser checks saved a Stadium card without increasing discoveries and a three-Pokémon TAG TEAM with all three entries unlocked.

Build 5 adds estimated USD card values and per-trainer collection totals using public TCGdex and Frankfurter APIs. It includes printing-aware prices, Japanese EUR conversion, per-copy math, partial coverage labels, cached/offline estimates and saved-printing correction. Type checking, 34 tests and both platform exports passed. The final IPA’s bundle contains the pricing feature and the existing native scanner. See [pricing rules and verification](pricing.md). An earlier build 5 archive was superseded by the linked final archive to include cache compatibility for Unown ! and ? identifiers.

Open the build page in Safari on the registered iPhone and select Install. Real camera/OCR validation remains pending on the phone; successful compilation does not establish recognition accuracy.

## Build another preview

```sh
EXPO_NO_KEYCHAIN=1 EXPO_APPLE_TEAM_ID=8RUFK4742C EXPO_APPLE_PROVIDER_ID=590559 EXPO_APPLE_ID=contact@kennyelshoff.com pnpm dlx eas-cli@23.2.0 build --platform ios --profile preview --no-wait
```

`EXPO_NO_KEYCHAIN=1` avoids macOS Keychain error 36 in the remote tmux session. The preview profile creates an internally distributed standalone app and includes the native scanner; it does not require Metro to run on the phone.

For each later build, verify the IPA's team and provisioned device before sharing its installation link. Test an English card and a Japanese card under normal lighting, confirm the suggested printing and collector number, add a duplicate, and reopen the app to verify saved collection data.
