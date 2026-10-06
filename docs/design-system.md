# Pocket Pokédex design patterns

The red housing and blue lens carry the app's personality. Inside the green display, the collection is the focus. Use one reading surface, clear section spacing, and quiet controls; reserve framed invitations for an empty collection.

## Palette and type

Keep the product palette: housing red `#C93240`, dark red `#8D2431`, display green `#EDF3DD`, paper `#FAFCF7`, ink `#25382F`, lens blue `#57C7E8`. Gold marks wishes and earned achievements. Supporting text uses `#607266`.

Use the platform system sans for readable interface copy. Keep monospace for Pokédex IDs and device readouts; ordinary card metadata uses proportional text with tabular numbers. No new font downloads are required.

| Role | Size / leading | Weight | Use |
| --- | --- | --- | --- |
| Title | 26 / 32 | 700 | Screen title or discovery |
| Subtitle | 18 / 24 | 600 | Section and sheet titles |
| Card title | 15 / 20 | 600 | Card identity |
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
┌ COLLECTION VALUE ─────────────┐
│ $886.15                     › │
│ All 18 cards priced · up to … │
└───────────────────────────────┘
Search
[ View A          | View B            ]
Filter / sort menus         Overview

Card artwork       Card artwork
Card name          Card name
Set + number       Set + number
$8.88              $0.29–$0.44
```

- Give each task one clear filled primary action. Secondary actions are plain text or navigation rows; equal hit targets do not require equal visual prominence. Wishlist and achievement gold stays semantic.
- Populated Pokédex and Binder screens lead with the collection-value readout, then search and collection content. The value is the one framed element above the collection: a tinted Pokédex readout window that opens the collection value page. Quiz, discoveries and set summaries are secondary destinations. Decorative art never stacks above the collection at larger text sizes.
- Card values are content, not metadata: tiles show them in bold tabular numerals, and card details show the same readout window under the card's identity, opening price details for every printing.
- `ButtonRow` gives actions equal columns and equal heights. It stacks when there is less than 144pt per button, with more space reserved as system text size increases.
- Segmented controls switch closely related views. Use `ChoiceMenu` for sort, filter, language, and form values. On iOS it opens native choices; other platforms show a checked list. Form rows show the selected value. Compact toolbar triggers can use short titles such as Sort or View; accessibility announces the current selection and the menu checks it.
- `ToolbarAction` and `ActionRow` keep secondary destinations easy to tap without another filled card. Use alignment, separators, and section gaps to group related items.
- Filter chips remain compact, independently selected controls. Long bilingual labels may wrap inside the available width.
- Main tabs remain available while scrolling. Only the decorative header collapses.
- Nothing expands in place. When there is more to show, it opens its own view: a page in the tab's expo-router stack, drawn inside the Pokédex screen with a back bar (`Page`/`PageFrame`), or a sub-page with a back arrow inside a sheet. These views are full features with their own lists, actions and explanations, not overflow. The tabs, pages and their links are expo-router routes; cards, Pokémon, the wishlist, settings and the quiz open over any page from the device's sheet host.
- Sheet navigation stays in place while saving. A busy sheet disables its navigation instead of removing it. Titles wrap beside fixed 44pt navigation controls.
- Card captions show the name followed by one metadata block with the set and printed number. Full names and metadata wrap; details provide the complete identity. Avoid reserved blank lines and repeated estimate/printing labels.
- Quantity controls use a short “Copies” label and a trailing stepper. Stack only when actual width or text size requires it. Deletion is a quiet destructive action.
- Toolbars reflow at narrow widths. Long labels need a flexible text block and fixed icon space.
- Settings opens destinations instead of presenting several edit forms at once. The appearance editor uses a compact live avatar and keeps Save available while choices scroll.
- Manual entry is a separate task with its own sheet, rather than a form embedded in the scan instructions.

These patterns follow Apple's guidance on [layout and hierarchy](https://developer.apple.com/design/human-interface-guidelines/layout), [button prominence](https://developer.apple.com/design/human-interface-guidelines/buttons), and [menus](https://developer.apple.com/design/human-interface-guidelines/menus). The Pokédex housing remains the app's distinctive element; content and controls use restraint.

## Audit coverage

Reviewed the Pokédex, Binder grid/pages, set checklist, Badges, quiz invitation/game/results, card review/owned card, species/evolution, Wishlist, trainer Settings/builder/About, discovery, single-card/page scan, manual entry, crop, photo viewer, camera, and grown-up gate.

The main issues were competing heavy weights, unrelated control shapes, squeezed toolbar labels, one-line card names, tiny metadata, fixed promotional artwork widths, and quantity labels compressed beside steppers. Fixes are split into shared patterns, collection surfaces, then scanning and sheets. Recognition, collection arithmetic, pricing, and persistence keep their existing behavior.
