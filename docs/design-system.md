# Pocket Pokédex design patterns

The red housing and blue lens carry the app's personality. Inside the green display, card art is the focus and the controls use a quieter, consistent hierarchy.

## Palette and type

Keep the product palette: housing red `#C93240`, dark red `#8D2431`, display green `#EDF3DD`, paper `#FAFCF7`, ink `#25382F`, lens blue `#57C7E8`. Gold marks wishes and earned achievements. Supporting text uses `#607266`.

Use the platform system sans for readable interface copy. Keep monospace for Pokédex IDs and device readouts; ordinary card metadata uses proportional text with tabular numbers. No new font downloads are required.

| Role | Size / leading | Weight | Use |
| --- | --- | --- | --- |
| Title | 27 / 33 | 800 | Screen title or discovery |
| Subtitle | 19 / 25 | 700 | Section and sheet titles |
| Card title | 15 / 20 | 700 | Card identity |
| Body | 15 / 22 | Regular | Descriptions |
| Label | 14 / 20 | 600 | Field labels and filters |
| Caption | 13 / 18 | Regular | Sets, status, helper text |
| Control | 15 / 20 | 600 | Segments and compact actions |
| Readout | 13 / 18 | Regular, tabular numbers | Printed numbers and progress |

`Txt` accepts these roles through `variant`. Existing `ui.title` and `ui.subtitle` use the same scale. Body copy retains the existing 1.4× maximum text scale. Button labels wrap rather than shrink to a different size.

## Layout rules

Screen copy is left aligned. Center alignment is reserved for Pokémon artwork, discovery, and game feedback. Screen and sheet content use 20pt padding, sections 16pt gaps, and related controls 8pt gaps.

```
Screen title                 Readout
Supporting copy

[ Primary action ] [ Secondary action ]
[ View A          | View B            ]
Search
Filters / sort / status

Card artwork       Card artwork
Card name          Card name
Set                Set
Printed number     Printed number
Estimate           Estimate
```

- Primary actions use red. Secondary actions use the pale green surface. Wishlist and achievement gold stays semantic.
- `ButtonRow` gives actions equal columns and equal heights. It stacks when there is less than 144pt per button, with more space reserved as system text size increases.
- Segmented controls describe one exclusive choice. They keep equal columns, readable wrapping labels, and at least 44pt targets.
- Filter chips remain compact, independently selected controls. Long bilingual labels may wrap inside the available width.
- Sheet navigation stays in place while saving. A busy sheet disables its navigation instead of removing it. Titles wrap beside fixed 44pt navigation controls.
- Card captions show a clear name, readable set, then printed details. Full card names and sets can wrap; short names reserve two lines so neighboring metadata aligns.
- Quantity controls are labeled fields. Compact sheets must leave space for both the heading and stepper.
- Toolbars reflow at narrow widths. Long labels need a flexible text block and fixed icon space.

## Audit coverage

Reviewed the Pokédex, Binder grid/pages, set checklist, Badges, quiz invitation/game/results, card review/owned card, species/evolution, Wishlist, trainer Settings/builder/About, discovery, single-card/page scan, manual entry, crop, photo viewer, camera, and grown-up gate.

The main issues were competing heavy weights, unrelated control shapes, squeezed toolbar labels, one-line card names, tiny metadata, fixed promotional artwork widths, and quantity labels compressed beside steppers. Fixes are split into shared patterns, collection surfaces, then scanning and sheets. Recognition, collection arithmetic, pricing, and persistence keep their existing behavior.
