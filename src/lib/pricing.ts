import type { CardBrief, Entry, Finish } from './model';

export type MarketPrice = { finish: Finish; amount: number; currency: 'USD' | 'EUR'; source: 'TCGplayer' | 'Cardmarket'; updatedAt: string };
export type PriceSnapshot = { key: string; checkedAt: number; prices: MarketPrice[]; finishes: Finish[] };
export type ExchangeRate = { rate: number; date: string; checkedAt: number };
export type PriceQuote = { low: number; high: number; sources: string[]; updatedAt: string; converted: boolean; unconfirmed: boolean; stale: boolean };
export const priceKey = (card: CardBrief) => `${card.language}:${card.id}`;
export const DAY = 86_400_000;
const record = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 100_000_000;
const timestamp = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const validDate = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value));
const finishes: Finish[] = ['normal', 'holo', 'reverse', 'firstEdition', 'firstEditionHolo', 'firstEditionReverse', 'wPromo'];
const variantMap: Record<string, Finish> = {
  normal: 'normal', unlimited: 'normal', unlimitednormal: 'normal', holo: 'holo', holofoil: 'holo', unlimitedholofoil: 'holo',
  reverse: 'reverse', reverseholo: 'reverse', reverseholofoil: 'reverse',
  '1stedition': 'firstEdition', '1steditionnormal': 'firstEdition', firstedition: 'firstEdition',
  '1steditionholofoil': 'firstEditionHolo', firsteditionholo: 'firstEditionHolo', firsteditionholofoil: 'firstEditionHolo',
  '1steditionreverseholofoil': 'firstEditionReverse', firsteditionreverse: 'firstEditionReverse', wpromo: 'wPromo',
};
export const marketFinish = (value: string): Finish | undefined => variantMap[value.toLowerCase().replace(/[^a-z0-9]/g, '')];

/** Use only actual positive market/trend prices, never asking-price highs or a missing-price zero. */
export function parseCardPricing(card: CardBrief, data: unknown, now = Date.now()): PriceSnapshot {
  if (!record(data) || data.id !== card.id) throw new Error('The price response did not match this card.');
  const variants = record(data.variants) ? data.variants : {};
  const available = new Set<Finish>(finishes.filter(f => variants[f] === true));
  if (variants.firstEdition) {
    available.delete('firstEdition');
    if (variants.normal) available.add('firstEdition');
    if (variants.holo) available.add('firstEditionHolo');
    if (variants.reverse) available.add('firstEditionReverse');
  }
  const prices: MarketPrice[] = [];
  const tcg = data.pricing?.tcgplayer;
  if (record(tcg) && tcg.unit === 'USD' && validDate(tcg.updated)) {
    for (const [name, value] of Object.entries(tcg)) {
      const finish = marketFinish(name);
      if (finish && record(value) && positive(value.marketPrice)) {
        prices.push({ finish, amount: value.marketPrice, currency: 'USD', source: 'TCGplayer', updatedAt: tcg.updated });
        available.add(finish);
      }
    }
  }
  const cm = data.pricing?.cardmarket;
  // Cardmarket's base trend is usable when the catalog identifies one primary printing.
  // Its "*-holo" fields do not reliably distinguish all special/reverse variants, so omit them.
  const primary = (['normal', 'holo'] as Finish[]).filter(f => variants[f] === true);
  if (record(cm) && cm.unit === 'EUR' && validDate(cm.updated) && positive(cm.trend) && primary.length === 1) {
    const finish = primary[0];
    // Conflicting catalog flags (e.g. GX marked Regular but priced as Holo) cannot justify a second price.
    const usdPrimary = prices.filter(p => p.finish === 'normal' || p.finish === 'holo');
    if (!usdPrimary.length || usdPrimary.some(p => p.finish === finish))
      prices.push({ finish, amount: cm.trend, currency: 'EUR', source: 'Cardmarket', updatedAt: cm.updated });
  }
  return { key: priceKey(card), checkedAt: now, prices, finishes: [...available] };
}

export function parseExchangeRate(data: unknown, now = Date.now()): ExchangeRate {
  if (!record(data) || data.base !== 'EUR' || data.quote !== 'USD' || !positive(data.rate) || !validDate(data.date)) throw new Error('Exchange rate unavailable.');
  return { rate: data.rate, date: data.date, checkedAt: now };
}

/** Return cents so copy counts and totals sum the same amounts displayed on cards. */
export function quotePrice(snapshot: PriceSnapshot | undefined, finish: Finish, fx?: ExchangeRate, now = Date.now()): PriceQuote | null {
  if (!snapshot) return null;
  const selected: MarketPrice[] = [];
  for (const f of finish === 'unsure' ? finishes : [finish]) {
    const options = snapshot.prices.filter(p => p.finish === f);
    const price = options.find(p => p.currency === 'USD') ?? (fx ? options.find(p => p.currency === 'EUR') : undefined);
    if (price) selected.push(price);
  }
  if (!selected.length) return null;
  const amounts = selected.map(p => Math.round(p.amount * (p.currency === 'EUR' ? fx!.rate : 1) * 100));
  const converted = selected.some(p => p.currency === 'EUR');
  return {
    low: Math.min(...amounts), high: Math.max(...amounts), sources: [...new Set(selected.map(p => p.source))],
    updatedAt: selected.map(p => p.updatedAt).sort()[0], converted, unconfirmed: finish === 'unsure',
    stale: now - snapshot.checkedAt > DAY || selected.some(p => now - Date.parse(p.updatedAt) > 7 * DAY) ||
      (converted && (now - fx!.checkedAt > DAY || now - Date.parse(fx!.date) > 7 * DAY)),
  };
}
export const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
export const quoteLabel = (quote: Pick<PriceQuote, 'low' | 'high'>, quantity = 1) => quote.low === quote.high ? usd(quote.low * quantity) : `${usd(quote.low * quantity)}–${usd(quote.high * quantity)}`;

export function collectionValue(entries: Entry[], snapshots: Readonly<Record<string, PriceSnapshot>>, fx?: ExchangeRate, now = Date.now()) {
  let low = 0, high = 0, priced = 0, missing = 0, unconfirmed = 0, stale = 0;
  for (const entry of entries) {
    if (entry.finish === 'unsure') unconfirmed += entry.quantity;
    const quote = quotePrice(snapshots[priceKey(entry.card)], entry.finish, fx, now);
    if (!quote) { missing += entry.quantity; continue; }
    low += quote.low * entry.quantity; high += quote.high * entry.quantity; priced += entry.quantity;
    if (quote.stale) stale += entry.quantity;
  }
  return { low, high, priced, missing, unconfirmed, stale };
}

/** Price cache is disposable and separate from the family's collection backups. */
export function parsePriceCache(raw: string | null, now = Date.now()): { snapshots: Record<string, PriceSnapshot>; fx?: ExchangeRate } {
  const snapshots: Record<string, PriceSnapshot> = {};
  if (!raw || raw.length > 10_000_000) return { snapshots };
  try {
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Array.isArray(data.snapshots)) return { snapshots };
    for (const s of data.snapshots.slice(0, 5000)) {
      if (!record(s) || typeof s.key !== 'string' || !/^(en|ja):[\w.!%?-]{1,100}$/.test(s.key) || !timestamp(s.checkedAt) || s.checkedAt > now + DAY || !Array.isArray(s.prices) || !Array.isArray(s.finishes)) continue;
      if (!s.finishes.every((f: unknown) => finishes.includes(f as Finish))) continue;
      const prices = s.prices.filter((p: unknown): p is MarketPrice => record(p) && finishes.includes(p.finish) && positive(p.amount) && validDate(p.updatedAt) && ((p.source === 'TCGplayer' && p.currency === 'USD') || (p.source === 'Cardmarket' && p.currency === 'EUR')));
      snapshots[s.key] = { key: s.key, checkedAt: s.checkedAt, finishes: s.finishes, prices };
    }
    const fx = data.fx;
    return { snapshots, ...(record(fx) && positive(fx.rate) && validDate(fx.date) && timestamp(fx.checkedAt) && fx.checkedAt <= now + DAY ? { fx: { rate: fx.rate, date: fx.date, checkedAt: fx.checkedAt } } : {}) };
  } catch { return { snapshots }; }
}
