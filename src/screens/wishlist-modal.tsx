import { useState } from 'react';
import { FlatList, Pressable, Share, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Button,
  C,
  CardArt,
  CardCaption,
  ErrorNotice,
  Icon,
  IconButton,
  S,
  Txt,
  pressFx,
  tick,
  ui,
} from '@/components/pokedex-ui';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { useCollection } from '@/lib/collection-context';
import { printedNumber, setForCard } from '@/lib/catalog';
import { type CardBrief, type Trainer } from '@/lib/model';
import { removeWish, restoreWish, wishesOf, wishlistShareText, type Wish } from '@/lib/wishlist';
import { CardPriceTag } from '@/components/card-values';
import { Sheet } from '@/components/sheet';

function WishTile({
  wish,
  columns,
  onOpen,
  onRemove,
}: {
  wish: Wish;
  columns: number;
  onOpen: () => void;
  onRemove: () => void;
}) {
  const { card } = wish;
  const set = setForCard(card)?.name;

  return (
    <View style={{ flex: 1 / columns, marginBottom: S.lg }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${card.name}, ${set ? `${set}, ` : ''}number ${card.localId}, ${LANGUAGE_LABELS[card.language]}`}
        accessibilityHint="Opens the card so you can add it when you get it"
        onPress={() => {
          tick();
          onOpen();
        }}
        style={pressFx}
      >
        <CardArt card={card} />
        <CardCaption
          name={card.name}
          setName={set ?? card.id}
          detail={`${LANGUAGE_CODES[card.language]} · #${printedNumber(card)}`}
        />
      </Pressable>
      <CardPriceTag card={card} printingHint={false} />
      {/* A sibling, not a child, of the tile button so VoiceOver can reach it. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Remove ${card.name} from your wishlist`}
        onPress={() => {
          tick();
          onRemove();
        }}
        style={(state) => [m.wishRemove, pressFx(state)]}
      >
        <View style={m.wishRemoveDot}>
          <Icon name="close" size={16} />
        </View>
      </Pressable>
    </View>
  );
}

export function WishlistModal({
  onClose,
  onCard,
  onFind,
}: {
  onClose: () => void;
  onCard: (card: CardBrief) => void;
  onFind: () => void;
}) {
  const { trainer, updateTrainer } = useCollection();
  const wishes = wishesOf(trainer);
  const { width } = useWindowDimensions();
  const columns = Math.min(600, width - 24) - 40 >= 440 ? 3 : 2;
  const [removed, setRemoved] = useState<{ wish: Wish; index: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shareFailed, setShareFailed] = useState(false);

  function change(update: (t: Trainer) => Trainer) {
    setError(null);
    updateTrainer(update).catch((e) =>
      setError(e instanceof Error ? e.message : 'We could not update your wishlist. Please try again.'),
    );
  }

  async function share() {
    setShareFailed(false);

    try {
      await Share.share(
        { message: wishlistShareText(trainer.name, wishes) },
        { subject: `${trainer.name}'s Pokémon card wishlist`, dialogTitle: 'Share your wishlist' },
      );
    }
    // Some browsers cannot share; show the list so a grown-up can copy it. Cancelling is not an error.
    catch (e) {
      if (!(e instanceof Error && e.name === 'AbortError')) setShareFailed(true);
    }
  }

  return (
    <Sheet
      title="Your wishlist"
      onClose={onClose}
      action={wishes.length > 0 ? <IconButton round icon="upload" label="Share wishlist" onPress={share} /> : undefined}
    >
      <FlatList
        key={columns}
        data={wishes}
        numColumns={columns}
        keyExtractor={(w) => w.key}
        columnWrapperStyle={{ gap: S.md }}
        contentContainerStyle={m.wishList}
        ListHeaderComponent={
          <View style={{ gap: S.lg, marginBottom: wishes.length ? S.xl : 0 }}>
            {wishes.length > 0 && (
              <View style={{ gap: S.xs }}>
                <Txt variant="caption" muted>
                  {wishes.length} {wishes.length === 1 ? 'wish' : 'wishes'} · {trainer.name}
                </Txt>
                <Txt variant="caption" muted>
                  Tap a card to add it when you get it. Prices are ungraded estimates to help grown-ups shop.
                </Txt>
              </View>
            )}
            {removed && (
              <View style={[m.note, ui.between, { paddingVertical: S.xs }]}>
                <Txt variant="caption" style={{ flex: 1 }}>
                  Removed {removed.wish.card.name}.
                </Txt>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Undo. Put ${removed.wish.card.name} back on your wishlist`}
                  hitSlop={4}
                  onPress={() => {
                    tick();
                    const { wish, index } = removed;
                    setRemoved(null);
                    change((t) => restoreWish(t, wish, index));
                  }}
                  style={(state) => [m.undo, pressFx(state)]}
                >
                  <Txt variant="label" style={{ textDecorationLine: 'underline' }}>
                    Undo
                  </Txt>
                </Pressable>
              </View>
            )}
            <ErrorNotice text={error} />
            {shareFailed && wishes.length > 0 && (
              <View style={[m.note, { gap: S.sm }]}>
                <Txt variant="cardTitle">Sharing isn’t available here.</Txt>
                <Txt variant="caption" muted>
                  Copy this list instead:
                </Txt>
                <Txt variant="caption" selectable>
                  {wishlistShareText(trainer.name, wishes)}
                </Txt>
              </View>
            )}
          </View>
        }
        ListEmptyComponent={
          <View style={m.wishEmpty}>
            <View style={m.wishEmptyStar}>
              <Icon name="star" size={46} color={C.wishStar} filled />
            </View>
            <Txt style={ui.subtitle}>No wishes yet</Txt>
            <Txt muted style={{ textAlign: 'center', maxWidth: 320 }}>
              Find a card you’d love to get, then tap “Add to wishlist.” Your wishes show up here, ready to share with
              family.
            </Txt>
            <Button title="Find cards to wish for" icon="search" onPress={onFind} style={{ alignSelf: 'stretch' }} />
          </View>
        }
        renderItem={({ item, index }) => (
          <WishTile
            wish={item}
            columns={columns}
            onOpen={() => onCard(item.card)}
            onRemove={() => {
              setRemoved({ wish: item, index });
              change((t) => removeWish(t, item.key));
            }}
          />
        )}
      />
    </Sheet>
  );
}

const m = StyleSheet.create({
  wishRemove: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wishRemoveDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFFFFFE8',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.line,
  },
  wishList: { padding: 20, paddingBottom: 26 },
  note: { paddingVertical: S.sm },
  undo: { minHeight: 44, minWidth: 56, alignItems: 'center', justifyContent: 'center' },
  wishEmpty: { alignItems: 'center', gap: S.lg, paddingVertical: S.xl },
  wishEmptyStar: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
});
