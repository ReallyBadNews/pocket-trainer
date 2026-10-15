import { Image } from 'expo-image';
import { Fragment, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import {
  Button,
  C,
  CardArt,
  CardCaption,
  Icon,
  S,
  TypePill,
  Txt,
  mono,
  pressFx,
  tick,
  ui,
} from '@/components/pokedex-ui';
import { LANGUAGE_CODES, LANGUAGE_LABELS } from '@/lib/languages';
import { pokemonIds } from '@/lib/card-kind';
import { useCollection } from '@/lib/collection-context';
import { speciesById, speciesImage } from '@/lib/catalog';
import { collectorNumber, discoveredIds, FINISH_LABELS, type Entry } from '@/lib/model';
import { wishesForSpecies } from '@/lib/wishlist';
import { CardPriceTag } from '@/components/card-values';
import { evolutionFamily, pokedexEntry, speciesTypes, typeLabel } from '@/lib/species-details';
import { animatedSprite } from '@/lib/pokedex-voice';
import { usePokedexVoice } from '@/lib/use-pokedex-voice';
import { Sheet } from '@/components/sheet';
import { PokedexVoiceButtons } from '@/components/pokedex-voice-buttons';

const nameOf = (id: number) => speciesById.get(id)?.en ?? `#${id}`;

const listNames = (ids: number[]) =>
  ids.length < 2
    ? ids.map(nameOf).join('')
    : `${ids.slice(0, -1).map(nameOf).join(', ')} and ${nameOf(ids[ids.length - 1])}`;

function familyNote(ids: number[], discovered: ReadonlySet<number>) {
  const have = ids.filter((id) => discovered.has(id));

  if (have.length === ids.length) return 'You have the whole family!';

  if (!have.length) return 'Who will you discover first?';

  return have.length <= 3 ? `You have ${listNames(have)}!` : `You have ${have.length} of ${ids.length} in this family!`;
}

/** The moving sprite the games show on the Pokédex screen; newer Pokémon without one use their artwork. */
function AnimatedSprite({ id }: { id: number }) {
  const [failed, setFailed] = useState(false);
  const source = animatedSprite(id);

  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={m.sprite}>
      <Image
        source={failed || !source ? speciesImage(id) : source}
        style={{ width: '100%', height: '100%' }}
        contentFit="contain"
        cachePolicy="memory-disk"
        onError={() => setFailed(true)}
      />
    </View>
  );
}

export function SpeciesModal({
  id,
  onClose,
  onFindCards,
  onEntry,
  onSpecies,
}: {
  id: number;
  onClose: () => void;
  onFindCards: (name: string) => void;
  onEntry: (entry: Entry) => void;
  onSpecies: (id: number) => void;
}) {
  const { trainer } = useCollection();
  const { width, fontScale } = useWindowDimensions();
  const pokemon = speciesById.get(id)!;
  const entries = trainer.entries.filter((e) => pokemonIds(e.card).includes(id));
  const owned = entries.length > 0;
  const cardCount = entries.reduce((n, e) => n + e.quantity, 0);
  const wished = wishesForSpecies(trainer, id).length;
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const types = speciesTypes(id);
  const entry = pokedexEntry(id);
  const family = evolutionFamily(id);
  const voice = usePokedexVoice();
  const familyIds = family.flat().map((member) => member.id);
  // Keep names readable rather than squeezing every stage into the sheet.
  // Large branching families wrap beside their previous stage.
  const wideColumns = width >= 700 ? 4 : 2;
  const tile = Math.ceil(94 * Math.min(fontScale, 1.4));

  return (
    <Sheet title={`Pokédex #${String(id).padStart(3, '0')}`} onClose={onClose}>
      <ScrollView contentContainerStyle={m.content}>
        <View style={{ alignItems: 'center', gap: S.sm }}>
          <Image
            accessibilityLabel={owned ? pokemon.en : `${pokemon.en} silhouette`}
            source={speciesImage(id)}
            style={{ width: 180, maxWidth: '100%', height: 160, opacity: owned ? 1 : 0.3 }}
            tintColor={owned ? undefined : '#526B50'}
            contentFit="contain"
            cachePolicy="memory-disk"
          />
          <Txt style={[ui.title, { textAlign: 'center' }]}>{pokemon.en}</Txt>
          {types.length > 0 && (
            <View
              accessible
              accessibilityLabel={`${types.map(typeLabel).join(' and ')} type`}
              style={[ui.row, { flexWrap: 'wrap', justifyContent: 'center' }]}
            >
              {types.map((type) => (
                <TypePill key={type} type={type} />
              ))}
            </View>
          )}
          <Txt variant="caption" muted style={{ textAlign: 'center' }}>
            {pokemon.ja} · {pokemon.genus}
          </Txt>
          <Txt variant="caption" muted style={{ textAlign: 'center' }}>
            {owned ? `${cardCount} ${cardCount === 1 ? 'card' : 'cards'} collected` : 'Not discovered yet'}
          </Txt>
        </View>
        <View style={m.entry}>
          <Txt accessibilityRole="header" variant="subtitle">
            Pokédex entry
          </Txt>
          <View style={m.entryScreen}>
            {owned ? (
              <>
                <View
                  accessible
                  accessibilityLabel={`Pokédex entry. ${entry ?? 'Coming soon.'}`}
                  style={[ui.row, { alignItems: 'flex-start', gap: 12 }]}
                >
                  <AnimatedSprite id={id} />
                  <Txt style={[m.entryText, { flex: 1 }]}>{entry ?? 'This Pokédex entry is still being written.'}</Txt>
                </View>
                <PokedexVoiceButtons id={id} name={pokemon.en} voice={voice} />
              </>
            ) : (
              <View
                accessible
                accessibilityLabel={`Pokédex entry locked. Discover ${pokemon.en} to unlock it.`}
                style={[ui.row, { alignItems: 'flex-start' }]}
              >
                <Icon name="lock" size={24} color="#6B7B64" />
                <View style={{ flex: 1, gap: S.xs }}>
                  <Txt style={[m.entryText, { fontWeight: '600' }]}>
                    Discover {pokemon.en} to unlock its Pokédex entry!
                  </Txt>
                  <Txt variant="caption" muted>
                    Scan or add any {pokemon.en} card.
                  </Txt>
                </View>
              </View>
            )}
          </View>
        </View>
        <View style={{ gap: 10 }}>
          <Txt style={ui.subtitle}>Evolution</Txt>
          {family.length > 1 ? (
            <>
              <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={m.evolution}>
                {family.map((stage, i) => (
                  <Fragment key={i}>
                    {i > 0 && (
                      <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                        <Icon name="arrow" size={14} color={C.muted} />
                      </View>
                    )}
                    <View
                      style={[
                        m.stage,
                        stage.length > 3 && {
                          flexDirection: 'row',
                          flexWrap: 'wrap',
                          width: wideColumns * tile + (wideColumns - 1) * 6,
                        },
                      ]}
                    >
                      {stage.map((member) => {
                        const current = member.id === id,
                          found = discovered.has(member.id);

                        return (
                          <Pressable
                            key={member.id}
                            accessibilityRole="button"
                            accessibilityLabel={`${nameOf(member.id)}, ${found ? 'discovered' : 'not yet discovered'}${current ? ', showing now' : ''}`}
                            accessibilityState={{ selected: current }}
                            onPress={() => !current && onSpecies(member.id)}
                            style={({ pressed }) => [
                              m.stageTile,
                              { minWidth: tile },
                              current && m.stageCurrent,
                              pressed && !current && { opacity: 0.7 },
                            ]}
                          >
                            <Image
                              source={speciesImage(member.id)}
                              style={[{ width: 76, height: 76 }, !found && { opacity: 0.3 }]}
                              tintColor={found ? undefined : '#526B50'}
                              contentFit="contain"
                              cachePolicy="memory-disk"
                            />
                            <Txt variant="caption" style={m.stageName}>
                              {nameOf(member.id)}
                            </Txt>
                          </Pressable>
                        );
                      })}
                    </View>
                  </Fragment>
                ))}
              </ScrollView>
              <Txt variant="label" style={{ textAlign: 'center' }}>
                {familyNote(familyIds, discovered)}
              </Txt>
            </>
          ) : (
            <Txt muted>{pokemon.en} doesn’t evolve. It’s one of a kind!</Txt>
          )}
        </View>
        <Button title={`Find ${pokemon.en} cards`} icon="search" onPress={() => onFindCards(pokemon.en)} />
        {wished > 0 && (
          <View style={[m.wishBadge, { alignSelf: 'center' }]}>
            <Icon name="star" size={16} color={C.wishStar} filled />
            <Txt variant="caption" style={m.wishBadgeText}>
              {wished} {pokemon.en} {wished === 1 ? 'card' : 'cards'} on your wishlist
            </Txt>
          </View>
        )}
        {owned && (
          <>
            <Txt style={ui.subtitle}>Your {pokemon.en} cards</Txt>
            <View style={m.cardGrid}>
              {entries.map((e) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${e.card.name}, ${e.card.set.name}, ${collectorNumber(e.card)}, ${LANGUAGE_LABELS[e.card.language]}, ${FINISH_LABELS[e.finish]}${e.quantity > 1 ? `, ${e.quantity} copies` : ''}`}
                  key={e.key}
                  onPress={() => {
                    tick();
                    onEntry(e);
                  }}
                  style={(state) => [m.cardTile, pressFx(state)]}
                >
                  <View>
                    <CardArt card={e.card} />
                    {e.quantity > 1 && (
                      <View style={m.countBadge}>
                        <Txt style={m.countText}>×{e.quantity}</Txt>
                      </View>
                    )}
                  </View>
                  <CardCaption
                    name={e.card.name}
                    setName={e.card.set.name}
                    detail={`${LANGUAGE_CODES[e.card.language]} · ${collectorNumber(e.card)} · ${FINISH_LABELS[e.finish]}`}
                  />
                  <CardPriceTag card={e.card} finish={e.finish} />
                </Pressable>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Sheet>
  );
}

const m = StyleSheet.create({
  sprite: { width: 48, height: 48 },
  content: { padding: S.xl, paddingBottom: S.xxl, gap: S.lg },
  entry: { gap: S.md },
  entryScreen: { gap: S.md },
  entryText: { fontSize: 15, lineHeight: 22 },
  evolution: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  stage: { gap: 6, justifyContent: 'center' },
  stageTile: {
    minHeight: 88,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 3,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  stageCurrent: { backgroundColor: '#F8FAF3', borderColor: '#ADC79F' },
  stageName: { fontWeight: '600', textAlign: 'center' },
  wishBadge: { maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: S.sm },
  wishBadgeText: { color: C.wishInk, fontWeight: '600', flexShrink: 1 },
  cardGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 16 },
  cardTile: { width: '48%' },
  countBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 36,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    backgroundColor: C.ink,
    alignItems: 'center',
  },
  countText: { color: 'white', fontFamily: mono, fontSize: 14, fontWeight: '700' },
});
