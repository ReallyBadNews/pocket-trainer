export type BadgeEmblem = 'medal' | 'starters' | 'eevee' | 'birds' | 'fossil' | 'dex' | 'binder';
export const BADGE_GROUPS = ['Starter adventures', 'Pokémon challenges', 'Collection milestones'] as const;
type BadgeDetails = {
  id: string;
  name: string;
  description: string;
  group: typeof BADGE_GROUPS[number];
  emblem: BadgeEmblem;
  target: number;
};
export type Badge = BadgeDetails & (
  | { kind: 'species' | 'cards' | 'languages' | 'sets' }
  | { kind: 'species-set'; speciesIds: readonly number[] }
);

const speciesBadge = (details: Omit<BadgeDetails, 'target'>, speciesIds: readonly number[]): Badge => ({
  ...details, kind: 'species-set', speciesIds, target: speciesIds.length,
});

// Each region's three Grass, Fire and Water families, in evolution order.
const STARTER_REGIONS = [
  { id: 'kanto', name: 'Kanto', families: [[1, 2, 3], [4, 5, 6], [7, 8, 9]] },
  { id: 'johto', name: 'Johto', families: [[152, 153, 154], [155, 156, 157], [158, 159, 160]] },
  { id: 'hoenn', name: 'Hoenn', families: [[252, 253, 254], [255, 256, 257], [258, 259, 260]] },
  { id: 'sinnoh', name: 'Sinnoh', families: [[387, 388, 389], [390, 391, 392], [393, 394, 395]] },
  { id: 'unova', name: 'Unova', families: [[495, 496, 497], [498, 499, 500], [501, 502, 503]] },
  { id: 'kalos', name: 'Kalos', families: [[650, 651, 652], [653, 654, 655], [656, 657, 658]] },
  { id: 'alola', name: 'Alola', families: [[722, 723, 724], [725, 726, 727], [728, 729, 730]] },
  { id: 'galar', name: 'Galar', families: [[810, 811, 812], [813, 814, 815], [816, 817, 818]] },
  { id: 'paldea', name: 'Paldea', families: [[906, 907, 908], [909, 910, 911], [912, 913, 914]] },
] as const;

export const BADGES: readonly Badge[] = [
  speciesBadge({ id: 'starter-master', name: 'Starter master', description: 'Collect all 27 Grass, Fire and Water starters and every evolution, from Kanto through Paldea.', group: 'Starter adventures', emblem: 'starters' }, STARTER_REGIONS.flatMap(region => region.families.flat())),
  speciesBadge({ id: 'first-partners', name: 'First partners', description: 'Meet all 27 unevolved Grass, Fire and Water starters, from Kanto through Paldea.', group: 'Starter adventures', emblem: 'starters' }, STARTER_REGIONS.flatMap(region => region.families.map(family => family[0]))),
  ...STARTER_REGIONS.map(region => speciesBadge({ id: `starters-${region.id}`, name: `${region.name} starter squad`, description: `Collect all three ${region.name} starters and their full evolution lines.`, group: 'Starter adventures', emblem: 'starters' }, region.families.flat())),
  speciesBadge({ id: 'eevee-family', name: 'The Eevee family', description: 'Collect Eevee and all eight of its evolutions.', group: 'Pokémon challenges', emblem: 'eevee' }, [133, 134, 135, 136, 196, 197, 470, 471, 700]),
  speciesBadge({ id: 'legendary-birds', name: 'Legendary wings', description: 'Bring Articuno, Zapdos and Moltres together.', group: 'Pokémon challenges', emblem: 'birds' }, [144, 145, 146]),
  speciesBadge({ id: 'kanto-fossils', name: 'Fossil finder', description: 'Collect Omanyte, Omastar, Kabuto, Kabutops and Aerodactyl.', group: 'Pokémon challenges', emblem: 'fossil' }, [138, 139, 140, 141, 142]),
  speciesBadge({ id: 'kanto-complete', name: 'The original 151', description: 'Discover every Kanto Pokémon, from Bulbasaur to Mew.', group: 'Pokémon challenges', emblem: 'dex' }, Array.from({ length: 151 }, (_, i) => i + 1)),
  { id: 'first', name: 'First discovery', description: 'Discover your first Pokémon', target: 1, kind: 'species', group: 'Collection milestones', emblem: 'medal' },
  { id: 'ten', name: 'Field researcher', description: 'Discover 10 Pokémon', target: 10, kind: 'species', group: 'Collection milestones', emblem: 'medal' },
  { id: 'fifty', name: 'Pokémon explorer', description: 'Discover 50 Pokémon', target: 50, kind: 'species', group: 'Collection milestones', emblem: 'medal' },
  { id: 'hundred-species', name: 'Pokédex professor', description: 'Discover 100 different Pokémon', target: 100, kind: 'species', group: 'Collection milestones', emblem: 'dex' },
  { id: 'hundred', name: 'Binder builder', description: 'Collect 100 cards', target: 100, kind: 'cards', group: 'Collection milestones', emblem: 'medal' },
  { id: 'world', name: 'World collector', description: 'Collect cards in two languages', target: 2, kind: 'languages', group: 'Collection milestones', emblem: 'medal' },
  { id: 'sixhundred', name: 'Collection champion', description: 'Collect 600 cards', target: 600, kind: 'cards', group: 'Collection milestones', emblem: 'medal' },
  // Secret rares numbered past the set size are a bonus, so a set can be finished without them.
  { id: 'set-master', name: 'Set master', description: 'Collect every numbered card in one set. Secret rares are a bonus.', target: 1, kind: 'sets', group: 'Collection milestones', emblem: 'binder' },
];
