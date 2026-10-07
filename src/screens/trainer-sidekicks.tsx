import { Image } from 'expo-image';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { C, Icon, S, Txt, pressFx, tick } from '@/components/pokedex-ui';
import { SidekickArt } from '@/components/sidekick-art';
import { TrainerAvatar } from '@/components/trainer-avatar';
import { badgeMeter, badgeStatus, earnedBadges, findBadge } from '@/lib/badge-details';
import { catalogSet, speciesById } from '@/lib/catalog';
import { discoveredIds, type Trainer, type TrainerAppearance } from '@/lib/model';
import { setProgress } from '@/lib/set-progress';
import { SIDEKICKS, unlockedSidekicks, type Sidekick, type SidekickSelection } from '@/lib/sidekicks';

type Choice = { id: SidekickSelection; name: string; detail: string; unlocked: boolean; hint: string };

export function TrainerSidekickPicker({
  trainer,
  appearance,
  busy,
  onChoose,
}: {
  trainer: Trainer;
  appearance: TrainerAppearance;
  busy: boolean;
  onChoose: (selection: SidekickSelection) => void;
}) {
  const discovered = useMemo(() => discoveredIds(trainer), [trainer]);
  const sets = useMemo(() => setProgress(trainer, catalogSet), [trainer]);
  const unlocked = unlockedSidekicks(trainer, earnedBadges(trainer, discovered, sets));
  const selected = appearance.sidekick ?? 'none';

  function choiceFor(sidekick: Sidekick): Choice {
    const open = unlocked.includes(sidekick.id);
    const badge = 'badge' in sidekick ? findBadge(sidekick.badge) : undefined;

    if (!badge)
      return {
        id: sidekick.id,
        name: sidekick.name,
        detail: speciesById.get(sidekick.dexId)?.genus ?? 'Ready from the start',
        unlocked: true,
        hint: 'Selects this sidekick and returns to appearance.',
      };

    if (open)
      return {
        id: sidekick.id,
        name: sidekick.name,
        detail: `Earned with ${badge.name}`,
        unlocked: true,
        hint: 'Selects this sidekick and returns to appearance.',
      };

    const meter = badgeMeter(badge, badgeStatus(trainer, badge, discovered, sets));

    return {
      id: sidekick.id,
      name: sidekick.name,
      detail: `${badge.name} badge · ${meter.label}`,
      unlocked: false,
      hint: `Earn the ${badge.name} badge to unlock this sidekick. ${badge.description}`,
    };
  }

  const choices = SIDEKICKS.map(choiceFor);
  const ready = choices.filter((choice) => choice.unlocked);
  const locked = choices.filter((choice) => !choice.unlocked);

  const none: Choice = {
    id: 'none',
    name: 'No sidekick',
    detail: 'Everyone rests in their Poké Balls',
    unlocked: true,
    hint: 'Removes the sidekick and returns to appearance.',
  };

  const row = (choice: Choice) => {
    const checked = selected === choice.id;

    return (
      <Pressable
        key={choice.id}
        accessibilityRole="radio"
        accessibilityLabel={`${choice.name}${choice.unlocked ? '' : ', locked'}. ${choice.detail}`}
        accessibilityHint={choice.hint}
        accessibilityState={{ checked, disabled: busy || !choice.unlocked }}
        disabled={busy || !choice.unlocked}
        onPress={() => {
          tick();
          onChoose(choice.id);
        }}
        style={(state) => [s.row, busy && s.busy, pressFx(state)]}
      >
        <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={s.art}>
          {choice.id === 'none' ? (
            <Image
              accessible={false}
              source={require('../../assets/crafted/pokeball.png')}
              style={s.pokeball}
              contentFit="contain"
            />
          ) : (
            <SidekickArt id={choice.id} size={56} locked={!choice.unlocked} />
          )}
        </View>
        <View style={s.copy}>
          <Txt variant="cardTitle">{choice.name}</Txt>
          <Txt variant="caption" muted>
            {choice.detail}
          </Txt>
        </View>
        {/* Choosing returns to Appearance rather than opening a page, so rows get a check or a lock, never a chevron. */}
        {checked ? <Icon name="check" size={20} /> : !choice.unlocked && <Icon name="lock" size={18} color={C.muted} />}
      </Pressable>
    );
  };

  return (
    <ScrollView style={s.scroll} contentContainerStyle={s.content}>
      <View style={s.preview}>
        <TrainerAvatar appearance={appearance} size={104} />
        <View style={s.copy}>
          <Txt variant="subtitle">{trainer.name}</Txt>
          <Txt variant="caption" muted>
            Every badge you earn unlocks a new sidekick.
          </Txt>
        </View>
      </View>
      <View accessibilityRole="radiogroup" accessibilityLabel="Sidekick" style={s.sections}>
        <View>
          <Txt accessibilityRole="header" variant="label" muted style={s.heading}>
            Your sidekicks
          </Txt>
          {row(none)}
          {ready.map(row)}
        </View>
        {locked.length > 0 && (
          <View>
            <View style={s.heading}>
              <Txt accessibilityRole="header" variant="label" muted>
                Earn with badges
              </Txt>
              <Txt variant="caption" muted>
                {locked.length} more to unlock
              </Txt>
            </View>
            {locked.map(row)}
          </View>
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 },
  content: { paddingHorizontal: S.xl, paddingBottom: S.xl },
  preview: { flexDirection: 'row', alignItems: 'center', gap: S.lg, paddingVertical: S.lg, marginBottom: S.sm },
  sections: { gap: S.xl },
  heading: { gap: S.xs, marginBottom: S.xs },
  row: {
    minHeight: 80,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    paddingVertical: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  art: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  pokeball: { width: 44, height: 44 },
  copy: { flex: 1, minWidth: 0, gap: S.xs },
  busy: { opacity: 0.6 },
});
