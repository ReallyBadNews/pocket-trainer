import { useSyncExternalStore } from 'react';
import type { BinderView } from '@/components/binder-pages';
import { useCollection } from './collection-context';
import { DEFAULT_BINDER_FILTERS, type BinderFilters, type RegionId } from './collection-filters';
import type { BinderSort } from './binder-order';
import type { PokemonType } from './species-details';

/**
 * How the Pokédex and Binder lists are narrowed. Their filter pages are separate routes, so this lives outside
 * any one screen. Each change replaces the snapshot, which keeps React Compiler memoization honest.
 */
function createStore<T>(initial: T) {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    set(update: (current: T) => T) {
      const next = update(state);

      if (next === state) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
  };
}

export type DexShow = 'all' | 'discovered' | RegionId;

export type DexBrowse = { query: string; show: DexShow; type: PokemonType | null };

export const DEFAULT_DEX_BROWSE: DexBrowse = { query: '', show: 'all', type: null };

export type BinderBrowse = BinderFilters & { query: string; sort: BinderSort };

export const DEFAULT_BINDER_BROWSE: BinderBrowse = { ...DEFAULT_BINDER_FILTERS, query: '', sort: 'recent' };

// Filters belong to one trainer: switching trainers starts from a clear list.
const dex = createStore<{ trainerId: string | null; value: DexBrowse }>({ trainerId: null, value: DEFAULT_DEX_BROWSE });

const binder = createStore<{ trainerId: string | null; value: BinderBrowse }>({
  trainerId: null,
  value: DEFAULT_BINDER_BROWSE,
});

// Grid or pages is a display preference shared by every trainer on the device.
const binderView = createStore<BinderView>('grid');

function useTrainerSlice<T>(
  store: ReturnType<typeof createStore<{ trainerId: string | null; value: T }>>,
  fallback: T,
) {
  const { trainer } = useCollection();
  const state = useSyncExternalStore(store.subscribe, store.get);
  const value = state.trainerId === trainer.id ? state.value : fallback;

  const update = (patch: Partial<T>) =>
    store.set((current) => {
      const base = current.trainerId === trainer.id ? current.value : fallback;

      return { trainerId: trainer.id, value: { ...base, ...patch } };
    });

  return [value, update] as const;
}

export const useDexBrowse = () => useTrainerSlice(dex, DEFAULT_DEX_BROWSE);

export const useBinderBrowse = () => useTrainerSlice(binder, DEFAULT_BINDER_BROWSE);

export function useBinderView() {
  return [
    useSyncExternalStore(binderView.subscribe, binderView.get),
    (view: BinderView) => binderView.set(() => view),
  ] as const;
}

/** For actions outside the lists, such as "Confirm printings" on the collection value page. */
export function showOnlyNeedsPrinting(trainerId: string) {
  binder.set(() => ({ trainerId, value: { ...DEFAULT_BINDER_BROWSE, needsPrinting: true } }));
}

/** Every card, in one order: "See all cards by price" shouldn't land on a list still narrowed by old filters. */
export function showAllBinderCardsBy(trainerId: string, sort: BinderSort) {
  binder.set(() => ({ trainerId, value: { ...DEFAULT_BINDER_BROWSE, sort } }));
}
