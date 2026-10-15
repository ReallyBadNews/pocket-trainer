import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, TextInput, View } from 'react-native';
import { ActionRow, Button, C, ChoiceMenu, ErrorNotice, Icon, S, Txt, pressFx, tick } from '@/components/pokedex-ui';
import { useCollection } from '@/lib/collection-context';
import { catalogSet } from '@/lib/catalog';
import {
  discoveredIds,
  mergeBackup,
  parseCollection,
  portableBackup,
  totalCards,
  TRAINER_HAIR_COLORS,
  TRAINER_HAIR_STYLES,
  TRAINER_HEADWEAR,
  TRAINER_OUTFITS,
  TRAINER_OUTFIT_COLORS,
  TRAINER_SKIN_TONES,
  trainerAppearanceFor,
  type TrainerAppearance,
} from '@/lib/model';
import { exportFile, importFile } from '@/lib/files';
import { TRAINER_APPEARANCE_LABELS, TrainerAvatar } from '@/components/trainer-avatar';
import { useGrownUpCheck } from '@/components/grown-up-gate';
import { AboutScreen } from './about-screen';
import type { AppUpdates } from '@/lib/use-app-updates';
import { TrainerAccessoryPicker } from './trainer-accessories';
import { TrainerSidekickPicker } from './trainer-sidekicks';
import { TRAINER_ACCESSORIES, awardTrainerAccessories, canEquipTrainerAccessory } from '@/lib/trainer-accessories';
import { awardSidekicks, canChooseSidekick, findSidekick } from '@/lib/sidekicks';
import { earnedBadges } from '@/lib/badge-details';
import { setProgress } from '@/lib/set-progress';
import { Sheet } from '@/components/sheet';

function TrainerChoiceRow<T extends string>({
  title,
  options,
  value,
  labels,
  busy,
  onChange,
}: {
  title: string;
  options: readonly T[];
  value: T;
  labels: Record<T, string>;
  busy: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <ChoiceMenu
      disabled={busy}
      label={title}
      options={options.map((id) => ({ id, label: labels[id] }))}
      value={value}
      onChange={(next) => !busy && onChange(next)}
    />
  );
}

type Feedback = { at: string; note?: string; error?: string };

type ProfilePage = 'settings' | 'rename' | 'add' | 'appearance' | 'accessories' | 'sidekicks' | 'about';

export function ProfilesModal({
  startPage = 'settings',
  update,
  onClose,
  onBusyChange,
}: {
  startPage?: 'settings' | 'about';
  update?: AppUpdates;
  onClose: () => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const { collection, trainer, transact, updateTrainer } = useCollection();
  const [name, setName] = useState(trainer.name);
  const [newName, setNewName] = useState('');
  const [page, setPage] = useState<ProfilePage>(startPage);
  const [draft, setDraft] = useState<TrainerAppearance>(trainer.appearance);
  // Which action is saving: only its row reports progress, the rest wait.
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const busy = busyKey !== null;
  const guard = useRef(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const { locked, requireGrownUp, gate } = useGrownUpCheck();

  async function run(key: string, action: (note: (text: string) => void) => Promise<void>, at = key) {
    if (guard.current) return;
    guard.current = true;
    setBusyKey(key);
    onBusyChange(true);
    setFeedback(null);

    try {
      await action((text) => setFeedback({ at, note: text }));
    } catch (e) {
      setFeedback({ at, error: e instanceof Error ? e.message : 'The change could not be saved.' });
    } finally {
      guard.current = false;
      setBusyKey(null);
      onBusyChange(false);
    }
  }

  const feedbackAt = (at: string) =>
    feedback?.at === at ? (
      <>
        <ErrorNotice text={feedback.error ?? null} />
        {feedback.note && (
          <View accessibilityLiveRegion="polite">
            <Txt variant="caption" muted>
              {feedback.note}
            </Txt>
          </View>
        )}
      </>
    ) : null;

  function choose<Part extends keyof TrainerAppearance>(part: Part, value: TrainerAppearance[Part]) {
    setDraft((current) => ({ ...current, [part]: value }));
  }

  function returnToSettings() {
    setName(trainer.name);
    setNewName('');
    setDraft(trainer.appearance);
    setPage('settings');
  }

  function saveName() {
    run('name', async (note) => {
      await updateTrainer((t) => ({ ...t, name: name.trim() }));
      setPage('settings');
      note('Trainer name saved.');
    });
  }

  function addTrainer() {
    run('add', async (note) => {
      await transact((c) => {
        if (c.trainers.length >= 20) throw new Error('This device already has 20 trainers.');
        const appearance = trainerAppearanceFor(c.trainers.length);

        return {
          ...c,
          trainers: [
            ...c.trainers,
            {
              id: `trainer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              name: newName.trim(),
              color: TRAINER_OUTFIT_COLORS[appearance.outfit],
              appearance,
              entries: [],
              wishlist: [],
            },
          ],
        };
      });
      setNewName('');
      setPage('settings');
      note('New trainer added! Tap their name above to play as them.');
    });
  }

  function saveAppearance() {
    run('look', async (note) => {
      await updateTrainer((t) => {
        if (!canEquipTrainerAccessory(t, draft.accessory ?? 'none'))
          throw new Error('This accessory has not been earned by this trainer yet.');
        // Judged like the Badges tab, so a sidekick shown as unlocked there can always be saved.
        const earned = earnedBadges(t, discoveredIds(t), setProgress(t, catalogSet));

        if (!canChooseSidekick(t, draft.sidekick ?? 'none', earned))
          throw new Error('This sidekick has not been unlocked by this trainer yet.');

        return {
          ...awardSidekicks(awardTrainerAccessories(t), earned),
          appearance: draft,
          color: TRAINER_OUTFIT_COLORS[draft.outfit],
        };
      });
      setPage('settings');
      note('New look saved!');
    });
  }

  if (page === 'about')
    return (
      <Sheet title="About" onClose={onClose} onBack={returnToSettings}>
        <AboutScreen appUpdates={update}>
          <View style={m.aboutDetails}>
            <Txt variant="caption" muted>
              Saved on this device. Live family syncing is planned for a later version. Card text is read on your
              iPhone/iPad; photos are not sent to a server.
            </Txt>
            <Txt variant="caption" muted>
              Card data and images: TCGdex. Pokémon names, Pokédex data and artwork: PokéAPI. An unofficial family fan
              project. Pokémon belongs to its respective owners.
            </Txt>
          </View>
        </AboutScreen>
      </Sheet>
    );

  if (page === 'accessories')
    return (
      <Sheet title="Accessories" onClose={onClose} onBack={() => setPage('appearance')} busy={busy} dismissible={false}>
        <TrainerAccessoryPicker
          trainer={trainer}
          appearance={draft}
          busy={busy}
          onChoose={(selection) => {
            choose('accessory', selection);
            setPage('appearance');
          }}
        />
      </Sheet>
    );

  if (page === 'sidekicks')
    return (
      <Sheet title="Sidekick" onClose={onClose} onBack={() => setPage('appearance')} busy={busy} dismissible={false}>
        <TrainerSidekickPicker
          trainer={trainer}
          appearance={draft}
          busy={busy}
          onChoose={(selection) => {
            choose('sidekick', selection);
            setPage('appearance');
          }}
        />
      </Sheet>
    );

  if (page === 'rename' || page === 'add') {
    const adding = page === 'add',
      key = adding ? 'add' : 'name';

    const value = adding ? newName : name;

    const disabled =
      busy || !value.trim() || (adding ? collection.trainers.length >= 20 : value.trim() === trainer.name);

    return (
      <Sheet
        title={adding ? 'Add a trainer' : 'Trainer name'}
        onClose={onClose}
        onBack={returnToSettings}
        busy={busy}
        dismissible={false}
      >
        <ScrollView
          style={m.scrolling}
          contentContainerStyle={m.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          <Txt variant="label">{adding ? 'Name' : 'Trainer name'}</Txt>
          <TextInput
            accessibilityLabel={adding ? 'New trainer name' : 'Trainer name'}
            placeholder={adding ? 'New trainer’s name' : undefined}
            placeholderTextColor={C.muted}
            value={value}
            onChangeText={adding ? setNewName : setName}
            autoFocus
            maxLength={32}
            maxFontSizeMultiplier={1.4}
            style={m.input}
            editable={!busy}
            returnKeyType="done"
            onSubmitEditing={() => !disabled && (adding ? addTrainer() : saveName())}
          />
          <Txt variant="caption" muted>
            {adding ? 'Each trainer gets their own Pokédex and binder.' : 'This name appears on your trainer profile.'}
          </Txt>
          {feedbackAt(key)}
        </ScrollView>
        <View style={m.footer}>
          <Button
            title={adding ? 'Add trainer' : 'Save name'}
            icon={adding ? 'plus' : undefined}
            disabled={disabled}
            busy={busyKey === key}
            onPress={adding ? addTrainer : saveName}
          />
        </View>
      </Sheet>
    );
  }

  if (page === 'appearance')
    return (
      <Sheet title="Trainer appearance" onClose={onClose} onBack={returnToSettings} busy={busy} dismissible={false}>
        <View style={m.builderPreview}>
          <TrainerAvatar appearance={draft} size={88} />
          <View style={{ flex: 1, minWidth: 0, gap: S.xs }}>
            <Txt variant="subtitle">{trainer.name}</Txt>
            <Txt variant="caption" muted>
              Your look updates as you choose.
            </Txt>
          </View>
        </View>
        <ScrollView style={m.scrolling} contentContainerStyle={m.builderContent}>
          <TrainerChoiceRow
            title="Skin tone"
            options={TRAINER_SKIN_TONES}
            value={draft.skinTone}
            labels={TRAINER_APPEARANCE_LABELS.skinTone}
            busy={busy}
            onChange={(value) => choose('skinTone', value)}
          />
          <TrainerChoiceRow
            title="Hair style"
            options={TRAINER_HAIR_STYLES}
            value={draft.hairStyle}
            labels={TRAINER_APPEARANCE_LABELS.hairStyle}
            busy={busy}
            onChange={(value) => choose('hairStyle', value)}
          />
          <TrainerChoiceRow
            title="Hair color"
            options={TRAINER_HAIR_COLORS}
            value={draft.hairColor}
            labels={TRAINER_APPEARANCE_LABELS.hairColor}
            busy={busy}
            onChange={(value) => choose('hairColor', value)}
          />
          <TrainerChoiceRow
            title="Jacket"
            options={TRAINER_OUTFITS}
            value={draft.outfit}
            labels={TRAINER_APPEARANCE_LABELS.outfit}
            busy={busy}
            onChange={(value) => choose('outfit', value)}
          />
          <TrainerChoiceRow
            title="Hat"
            options={TRAINER_HEADWEAR}
            value={draft.headwear}
            labels={TRAINER_APPEARANCE_LABELS.headwear}
            busy={busy}
            onChange={(value) => choose('headwear', value)}
          />
          <ActionRow
            title="Accessory"
            value={TRAINER_ACCESSORIES.find((accessory) => accessory.id === draft.accessory)?.name ?? 'None'}
            disabled={busy}
            onPress={() => setPage('accessories')}
          />
          <ActionRow
            title="Sidekick"
            value={findSidekick(draft.sidekick)?.name ?? 'None'}
            disabled={busy}
            onPress={() => setPage('sidekicks')}
          />
          {feedbackAt('look')}
        </ScrollView>
        <View style={m.footer}>
          <Button title="Save my look" busy={busyKey === 'look'} onPress={saveAppearance} />
        </View>
      </Sheet>
    );

  return (
    <Sheet title="Settings" onClose={onClose} busy={busy} overlay={gate}>
      <ScrollView
        style={m.scrolling}
        contentContainerStyle={[m.content, { gap: S.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={m.section}>
          <Txt accessibilityRole="header" variant="label" muted>
            Your trainers
          </Txt>
          {collection.trainers.map((t) => {
            const active = t.id === trainer.id,
              key = `switch-${t.id}`;

            return (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={active ? `${t.name}, playing now` : `Switch to ${t.name}`}
                accessibilityState={{ selected: active, disabled: busy }}
                key={t.id}
                disabled={busy}
                onPress={() => {
                  tick();
                  run(
                    key,
                    async () => {
                      await transact((c) => ({ ...c, activeId: t.id }));
                      setName(t.name);
                      setDraft(t.appearance);
                    },
                    'switch',
                  );
                }}
                style={(state) => [m.profile, busy && busyKey !== key && { opacity: 0.6 }, pressFx(state)]}
              >
                <TrainerAvatar appearance={t.appearance} size={36} />
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Txt style={{ fontWeight: active ? '600' : '400' }}>{t.name}</Txt>
                  <Txt variant="caption" muted>
                    {totalCards(t)} cards · {discoveredIds(t).size} Pokémon
                  </Txt>
                </View>
                {busyKey === key ? <ActivityIndicator color={C.ink} /> : active && <Icon name="check" size={20} />}
              </Pressable>
            );
          })}
          {feedbackAt('switch')}
          <ActionRow
            title="Add trainer"
            icon="plus"
            disabled={busy || collection.trainers.length >= 20}
            detail={collection.trainers.length >= 20 ? 'This device already has 20 trainers.' : undefined}
            onPress={() => {
              setNewName('');
              setFeedback(null);
              setPage('add');
            }}
          />
          {feedbackAt('add')}
        </View>
        <View style={m.section}>
          <Txt accessibilityRole="header" variant="label" muted>
            Your profile
          </Txt>
          <ActionRow
            title="Name"
            value={trainer.name}
            disabled={busy}
            onPress={() => {
              setName(trainer.name);
              setFeedback(null);
              setPage('rename');
            }}
          />
          {feedbackAt('name')}
          <ActionRow
            title="Appearance"
            icon="user"
            disabled={busy}
            onPress={() => {
              setFeedback(null);
              setDraft(trainer.appearance);
              setPage('appearance');
            }}
          />
          {feedbackAt('look')}
        </View>
        <View style={m.section}>
          <Txt accessibilityRole="header" variant="label" muted>
            Family
          </Txt>
          <View style={m.lockRow}>
            <Icon name="lock" size={20} />
            <Txt style={{ flex: 1, minWidth: 0 }}>Grown-up lock</Txt>
            {busyKey === 'lock' ? (
              <ActivityIndicator color={C.ink} />
            ) : (
              <Switch
                accessibilityLabel="Grown-up lock"
                accessibilityHint={locked ? 'Turning it off asks a grown-up question first' : undefined}
                value={locked}
                disabled={busy}
                trackColor={{ true: C.red, false: '#C7D2BB' }}
                onValueChange={(on) =>
                  on
                    ? run('lock', async (note) => {
                        await transact((c) => ({ ...c, grownUpLock: true }));
                        note('Grown-up lock is on.');
                      })
                    : requireGrownUp(
                        () =>
                          run('lock', async (note) => {
                            await transact((c) => ({ ...c, grownUpLock: false }));
                            note('Grown-up lock is off.');
                          }),
                        'turn off the grown-up lock',
                      )
                }
              />
            )}
          </View>
          <Txt variant="caption" muted>
            {locked
              ? 'A grown-up solves a math question before cards are deleted or backups are used.'
              : 'Anyone can delete cards or use backups.'}
          </Txt>
          {feedbackAt('lock')}
          <ActionRow
            title="Save backup"
            icon="download"
            chevron={false}
            disabled={busy}
            detail={busyKey === 'export' ? 'Saving…' : undefined}
            onPress={() =>
              requireGrownUp(
                () => run('export', () => exportFile(portableBackup(collection)), 'backup'),
                'save a backup',
              )
            }
          />
          <ActionRow
            title="Load backup"
            icon="upload"
            chevron={false}
            disabled={busy}
            detail={busyKey === 'import' ? 'Loading…' : undefined}
            onPress={() =>
              requireGrownUp(
                () =>
                  run(
                    'import',
                    async (note) => {
                      const raw = await importFile();

                      if (!raw) return;
                      const incoming = parseCollection(raw);
                      await transact((c) => mergeBackup(c, incoming));
                      note(
                        `Added ${incoming.trainers.length} trainer${incoming.trainers.length === 1 ? '' : 's'} from the backup.`,
                      );
                    },
                    'backup',
                  ),
                'load a backup',
              )
            }
          />
          <Txt variant="caption" muted>
            Save everyone’s cards. Loading a backup adds trainers and erases nothing.
          </Txt>
          {feedbackAt('backup')}
        </View>
        <View style={m.section}>
          <ActionRow
            title="About this app"
            value={update?.ready ? 'Update ready' : undefined}
            disabled={busy}
            onPress={() => setPage('about')}
          />
          <Txt variant="caption" muted>
            Cards are saved on this device.
          </Txt>
        </View>
      </ScrollView>
    </Sheet>
  );
}

const m = StyleSheet.create({
  aboutDetails: { gap: S.md },
  scrolling: { flexShrink: 1 },
  content: { padding: S.xl, paddingBottom: S.xxl, gap: S.lg },
  input: {
    minHeight: 48,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#B8C6AC',
    borderRadius: 12,
    backgroundColor: '#FCFDF9',
    color: C.ink,
    fontSize: 15,
  },
  footer: { padding: S.lg, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.line, backgroundColor: C.paper },
  builderPreview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.lg,
    padding: S.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  builderContent: { paddingHorizontal: S.xl, paddingBottom: S.lg, gap: S.sm },
  section: { gap: S.sm },
  profile: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: S.md,
    paddingVertical: S.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  lockRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: S.sm, paddingVertical: S.md },
});
