# Automated iOS builds

EAS Workflows runs on every push to `dev` and `main`, including PR merges:

| Branch | Profile | Result |
| --- | --- | --- |
| `dev` | `development` | Ad hoc iOS development client for registered devices, built only when native code or config changed; run `pnpm start` to load the app. |
| `main` | `production` | Store-signed iOS app uploaded to App Store Connect / TestFlight on every push. |

Both workflows run a frozen-lockfile install, type checking and tests first. Failed checks stop the workflow; failed production builds prevent submission. The submit job uses the exact build ID from that run. Tests and their TypeScript configuration must remain in the EAS source archive.

## When `dev` builds a new development client

A development client only contains native code. JavaScript changes load from Metro, so an existing client keeps working until native code or config changes. After the checks pass, the `dev` workflow:

1. Calculates the project's iOS [fingerprint](https://docs.expo.dev/versions/v57.0.0/sdk/fingerprint/), a hash of everything that ends up in the native app.
2. Looks for a finished iOS `development` build (ad hoc, `internal` distribution) with the same fingerprint. If a matching build is still in progress from an earlier push, it waits for that build instead of starting a second one.
3. If it finds one, it skips the build and shows a **Reuse existing iOS development client** step with a link to that build. Keep the installed client and run `pnpm start`.
4. If it finds none, it builds a new development client as before. Install it from the build page or with `eas build:dev`.

The fingerprint changes, and a new client is built, when any of these change:

- Native dependencies or their versions (`package.json` / `pnpm-lock.yaml`), including Expo SDK upgrades.
- `app.json` (plugins, permissions, icon, splash screen, version and so on) and the images it points to.
- The local native module in `modules/card-scanner`.
- `eas.json`, `.easignore`, `.gitignore` or the `scripts` in `package.json`.

Changes under `src/`, `tests/` and `docs/` do not change the fingerprint. Production and TestFlight builds are never reused here: they can share the same fingerprint, but the lookup only matches the `development` profile.

To check locally whether a change needs a new client, compare `npx @expo/fingerprint fingerprint:generate --platform ios` on both commits, or compare the hash with the **Fingerprint** shown on the latest development build's page.

The existing `preview` profile remains available for standalone ad hoc installs without Metro. All profiles use the same bundle identifier, so development, preview and TestFlight installations replace one another on a device.

## One-time account setup

1. In the [Expo project](https://expo.dev/accounts/reallybadnews/projects/pokedex), open Project settings → GitHub. Install/authorize the Expo GitHub app for `ReallyBadNews/pocket-trainer` and connect that repository. This integration triggers `.eas/workflows/*.yml`; no GitHub Actions token is needed.
2. Use Kenneth Elshoff's individual Apple team **8RUFK4742C** (provider **590559**) for all credentials. The App Store Connect app is **Pocket Pokédex**, Apple ID **6810010236**, with bundle ID **com.reallybadnews.pockettrainer**. Verify this bundle ID in App Store Connect before the first submission.
3. Set up signing for both profiles from an authenticated EAS CLI session:

   ```sh
   EXPO_NO_KEYCHAIN=1 EXPO_APPLE_TEAM_ID=8RUFK4742C EXPO_APPLE_PROVIDER_ID=590559 eas credentials:configure-build -p ios -e development
   EXPO_NO_KEYCHAIN=1 EXPO_APPLE_TEAM_ID=8RUFK4742C EXPO_APPLE_PROVIDER_ID=590559 eas credentials:configure-build -p ios -e production
   ```

   Register any additional test devices before generating the development provisioning profile. Production needs an App Store profile, while development uses ad hoc provisioning. Later device additions require updating that ad hoc profile before unattended builds can include them.
4. Configure the submission API key with the same Keychain workaround and individual team:

   ```sh
   EXPO_NO_KEYCHAIN=1 EXPO_APPLE_TEAM_ID=8RUFK4742C EXPO_APPLE_PROVIDER_ID=590559 eas credentials --platform ios
   ```

   Select `production`, then **App Store Connect: Manage your API Key → Set up your project to use an API Key for EAS Submit**. Complete Apple login/2FA if prompted. Keep the key in EAS credential storage, never in Git. `EXPO_NO_KEYCHAIN=1` skips saving the Apple password to macOS Keychain, avoiding `Security returned a non-successful error code: 36` in remote terminal sessions. Use this prefix for all Apple credential commands on this machine.
5. Merge the automation PR into `main` after credentials are ready. Create `dev` from that updated `main` so it contains the workflow files. There was no remote `dev` branch when this configuration was prepared. Require PRs through GitHub branch protection if direct pushes should not be allowed.
6. In [App Store Connect](https://appstoreconnect.apple.com/apps/6810010236/testflight), wait for processing, complete any TestFlight compliance prompts, and create a testing group. Add yourself as an internal tester and enable automatic distribution for that group. Family members can be external testers; complete beta test information and submit the first external build for Beta App Review. Uploading a build alone does not invite testers or release the app publicly.

## Build numbers and manual runs

EAS owns `ios.buildNumber` through `cli.appVersionSource: remote`; production auto-increments it. The remote counter was initialized to **11** during setup. Do not reset it to an older value or manually bump `app.json` for each build. The marketing version remains `1.0.0`.

After setup, run either workflow manually from the intended checked-out commit:

```sh
eas workflow:run .eas/workflows/development.yml
eas workflow:run .eas/workflows/testflight.yml
```

The TestFlight workflow always creates a real build and uploads it. The development workflow only creates a build when no development client matches the current fingerprint. Workflow logs and installation links are on the Expo project's Workflows page. A successful upload still requires Apple processing and any applicable beta review before testers can install it.

## References

- [EAS Workflows and GitHub connection](https://docs.expo.dev/eas/workflows/get-started/)
- [Skip unnecessary development builds with fingerprints](https://docs.expo.dev/tutorial/cicd/development-builds/)
- [Fingerprint and get-build workflow jobs](https://docs.expo.dev/eas/workflows/pre-packaged-jobs/)
- [EAS iOS submission and API-key setup](https://docs.expo.dev/submit/ios/)
- [Remote version management](https://docs.expo.dev/build-reference/app-versions/)
- [Apple TestFlight setup](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/)
