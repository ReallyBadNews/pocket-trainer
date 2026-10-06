# Upstream

- Source: https://github.com/dmmulroy/anti-slop
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` (`skills/install-anti-slop/assets/anti-slop`)
- Installed with the `install-anti-slop` skill (`.claude/skills/install-anti-slop`, pinned in `skills-lock.json`) via `scripts/install.mjs`
- Installed plugin paths: `tools/oxlint/anti-slop/index.ts` (registered in `.oxlintrc.json`); `effect/` is copied but not registered because the app does not depend on `effect`
- Dependencies: `oxlint` and `@oxlint/plugins` pinned together at `1.86.0` (1.87.0 was published the day of install and is still inside pnpm's minimum-release-age window)
- Local deviations: none. The copied files are byte-identical to the upstream commit above.
