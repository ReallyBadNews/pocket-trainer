import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { freshCollection, parseCollection, type Collection, type Trainer } from './model';
import { readSaved, writeSaved } from './storage';

type CollectionContextValue = {
  collection: Collection; trainer: Trainer; ready: boolean; loadError: string | null;
  transact: (update: (current: Collection) => Collection) => Promise<void>;
  updateTrainer: (update: (current: Trainer) => Trainer, id?: string) => Promise<void>;
  retryLoad: () => void;
};
const Context = createContext<CollectionContextValue | null>(null);

export function CollectionProvider({ children }: { children: ReactNode }) {
  const [collection, setCollection] = useState(freshCollection);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const current = useRef(collection);
  const loaded = useRef(false);
  const queue = useRef(Promise.resolve());
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const raw = await readSaved();
        const data = raw ? parseCollection(raw) : freshCollection();
        if (live) { current.current = data; setCollection(data); loaded.current = true; setReady(true); setLoadError(null); }
      } catch {
        if (live) setLoadError('Your saved collection could not be opened. Your existing data has been kept. Try reopening the app or retry below.');
      }
    })();
    return () => { live = false; };
  }, [loadAttempt]);

  function transact(update: (state: Collection) => Collection): Promise<void> {
    const task = queue.current.then(async () => {
      if (!loaded.current) throw new Error('Wait for your collection to finish opening.');
      const next = update(current.current);
      try { await writeSaved(JSON.stringify(next)); }
      catch { throw new Error('There was not enough space to save. Free some device storage and try again.'); }
      current.current = next;
      setCollection(next);
    });
    queue.current = task.catch(() => {});
    return task;
  }
  function updateTrainer(update: (trainer: Trainer) => Trainer, id = collection.activeId) {
    return transact(state => ({ ...state, trainers: state.trainers.map(t => t.id === id ? update(t) : t) }));
  }
  const trainer = collection.trainers.find(t => t.id === collection.activeId)!;
  return <Context.Provider value={{ collection, trainer, ready, loadError, transact, updateTrainer, retryLoad: () => setLoadAttempt(n => n + 1) }}>{children}</Context.Provider>;
}
export function useCollection() {
  const context = useContext(Context);
  if (!context) throw new Error('CollectionProvider is required.');
  return context;
}
