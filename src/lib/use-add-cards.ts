import * as Haptics from 'expo-haptics';
import { pokemonIds } from './card-kind';
import { useCollection } from './collection-context';
import { keepCardArt } from './files';
import { addCard, discoveredIds, entryKey, type Addition, type Card, type Finish } from './model';

/** `granted` counts wishlist cards that this add took off the list. */
export type AddedCards = { cards: Card[]; newIds: number[]; quantity: number; additions: Addition[]; trainerId: string; granted: number };

/** Save cards to the active trainer in one update and report what to celebrate or undo. */
export function useAddCards() {
  const { trainer, updateTrainer } = useCollection();
  return async (items: { card: Card; finish: Finish; quantity: number }[]): Promise<AddedCards> => {
    const kept = await Promise.all(items.map(async item => ({ ...item, card: await keepCardArt(item.card) })));
    let newIds: number[] = [], granted = 0;
    await updateTrainer(t => {
      const before = discoveredIds(t);
      const next = kept.reduce((current, item) => addCard(current, item.card, item.finish, item.quantity), t);
      newIds = [...new Set(kept.flatMap(item => pokemonIds(item.card)))].filter(id => !before.has(id));
      granted = (t.wishlist?.length ?? 0) - (next.wishlist?.length ?? 0);
      return next;
    }, trainer.id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    return {
      cards: kept.map(item => item.card), newIds, trainerId: trainer.id, granted,
      quantity: kept.reduce((n, item) => n + item.quantity, 0),
      additions: kept.map(item => ({ key: entryKey(item.card, item.finish), quantity: item.quantity })),
    };
  };
}
