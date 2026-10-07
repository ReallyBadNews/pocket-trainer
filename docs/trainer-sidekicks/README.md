# Trainer sidekicks

A sidekick is a Pokémon that rides in a bubble on the corner of the trainer's
portrait, everywhere the portrait appears: the Settings button, the trainer
list, and the appearance editor. Trainer Appearance has a Sidekick row after
Accessory. It opens a picker, and choosing a sidekick updates the draft;
Save my look commits it. New trainers start with no sidekick.

Four sidekicks are ready from the start. Every badge unlocks one more. The
picker lists locked sidekicks as silhouettes, with the badge that unlocks them
and the trainer's progress toward it. Each badge page shows its sidekick reward.
When adding a card earns a badge, the discovery celebration names the sidekicks
it unlocked.

| Sidekick | Unlocked by |
| --- | --- |
| Pikachu, Bulbasaur, Charmander, Squirtle | Ready from the start |
| Pichu | First discovery |
| Growlithe | Field researcher (10 Pokémon) |
| Lapras | World collector (2 languages) |
| Lucario | Pokémon explorer (50 Pokémon) |
| Snorlax | Binder builder (100 cards) |
| Mewtwo | Pokédex professor (100 Pokémon) |
| Dragonite | Collection champion (600 cards) |
| Gengar | Set master |
| Zapdos | Legendary wings |
| Aerodactyl | Fossil finder |
| Eevee | The Eevee family |
| Mew | The original 151 |
| Togepi | First partners |
| Charizard, Feraligatr, Sceptile, Infernape, Samurott, Greninja, Decidueye, Cinderace, Meowscarada | Kanto through Paldea starter squads |
| Rayquaza | Starter master |

## Rules

- Badge sidekicks go into a permanent, per-trainer ledger
  (`unlockedSidekicks`), like accessories. Removing cards, trading them, or
  undoing an addition never takes a sidekick back. Starters are never written
  to the ledger.
- Cards are added through `addCard`, which awards sidekicks using badge
  progress from the saved cards. The picker and Save my look judge badges the
  way the Badges tab does, with set progress from the bundled catalog, so any
  sidekick shown as unlocked can be saved.
- Existing saves receive the sidekicks their badges already earned when they
  load. The equipped look does not change.
- An unknown or locked sidekick in a save or backup falls back to no sidekick.
  The rest of the collection is still accepted. Backups and imports carry
  each trainer's ledger and chosen sidekick.

## Art

`assets/images/sidekicks/` holds trimmed, squared 192px WebP copies of
PokéAPI's official artwork, the same art the Pokédex shows online. Bundling
keeps the portrait complete offline, at 240 KB for all 27.
`scripts/refresh-sidekick-art.sh` rebuilds them. Its list must match
`SIDEKICKS` in `src/lib/sidekicks.ts`, and `tests/sidekicks.test.cjs` checks
that it does.
