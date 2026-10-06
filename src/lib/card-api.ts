import * as v from 'valibot';
import type { CardBrief } from './model';
import { DAY, priceKey } from './pricing';
import { DateText, lenient, PositivePrice, TcgdexImage, Text } from './schema';
import supplements from '../data/card-supplements.json';

/** TCGplayer prices are keyed by printing, e.g. `holofoil` or `1st-edition-holofoil`; unusable ones are dropped. */
const TcgplayerPricing = v.pipe(
  v.objectWithRest({ unit: v.literal('USD'), updated: DateText }, lenient(v.object({ marketPrice: PositivePrice }))),
  v.transform(({ unit, updated, ...variants }) => ({ unit, updated, variants })),
);

const CardmarketPricing = v.object({ unit: v.literal('EUR'), updated: DateText, trend: PositivePrice });

/**
 * The parts of a TCGdex card response the app reads. Only the id is required: prices need nothing else, and
 * `fetchCard` checks the details a saved card needs. Anything else that doesn't fit is dropped, not fatal.
 */
export const CardResponse = v.object({
  id: v.string(),
  localId: lenient(Text(50)),
  name: lenient(Text()),
  image: lenient(TcgdexImage),
  category: lenient(Text()),
  trainerType: lenient(Text(50)),
  energyType: lenient(Text(50)),
  suffix: lenient(v.string()),
  rarity: lenient(Text()),
  hp: lenient(v.pipe(v.number(), v.finite())),
  description: lenient(v.string()),
  effect: lenient(v.string()),
  types: lenient(v.array(Text(50))),
  dexId: lenient(
    v.pipe(
      v.array(lenient(v.pipe(v.number(), v.integer(), v.gtValue(0)))),
      v.transform((ids) => ids.filter((id) => id !== undefined)),
    ),
  ),
  set: lenient(
    v.object({
      id: Text(100),
      name: Text(),
      cardCount: lenient(v.object({ official: lenient(v.pipe(v.number(), v.integer(), v.minValue(0))) })),
    }),
  ),
  variants: v.optional(v.fallback(v.record(v.string(), v.fallback(v.boolean(), false)), {}), {}),
  pricing: lenient(v.object({ tcgplayer: lenient(TcgplayerPricing), cardmarket: lenient(CardmarketPricing) })),
});

export type CardData = v.InferOutput<typeof CardResponse>;

/** Bundled cards the catalog lacks; they appear in search, so they need a number and a name. */
const SupplementalCard = v.object({ ...CardResponse.entries, localId: Text(50), name: Text() });

export const supplementalCards = v.parse(v.record(v.string(), v.record(v.string(), SupplementalCard)), supplements);

const cached = new Map<string, { data: CardData; at: number }>();

const pending = new Map<string, Promise<CardData>>();

/** Card details and pricing share one request when opened together. A price refresh passes `after` so it never reuses a response older than its snapshot. */
export async function fetchCardData(card: CardBrief, force = false, after = 0): Promise<CardData> {
  // Manual entries have no catalog identity or market quote.
  if (card.id.startsWith('manual-')) return { id: card.id, localId: card.localId, name: card.name, variants: {} };
  const supplemental = supplementalCards[card.language]?.[card.id];

  if (supplemental) return supplemental;

  const key = priceKey(card),
    hit = cached.get(key);

  if (!force && hit && Date.now() - hit.at < DAY && hit.at > after) return hit.data;

  if (pending.has(key)) return pending.get(key)!;

  const task = (async () => {
    const response = await fetch(`https://api.tcgdex.net/v2/${card.language}/cards/${encodeURIComponent(card.id)}`, {
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) throw new Error('We could not load this card. Check your connection and try again.');
    const result = v.safeParse(CardResponse, await response.json());

    if (!result.success) throw new Error('This card has incomplete catalog data. Please try another printing.');
    const data = result.output;

    if (data.id !== card.id) throw new Error('The catalog returned a different card. Please try again.');
    cached.set(key, { data, at: Date.now() });

    if (cached.size > 1200) cached.delete(cached.keys().next().value!);

    return data;
  })();

  pending.set(key, task);

  try {
    return await task;
  } finally {
    pending.delete(key);
  }
}
