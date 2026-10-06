import * as v from 'valibot';

/** Non-empty, bounded text, as the app writes it. */
export const Text = (max = 300) => v.pipe(v.string(), v.minLength(1), v.maxLength(max));

export const DateText = v.pipe(
  v.string(),
  v.check((value) => Number.isFinite(Date.parse(value))),
);

/** Card art served by TCGdex; anything else is never loaded. */
export const TcgdexImage = v.pipe(v.string(), v.startsWith('https://assets.tcgdex.net/'), v.maxLength(499));

/** A National Pokédex number. Saved cards must use these limits, so fetched cards are checked against them too. */
export const DexId = v.pipe(v.number(), v.integer(), v.gtValue(0), v.ltValue(10000));

/** A real market price: positive, and small enough to rule out placeholder values. */
export const PositivePrice = v.pipe(v.number(), v.finite(), v.gtValue(0), v.maxValue(100_000_000));

/** A detail that fails validation is dropped instead of rejecting the record it belongs to. */
export const lenient = <TSchema extends v.GenericSchema>(schema: TSchema) => v.fallback(v.optional(schema), undefined);

/** Dropped lenient details come back as `undefined`; leave the key out, as the app does when it builds records. */
export function withoutUndefined<T extends object>(value: T): T {
  // SAFETY: only keys whose value is `undefined` are removed, and the schemas produce `undefined` only for optional keys.
  return Object.fromEntries(Object.entries(value).filter(([, field]) => field !== undefined)) as T;
}
