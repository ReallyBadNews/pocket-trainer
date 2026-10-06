import type { CardBrief, Entry, Language, Trainer } from './model';

/** What the bundled catalog knows about one language's set. */
export type CatalogSet = { id: string; name: string; official: number; cards: readonly CardBrief[] };

/** Injected so this stays pure: the app passes `catalogSet` from catalog.ts; tests can pass fixtures. */
export type SetCatalog = (language: Language, setId: string) => CatalogSet | undefined;

/**
 * `owned` counts distinct numbered positions 1…official, so it never exceeds `official`.
 * Cards printed past the set size (secret rares such as 170/165) and lettered extras (24a, RC5, H12)
 * are `bonus`: shown in the checklist, but not needed to finish the set.
 */
export type SetProgress = {
  key: string;
  language: Language;
  setId: string;
  name: string;
  owned: number;
  official: number;
  bonus: number;
  complete: boolean;
};

export type SetSlot = { key: string; localId: string; main: boolean; owned: boolean; card?: CardBrief; entry?: Entry };

export const setKey = (language: Language, setId: string) => `${language}:${setId}`;

/** 001 and 1 are the same printed number; so are TG01 and TG1. */
export const canonicalNumber = (localId: string) =>
  localId
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/(^|\D)0+(?=\d)/g, '$1');

/** The position a card fills: 170 in 170/165, 7 in TG07, 7 in the Gem Pack number 17 07. */
function position(localId: string) {
  const match = canonicalNumber(localId)
    .split(' ')
    .pop()!
    .match(/^([a-z]*)(\d+)$/);

  return match ? { prefix: match[1], n: Number(match[2]) } : undefined;
}

type SetGroup = {
  key: string;
  language: Language;
  setId: string;
  name: string;
  official: number;
  prefix: string;
  entries: Entry[];
  cards: readonly CardBrief[];
};

/** Most sets number plainly; promo and gallery sets share a prefix (SWSH001, TG01). The common one is the main run. */
function mainPrefix(localIds: Iterable<string>, official: number) {
  const counts = new Map<string, number>();

  for (const id of new Set([...localIds].map(canonicalNumber))) {
    const p = position(id);

    if (p && p.n >= 1 && p.n <= official) counts.set(p.prefix, (counts.get(p.prefix) ?? 0) + 1);
  }

  let best = '';

  for (const [prefix, count] of counts) if (count > (counts.get(best) ?? 0)) best = prefix;

  return best;
}

const mainPosition = (group: Pick<SetGroup, 'prefix' | 'official'>, localId: string) => {
  const p = position(localId);

  return p && p.prefix === group.prefix && p.n >= 1 && p.n <= group.official ? p.n : undefined;
};

function groupSets(trainer: Trainer, catalog?: SetCatalog): Map<string, SetGroup> {
  const groups = new Map<string, SetGroup>();

  for (const entry of trainer.entries) {
    const { language, set } = entry.card;
    const info = catalog?.(language, set.id);
    const key = setKey(language, info?.id ?? set.id);

    const group = groups.get(key) ?? {
      key,
      language,
      setId: info?.id ?? set.id,
      name: info?.name ?? set.name,
      official: info?.official ?? 0,
      prefix: '',
      entries: [],
      cards: info?.cards ?? [],
    };

    // Uncatalogued sets (manual entries) rely on the printed total saved with the card.
    if (!info?.official) group.official = Math.max(group.official, set.total);
    group.entries.push(entry);
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.prefix = mainPrefix(
      group.cards.length ? group.cards.map((c) => c.localId) : group.entries.map((e) => e.card.localId),
      group.official,
    );
  }

  return groups;
}

function summarize(group: SetGroup): SetProgress {
  const positions = new Set<number>(),
    bonus = new Set<string>();

  for (const { card } of group.entries) {
    const n = mainPosition(group, card.localId);

    if (n !== undefined) positions.add(n);
    else bonus.add(canonicalNumber(card.localId));
  }

  return {
    key: group.key,
    language: group.language,
    setId: group.setId,
    name: group.name,
    owned: positions.size,
    official: group.official,
    bonus: bonus.size,
    complete: group.official > 0 && positions.size >= group.official,
  };
}

/** Sets with at least one owned card, closest to complete first. Open-ended sets without a printed size are skipped. */
export function setProgress(trainer: Trainer, catalog?: SetCatalog): SetProgress[] {
  return [...groupSets(trainer, catalog).values()]
    .filter((g) => g.official > 0)
    .map(summarize)
    .sort(
      (a, b) =>
        b.owned / b.official - a.owned / a.official ||
        a.official - a.owned - (b.official - b.owned) ||
        a.name.localeCompare(b.name),
    );
}

export const completedSetCount = (trainer: Trainer, catalog?: SetCatalog) =>
  setProgress(trainer, catalog).filter((s) => s.complete).length;

const sortKey = (localId: string) => {
  const p = position(localId);

  return p ? { prefix: p.prefix, n: p.n } : { prefix: canonicalNumber(localId), n: 0 };
};

const compareNumbers = (a: string, b: string) => {
  const x = sortKey(a),
    y = sortKey(b);

  return x.prefix < y.prefix ? -1 : x.prefix > y.prefix ? 1 : x.n - y.n || (a < b ? -1 : a > b ? 1 : 0);
};

/**
 * Every card in the set with owned/missing flags: the main run 1…official first, then bonus cards.
 * Owned cards the catalog lacks are included, and main numbers it lacks become card-less slots.
 */
export function setChecklist(trainer: Trainer, language: Language, setId: string, catalog?: SetCatalog): SetSlot[] {
  const info = catalog?.(language, setId);

  const group = groupSets(trainer, catalog).get(setKey(language, info?.id ?? setId)) ?? {
    key: setKey(language, setId),
    language,
    setId,
    name: info?.name ?? setId,
    official: info?.official ?? 0,
    prefix: mainPrefix(
      (info?.cards ?? []).map((c) => c.localId),
      info?.official ?? 0,
    ),
    entries: [],
    cards: info?.cards ?? [],
  };

  const byNumber = new Map<string, Entry>();

  for (const entry of group.entries) {
    const number = canonicalNumber(entry.card.localId);

    if (!byNumber.has(number)) byNumber.set(number, entry);
  }

  const slots: SetSlot[] = [];

  const listed = new Set<string>(),
    filled = new Set<number>();

  const add = (localId: string, key: string, card?: CardBrief) => {
    const number = canonicalNumber(localId),
      n = mainPosition(group, localId),
      entry = byNumber.get(number);

    if (listed.has(number)) return;
    listed.add(number);

    if (n !== undefined) filled.add(n);
    slots.push({ key, localId, main: n !== undefined, owned: !!entry, card: entry?.card ?? card, entry });
  };

  for (const card of group.cards) add(card.localId, `${card.language}:${card.id}`, card);

  for (const entry of byNumber.values()) add(entry.card.localId, entry.key, entry.card);

  // Placeholders copy the catalog's printed width: 007 in newer sets, 7 in older English ones.
  const width = Math.min(
    3,
    ...(group.cards.length ? group.cards.map((c) => c.localId) : slots.map((s) => s.localId))
      .filter((id) => mainPosition(group, id) !== undefined)
      .map((id) => id.trim().split(/\s+/).pop()!.replace(/\D/g, '').length),
  );

  for (let n = 1; n <= group.official; n++) {
    if (!filled.has(n))
      slots.push({
        key: `${group.key}:missing:${n}`,
        localId: `${group.prefix.toUpperCase()}${String(n).padStart(width, '0')}`,
        main: true,
        owned: false,
      });
  }

  return slots.sort((a, b) => Number(b.main) - Number(a.main) || compareNumbers(a.localId, b.localId));
}
