import * as v from 'valibot';
import type { CardData } from './card-api';
import { isLanguage } from './languages';
import type { CardBrief, Entry, Finish } from './model';
import { DateText, lenient, PositivePrice } from './schema';

export type MarketPrice = {
  finish: Finish;
  amount: number;
  currency: 'USD' | 'EUR';
  source: 'TCGplayer' | 'Cardmarket';
  updatedAt: string;
};

export type PriceSnapshot = { key: string; checkedAt: number; prices: MarketPrice[]; finishes: Finish[] };

export type ExchangeRate = { rate: number; date: string; checkedAt: number };

export type PriceQuote = {
  low: number;
  high: number;
  sources: string[];
  updatedAt: string;
  converted: boolean;
  unconfirmed: boolean;
  stale: boolean;
};

export const priceKey = (card: CardBrief) => `${card.language}:${card.id}`;

export const HOUR = 3_600_000;

export const DAY = 86_400_000;

const finishes = [
  'normal',
  'holo',
  'reverse',
  'firstEdition',
  'firstEditionHolo',
  'firstEditionReverse',
  'wPromo',
] as const satisfies Finish[];

const variantMap = new Map<string, Finish>([
  ['normal', 'normal'],
  ['unlimited', 'normal'],
  ['unlimitednormal', 'normal'],
  ['holo', 'holo'],
  ['holofoil', 'holo'],
  ['unlimitedholofoil', 'holo'],
  ['reverse', 'reverse'],
  ['reverseholo', 'reverse'],
  ['reverseholofoil', 'reverse'],
  ['1stedition', 'firstEdition'],
  ['1steditionnormal', 'firstEdition'],
  ['firstedition', 'firstEdition'],
  ['1steditionholofoil', 'firstEditionHolo'],
  ['firsteditionholo', 'firstEditionHolo'],
  ['firsteditionholofoil', 'firstEditionHolo'],
  ['1steditionreverseholofoil', 'firstEditionReverse'],
  ['firsteditionreverse', 'firstEditionReverse'],
  ['wpromo', 'wPromo'],
]);

export const marketFinish = (value: string): Finish | undefined =>
  variantMap.get(value.toLowerCase().replace(/[^a-z0-9]/g, ''));

/** Use only actual positive market/trend prices, never asking-price highs or a missing-price zero. */
export function parseCardPricing(card: CardBrief, data: CardData, now = Date.now()): PriceSnapshot {
  if (data.id !== card.id) throw new Error('The price response did not match this card.');
  const { variants } = data;
  const available = new Set<Finish>(finishes.filter((f) => variants[f] === true));

  if (variants.firstEdition) {
    available.delete('firstEdition');

    if (variants.normal) available.add('firstEdition');

    if (variants.holo) available.add('firstEditionHolo');

    if (variants.reverse) available.add('firstEditionReverse');
  }

  const prices: MarketPrice[] = [];
  const tcg = data.pricing?.tcgplayer;

  if (tcg) {
    for (const [name, value] of Object.entries(tcg.variants)) {
      const finish = marketFinish(name);

      if (finish && value) {
        prices.push({
          finish,
          amount: value.marketPrice,
          currency: 'USD',
          source: 'TCGplayer',
          updatedAt: tcg.updated,
        });
        available.add(finish);
      }
    }
  }

  const cm = data.pricing?.cardmarket;
  // Cardmarket's base trend is usable when the catalog identifies one primary printing.
  // Its "*-holo" fields do not reliably distinguish all special/reverse variants, so omit them.
  const primary = (['normal', 'holo'] as const).filter((f) => variants[f] === true);

  if (cm && primary.length === 1) {
    const finish = primary[0];
    // Conflicting catalog flags (e.g. GX marked Regular but priced as Holo) cannot justify a second price.
    const usdPrimary = prices.filter((p) => p.finish === 'normal' || p.finish === 'holo');

    if (!usdPrimary.length || usdPrimary.some((p) => p.finish === finish))
      prices.push({ finish, amount: cm.trend, currency: 'EUR', source: 'Cardmarket', updatedAt: cm.updated });
  }

  return { key: priceKey(card), checkedAt: now, prices, finishes: [...available] };
}

/**
 * TCGdex publishes market prices about once a day. Check again a day after the last check, or sooner once the
 * provider's next daily update is due for prices that were current when fetched. Prices that were already a day
 * old when fetched aren't expected to move sooner, so a stalled listing never causes hourly requests.
 */
export function needsRefresh(snapshot: PriceSnapshot, now = Date.now()) {
  const age = now - snapshot.checkedAt;

  if (age >= DAY) return true;
  const newest = Math.max(0, ...snapshot.prices.map((p) => Date.parse(p.updatedAt)));

  // An hour of slack lets the provider finish publishing before we ask.
  return newest > 0 && snapshot.checkedAt - newest < DAY && now - newest >= DAY + HOUR && age >= HOUR;
}

/** The ECB's euro to US dollar rate from Frankfurter. */
export const FrankfurterRate = v.object({
  base: v.literal('EUR'),
  quote: v.literal('USD'),
  rate: PositivePrice,
  date: DateText,
});

export type FrankfurterRate = v.InferOutput<typeof FrankfurterRate>;

export const parseExchangeRate = ({ rate, date }: FrankfurterRate, now = Date.now()): ExchangeRate => ({
  rate,
  date,
  checkedAt: now,
});

/** Return cents so copy counts and totals sum the same amounts displayed on cards. */
export function quotePrice(
  snapshot: PriceSnapshot | undefined,
  finish: Finish,
  fx?: ExchangeRate,
  now = Date.now(),
): PriceQuote | null {
  if (!snapshot) return null;
  const selected: MarketPrice[] = [];

  for (const f of finish === 'unsure' ? finishes : [finish]) {
    const options = snapshot.prices.filter((p) => p.finish === f);

    const price =
      options.find((p) => p.currency === 'USD') ?? (fx ? options.find((p) => p.currency === 'EUR') : undefined);

    if (price) selected.push(price);
  }

  if (!selected.length) return null;
  const amounts = selected.map((p) => Math.round(p.amount * (p.currency === 'EUR' ? fx!.rate : 1) * 100));
  const converted = selected.some((p) => p.currency === 'EUR');

  return {
    low: Math.min(...amounts),
    high: Math.max(...amounts),
    sources: [...new Set(selected.map((p) => p.source))],
    updatedAt: selected.map((p) => p.updatedAt).sort()[0],
    converted,
    unconfirmed: finish === 'unsure',
    stale:
      now - snapshot.checkedAt > DAY ||
      selected.some((p) => now - Date.parse(p.updatedAt) > 7 * DAY) ||
      (converted && (now - fx!.checkedAt > DAY || now - Date.parse(fx!.date) > 7 * DAY)),
  };
}

export const usd = (cents: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);

export const quoteLabel = (quote: Pick<PriceQuote, 'low' | 'high'>, quantity = 1) =>
  quote.low === quote.high ? usd(quote.low * quantity) : `${usd(quote.low * quantity)}–${usd(quote.high * quantity)}`;

export function collectionValue(
  entries: Entry[],
  snapshots: Readonly<Record<string, PriceSnapshot>>,
  fx?: ExchangeRate,
  now = Date.now(),
) {
  let low = 0,
    high = 0,
    priced = 0,
    missing = 0,
    unconfirmed = 0,
    stale = 0;

  for (const entry of entries) {
    if (entry.finish === 'unsure') unconfirmed += entry.quantity;
    const quote = quotePrice(snapshots[priceKey(entry.card)], entry.finish, fx, now);

    if (!quote) {
      missing += entry.quantity;
      continue;
    }

    low += quote.low * entry.quantity;
    high += quote.high * entry.quantity;
    priced += entry.quantity;

    if (quote.stale) stale += entry.quantity;
  }

  return { low, high, priced, missing, unconfirmed, stale };
}

export type RankedEntry = { entry: Entry; quote: PriceQuote };

/**
 * Priced saved printings, worth the most per copy first. Ranked by the low end of each estimate like the binder's
 * price sort, so a stack of cheap copies never outranks one valuable card. Unpriced printings are left out.
 */
export function rankByValue(
  entries: Entry[],
  snapshots: Readonly<Record<string, PriceSnapshot>>,
  fx?: ExchangeRate,
  now = Date.now(),
): RankedEntry[] {
  const ranked: RankedEntry[] = [];

  for (const entry of entries) {
    const quote = quotePrice(snapshots[priceKey(entry.card)], entry.finish, fx, now);

    if (quote) ranked.push({ entry, quote });
  }

  // Sorting is stable, so equal values keep collection order.
  return ranked.sort((a, b) => b.quote.low - a.quote.low);
}

/** The saved printing worth the most per copy. */
export const mostValuable = (
  entries: Entry[],
  snapshots: Readonly<Record<string, PriceSnapshot>>,
  fx?: ExchangeRate,
  now = Date.now(),
): RankedEntry | undefined => rankByValue(entries, snapshots, fx, now)[0];

export type ValueGroup<K extends string> = ReturnType<typeof collectionValue> & {
  key: K;
  copies: number;
  entries: Entry[];
};

/** Collection totals split by set, language or anything else `keyOf` names. Most valuable first, then most copies. */
export function valueByGroup<K extends string>(
  entries: Entry[],
  snapshots: Readonly<Record<string, PriceSnapshot>>,
  fx: ExchangeRate | undefined,
  keyOf: (entry: Entry) => K,
  now = Date.now(),
): ValueGroup<K>[] {
  const groups = new Map<K, Entry[]>();

  for (const entry of entries) {
    const key = keyOf(entry),
      list = groups.get(key);

    if (list) list.push(entry);
    else groups.set(key, [entry]);
  }

  return [...groups]
    .map(([key, list]) => {
      const value = collectionValue(list, snapshots, fx, now);

      return { ...value, key, copies: value.priced + value.missing, entries: list };
    })
    .sort((a, b) => b.low - a.low || b.copies - a.copies);
}

/**
 * The provider's latest publish date among the saved cards' prices, for "Prices from …". Read from the snapshots: a
 * quote's `updatedAt` is its oldest source, so a "Not sure yet" range would understate how fresh the prices are.
 */
export function newestPriceDate(
  entries: readonly Entry[],
  snapshots: Readonly<Record<string, PriceSnapshot>>,
): string | undefined {
  let newest: string | undefined;

  for (const entry of entries)
    for (const price of snapshots[priceKey(entry.card)]?.prices ?? []) {
      if (!newest || Date.parse(price.updatedAt) > Date.parse(newest)) newest = price.updatedAt;
    }

  return newest;
}

/** Why a saved printing has no price: still loading, a failed lookup, a missing exchange rate, or nothing listed. */
export type MissingPrice = 'loading' | 'failed' | 'exchange' | 'printing' | 'unlisted';

export function missingPriceReason(
  snapshot: PriceSnapshot | undefined,
  finish: Finish,
  fx: ExchangeRate | undefined,
  status: { pending: boolean; failed: boolean },
): MissingPrice {
  if (status.pending) return 'loading';

  if (!snapshot) return status.failed ? 'failed' : 'loading';
  const wanted = (p: MarketPrice) => finish === 'unsure' || p.finish === finish;

  if (!fx && snapshot.prices.some((p) => wanted(p) && p.currency === 'EUR')) return 'exchange';

  // A chosen printing with no price while its siblings have one is often the wrong printing.
  if (finish !== 'unsure' && snapshot.prices.some((p) => p.finish !== finish)) return 'printing';

  return 'unlisted';
}

export type PriceCache = { snapshots: Record<string, PriceSnapshot>; fx?: ExchangeRate };

const CachedPrice = v.union([
  v.object({
    finish: v.picklist(finishes),
    amount: PositivePrice,
    currency: v.literal('USD'),
    source: v.literal('TCGplayer'),
    updatedAt: DateText,
  }),
  v.object({
    finish: v.picklist(finishes),
    amount: PositivePrice,
    currency: v.literal('EUR'),
    source: v.literal('Cardmarket'),
    updatedAt: DateText,
  }),
]);

const CachedKey = v.pipe(
  v.string(),
  v.regex(/^[a-z-]+:[\w.!%?-]{1,100}$/),
  v.check((key) => isLanguage(key.split(':')[0])),
);

/** Snapshots and the rate can't be checked in the future; a bad snapshot or rate is skipped, not fatal. */
function priceCacheSchema(now: number) {
  const CheckedAt = v.pipe(v.number(), v.finite(), v.gtValue(0), v.maxValue(now + DAY));

  return v.object({
    version: v.literal(1),
    snapshots: v.pipe(
      v.array(v.unknown()),
      v.transform((saved) => saved.slice(0, 5000)),
      v.array(
        lenient(
          v.object({
            key: CachedKey,
            checkedAt: CheckedAt,
            prices: v.pipe(
              v.array(lenient(CachedPrice)),
              v.transform((prices) => prices.filter((price) => price !== undefined)),
            ),
            finishes: v.array(v.picklist(finishes)),
          }),
        ),
      ),
    ),
    fx: lenient(v.object({ rate: PositivePrice, date: DateText, checkedAt: CheckedAt })),
  });
}

/** Price cache is disposable and separate from the family's collection backups. */
export function parsePriceCache(raw: string | null, now = Date.now()): PriceCache {
  if (!raw || raw.length > 10_000_000) return { snapshots: {} };
  let saved;

  try {
    saved = JSON.parse(raw);
  } catch {
    return { snapshots: {} };
  }

  const result = v.safeParse(priceCacheSchema(now), saved);

  if (!result.success) return { snapshots: {} };
  const snapshots: Record<string, PriceSnapshot> = {};

  for (const snapshot of result.output.snapshots) if (snapshot) snapshots[snapshot.key] = snapshot;
  const cache: PriceCache = { snapshots };

  if (result.output.fx) cache.fx = result.output.fx;

  return cache;
}
