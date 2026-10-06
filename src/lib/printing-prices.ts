import type { Finish } from './model';
import type { ExchangeRate, MarketPrice, PriceSnapshot } from './pricing';

/** Catalog order, so every card lists Regular, Holo and Reverse holo before the 1st editions. */
const ORDER: readonly Finish[] = [
  'normal',
  'holo',
  'reverse',
  'firstEdition',
  'firstEditionHolo',
  'firstEditionReverse',
  'wPromo',
];

export type PrintingPrice = {
  finish: Finish;
  /** TCGplayer market price in US cents. */
  tcgplayer?: { cents: number; updatedAt: string };
  /** Cardmarket trend in euros, and in US cents once an exchange rate is known. */
  cardmarket?: { euros: number; cents?: number; updatedAt: string };
  /** What this printing counts as in the binder: TCGplayer first, then the converted trend, matching `quotePrice`. */
  estimate?: number;
};

/** Every printing a card comes in: the catalog's, the price provider's, and any that have a price. Never "Not sure yet". */
export function printingFinishes(known: readonly Finish[], snapshot?: PriceSnapshot): Finish[] {
  const all = new Set<Finish>([
    ...known,
    ...(snapshot?.finishes ?? []),
    ...(snapshot?.prices.map((p) => p.finish) ?? []),
  ]);

  return ORDER.filter((finish) => all.has(finish));
}

/** One row per printing with both providers' prices kept apart, so a buyer can compare them. */
export function printingPrices(known: readonly Finish[], snapshot?: PriceSnapshot, fx?: ExchangeRate): PrintingPrice[] {
  return printingFinishes(known, snapshot).map((finish) => {
    const tcg = snapshot?.prices.find((p) => p.finish === finish && p.source === 'TCGplayer');
    const cm = snapshot?.prices.find((p) => p.finish === finish && p.source === 'Cardmarket');
    const tcgplayer = tcg && { cents: Math.round(tcg.amount * 100), updatedAt: tcg.updatedAt };

    const cardmarket = cm && {
      euros: cm.amount,
      cents: fx ? Math.round(cm.amount * fx.rate * 100) : undefined,
      updatedAt: cm.updatedAt,
    };

    const estimate = tcgplayer?.cents ?? cardmarket?.cents;

    return {
      finish,
      ...(tcgplayer && { tcgplayer }),
      ...(cardmarket && { cardmarket }),
      ...(estimate !== undefined && { estimate }),
    };
  });
}

/** When each provider last published a price for this card, TCGplayer first. */
export function sourceDates(snapshot?: PriceSnapshot): { source: MarketPrice['source']; updatedAt: string }[] {
  return (['TCGplayer', 'Cardmarket'] as const).flatMap((source) => {
    const dates =
      snapshot?.prices
        .filter((p) => p.source === source)
        .map((p) => p.updatedAt)
        .sort() ?? [];

    return dates.length ? [{ source, updatedAt: dates[dates.length - 1] }] : [];
  });
}

export const eur = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'EUR' }).format(amount);
