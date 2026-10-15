import { DiscoveryDevice } from '@/components/discovery-device';
import { useCallback, useEffect, useState } from 'react';
import { AccessibilityInfo, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, ButtonRow, C, CardArt, Icon, IconButton, S, Txt } from '@/components/pokedex-ui';
import { speciesById } from '@/lib/catalog';
import { type Card } from '@/lib/model';
import { findSidekick, type SidekickId } from '@/lib/sidekicks';
import { SidekickArt } from '@/components/sidekick-art';
import { usePokedexVoice } from '@/lib/use-pokedex-voice';
import { Confetti, HoloShine } from '@/components/celebration';
import { isShiny } from '@/lib/shine';
import Reanimated, { useReducedMotion, ZoomIn } from 'react-native-reanimated';
import { Sheet } from '@/components/sheet';
import { PokedexVoiceButtons } from '@/components/pokedex-voice-buttons';

export function DiscoveryModal({
  card,
  newIds,
  quantity,
  granted = 0,
  sidekicks = [],
  nextLabel,
  onNext,
  onClose,
}: {
  card: Card;
  newIds: number[];
  quantity: number;
  granted?: number;
  sidekicks?: SidekickId[];
  nextLabel: string;
  onNext: () => void;
  onClose: () => void;
}) {
  const reduced = useReducedMotion();
  const [revealed, setRevealed] = useState(reduced);
  const [index, setIndex] = useState(0);
  const reveal = useCallback(() => setRevealed(true), []);
  const discovered = newIds.length > 0;
  const id = newIds[index];
  const pokemon = speciesById.get(id);
  const voice = usePokedexVoice();
  const ready = !discovered || revealed;

  function select(next: number) {
    voice.stop();
    setIndex(next);
  }

  useEffect(() => {
    if (!discovered || !revealed || Platform.OS !== 'ios') return;
    let cancelled = false;
    void AccessibilityInfo.isScreenReaderEnabled().then((enabled) => {
      if (enabled && !cancelled)
        AccessibilityInfo.announceForAccessibility(
          `${pokemon?.en ?? `Pokémon number ${id}`} discovered.${newIds.length > 1 ? ` ${index + 1} of ${newIds.length} new Pokémon.` : ''}`,
        );
    });

    return () => {
      cancelled = true;
    };
  }, [discovered, revealed, id, index, newIds.length, pokemon?.en]);

  return (
    <Sheet title={discovered ? 'Pokédex updated' : 'Added to your binder'} onClose={onClose} dismissible={false}>
      <ScrollView contentContainerStyle={[m.content, { alignItems: 'center' }]}>
        {discovered ? (
          <DiscoveryDevice id={id} onReveal={reveal} />
        ) : (
          <View style={m.savedCard}>
            {!reduced && <Confetti count={18} />}
            <Reanimated.View entering={reduced ? undefined : ZoomIn.duration(220)}>
              {isShiny(card) ? (
                <HoloShine style={{ width: 185 }}>
                  <CardArt card={card} />
                </HoloShine>
              ) : (
                <CardArt card={card} style={{ width: 185 }} />
              )}
            </Reanimated.View>
          </View>
        )}
        <View style={m.discoveryCopy}>
          <Txt accessibilityRole="header" accessibilityLiveRegion="polite" variant="title" style={m.center}>
            {!ready
              ? 'A new discovery…'
              : discovered
                ? (pokemon?.en ?? `Pokémon #${id}`)
                : quantity > 1
                  ? `${quantity} cards added`
                  : card.name}
          </Txt>
          <Txt muted style={m.center}>
            {!ready
              ? 'Tap the Pokédex to reveal it.'
              : discovered
                ? 'Discovered in your collection'
                : 'Saved in your binder'}
          </Txt>
          {ready && pokemon && (
            <Txt variant="caption" muted style={m.center}>
              #{String(pokemon.id).padStart(3, '0')} · {pokemon.genus}
            </Txt>
          )}
        </View>
        {ready && discovered && newIds.length > 1 && (
          <View style={m.discoveryPager}>
            <IconButton
              icon="back"
              label="Previous discovery"
              disabled={index === 0}
              onPress={() => select(index - 1)}
            />
            <Txt variant="caption" accessibilityLiveRegion="polite" style={{ flexShrink: 1, textAlign: 'center' }}>
              {index + 1} of {newIds.length} new Pokémon
            </Txt>
            <View style={{ transform: [{ rotate: '180deg' }] }}>
              <IconButton
                icon="back"
                label="Next discovery"
                disabled={index === newIds.length - 1}
                onPress={() => select(index + 1)}
              />
            </View>
          </View>
        )}
        {ready && pokemon && <PokedexVoiceButtons id={id} name={pokemon.en} voice={voice} />}
        {ready && granted > 0 && (
          <View style={m.wishBadge}>
            <Icon name="star" size={18} color={C.wishStar} filled />
            <Txt variant="caption" style={m.wishBadgeText}>
              {granted === 1
                ? 'Wish granted. It’s off your wishlist.'
                : `${granted} wishes granted. They’re off your wishlist.`}
            </Txt>
          </View>
        )}
        {ready && sidekicks.length > 0 && <NewSidekicks ids={sidekicks} />}
      </ScrollView>
      {ready && (
        <View style={m.footer}>
          <ButtonRow>
            <Button title="Done" onPress={onClose} />
            <Button title={nextLabel} icon="camera" secondary onPress={onNext} />
          </ButtonRow>
        </View>
      )}
    </Sheet>
  );
}

/** A badge earned by this add unlocked these sidekicks. They wait in the picker until the trainer chooses one. */
function NewSidekicks({ ids }: { ids: SidekickId[] }) {
  const names = ids.map((id) => findSidekick(id)?.name ?? id);
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}` : names[0];

  return (
    <View
      accessible
      accessibilityLabel={`New ${ids.length > 1 ? 'sidekicks' : 'sidekick'}: ${list}. Choose in Settings, Appearance.`}
      style={m.sidekickNews}
    >
      <View style={m.sidekickArt}>
        {ids.slice(0, 3).map((id) => (
          <SidekickArt key={id} id={id} size={48} />
        ))}
      </View>
      <View style={m.sidekickCopy}>
        <Txt variant="cardTitle" style={m.sidekickTitle}>
          {ids.length > 1 ? `New sidekicks: ${list}!` : `${list} can be your sidekick!`}
        </Txt>
        <Txt variant="caption" muted>
          Choose in Settings › Appearance.
        </Txt>
      </View>
    </View>
  );
}

const m = StyleSheet.create({
  content: { padding: S.xl, paddingBottom: S.xxl, gap: S.lg },
  savedCard: { alignItems: 'center', paddingVertical: S.lg },
  discoveryCopy: { alignSelf: 'stretch', gap: S.xs },
  center: { textAlign: 'center' },
  // The count wraps between the arrows so neither arrow ends up alone on a second line.
  discoveryPager: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: S.sm,
  },
  wishBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: S.sm },
  wishBadgeText: { color: C.wishInk, fontWeight: '600', flexShrink: 1 },
  footer: { padding: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.paper },
  sidekickNews: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.sm },
  sidekickArt: { flexDirection: 'row' },
  sidekickCopy: { flex: 1, minWidth: 0, gap: 2 },
  sidekickTitle: { color: '#80611F' },
});
