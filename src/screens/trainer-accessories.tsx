import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { C, Icon, S, Txt, pressFx, tick } from '@/components/pokedex-ui';
import { TrainerAvatar } from '@/components/trainer-avatar';
import { discoveredIds, type Trainer, type TrainerAppearance } from '@/lib/model';
import { TRAINER_ACCESSORIES, unlockedTrainerAccessories, type TrainerAccessorySelection } from '@/lib/trainer-accessories';

export function TrainerAccessoryPicker({ trainer, appearance, busy, onChoose }: {
  trainer: Trainer;
  appearance: TrainerAppearance;
  busy: boolean;
  onChoose: (selection: TrainerAccessorySelection) => void;
}) {
  const earned = unlockedTrainerAccessories(trainer);
  const discovered = discoveredIds(trainer).size;
  const selected = appearance.accessory ?? 'none';
  const choices = [
    { id: 'none' as const, name: 'None', description: 'No accessory', target: 0 },
    ...TRAINER_ACCESSORIES,
  ];

  return <ScrollView style={s.scroll} contentContainerStyle={s.content}>
    <View style={s.preview}>
      <TrainerAvatar appearance={appearance} size={104} />
      <View style={s.copy}><Txt variant="subtitle">{trainer.name}</Txt><Txt variant="caption" muted>Discover Pokémon to earn accessories.</Txt></View>
    </View>
    <View accessibilityRole="radiogroup" accessibilityLabel="Trainer accessory">
      {choices.map(choice => {
        const unlocked = choice.id === 'none' || earned.includes(choice.id);
        const checked = selected === choice.id;
        const detail = unlocked ? choice.description : `${discovered} of ${choice.target} Pokémon discovered`;
        return <Pressable key={choice.id} accessibilityRole="radio"
          accessibilityLabel={`${choice.name}${unlocked ? '' : ', locked'}. ${detail}`}
          accessibilityHint={unlocked ? 'Selects this accessory and returns to appearance.' : `Discover ${choice.target} Pokémon to earn this accessory.`}
          accessibilityState={{ checked, disabled: busy || !unlocked }}
          disabled={busy || !unlocked}
          onPress={() => { tick(); onChoose(choice.id); }}
          style={state => [s.row, busy && s.busy, pressFx(state)]}>
          <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={!unlocked && s.lockedArt}>
            <TrainerAvatar appearance={{ ...appearance, accessory: choice.id }} size={56} />
          </View>
          <View style={s.copy}><Txt variant="cardTitle">{choice.name}</Txt><Txt variant="caption" muted>{detail}</Txt></View>
          {/* Choosing returns to Appearance rather than opening a page, so rows get a check or a lock, never a chevron. */}
          {checked ? <Icon name="check" size={20} /> : !unlocked && <Icon name="lock" size={18} color={C.muted} />}
        </Pressable>;
      })}
    </View>
  </ScrollView>;
}

const s = StyleSheet.create({
  scroll: { flexShrink: 1 }, content: { paddingHorizontal: S.xl, paddingBottom: S.xl },
  preview: { flexDirection: 'row', alignItems: 'center', gap: S.lg, paddingVertical: S.lg, marginBottom: S.sm },
  row: { minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: S.md, paddingVertical: S.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  copy: { flex: 1, minWidth: 0, gap: S.xs }, lockedArt: { opacity: .5 }, busy: { opacity: .6 },
});
