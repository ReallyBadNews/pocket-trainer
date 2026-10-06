import * as Haptics from 'expo-haptics';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCollection } from '@/lib/collection-context';
import { answerChallenge, createChallenge, pressPadKey, type PadKey } from '@/lib/grown-up';
import { Button, C, Icon, SheetHeader, Txt, mono, pressFx, tick } from './pokedex-ui';

const DIGITS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * `requireGrownUp(action, reason)` runs the action right away while the lock is off; otherwise it asks first.
 * Render `gate` as the open Sheet's `overlay` so the question covers the sheet it protects.
 */
export function useGrownUpCheck() {
  const { collection } = useCollection();
  const [pending, setPending] = useState<{ action: () => void; reason: string } | null>(null);
  const locked = collection.grownUpLock;

  function requireGrownUp(action: () => void, reason: string) {
    if (locked) setPending({ action, reason });
    else action();
  }

  // The action runs inside the answer tap, so web file pickers still count it as a user gesture.
  const gate = pending && (
    <GrownUpGate
      reason={pending.reason}
      onCancel={() => setPending(null)}
      onPass={() => {
        setPending(null);
        pending.action();
      }}
    />
  );

  return { locked, requireGrownUp, gate };
}

export function GrownUpGate({
  reason,
  onPass,
  onCancel,
}: {
  reason: string;
  onPass: () => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [challenge, setChallenge] = useState(() => createChallenge());
  const [value, setValue] = useState('');
  const [missed, setMissed] = useState(false);
  const press = (key: PadKey) => setValue((current) => pressPadKey(current, key));

  function check() {
    if (!value) return;
    const result = answerChallenge(challenge, value);

    if (result.passed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onPass();

      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
    setChallenge(result.next);
    setValue('');
    setMissed(true);
  }

  return (
    <View
      accessibilityViewIsModal
      style={[g.overlay, { paddingTop: Math.max(insets.top, 15), paddingBottom: Math.max(insets.bottom, 15) }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Cancel grown-up check"
        onPress={onCancel}
        style={StyleSheet.absoluteFill}
      />
      <View style={g.panel}>
        <SheetHeader title="Grown-ups only" icon="lock" closeLabel="Not now" onClose={onCancel} />
        <ScrollView contentContainerStyle={g.content} bounces={false}>
          <Txt style={{ textAlign: 'center' }}>To {reason}, ask a grown-up to answer:</Txt>
          <View accessible accessibilityLabel={challenge.spoken} style={g.question}>
            <Txt style={g.questionText}>{challenge.prompt} = ?</Txt>
          </View>
          <View
            accessible
            accessibilityLabel={value ? `Answer typed: ${value}` : 'No answer typed yet'}
            style={g.answer}
          >
            <Txt style={[g.answerText, !value && { color: C.muted }]}>{value || '…'}</Txt>
          </View>
          {missed && (
            <Txt accessibilityRole="alert" style={g.missed}>
              Not quite. Here is a new question.
            </Txt>
          )}
          <View style={g.pad}>
            {DIGITS.map((key) => (
              <PadButton key={key} label={key} onPress={() => press(key)}>
                <Txt style={g.keyText}>{key}</Txt>
              </PadButton>
            ))}
            <PadButton label="Delete last number" disabled={!value} onPress={() => press('back')}>
              <Txt variant="control" style={{ textAlign: 'center' }}>
                Delete
              </Txt>
            </PadButton>
            <PadButton label="0" onPress={() => press('0')}>
              <Txt style={g.keyText}>0</Txt>
            </PadButton>
            <PadButton label="Check answer" disabled={!value} primary onPress={check}>
              <Icon name="check" size={28} color="white" />
            </PadButton>
          </View>
          <Button title="Not now" secondary onPress={onCancel} />
        </ScrollView>
      </View>
    </View>
  );
}

function PadButton({
  label,
  onPress,
  children,
  disabled = false,
  primary = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={() => {
        tick();
        onPress();
      }}
      style={(state) => [
        g.key,
        primary && g.primaryKey,
        disabled && { opacity: 0.45 },
        pressFx(state),
        state.pressed && { transform: [{ translateY: 1 }] },
      ]}
    >
      {children}
    </Pressable>
  );
}

const g = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#14201CB3',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  panel: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '100%',
    backgroundColor: C.screen,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: C.ink,
  },
  content: { padding: 16, gap: 12 },
  question: { alignItems: 'center', paddingVertical: 12, borderRadius: 14, backgroundColor: '#DDE6D1' },
  questionText: { fontFamily: mono, fontSize: 36, lineHeight: 46, fontWeight: '800' },
  answer: {
    minHeight: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#B8C6AC',
    backgroundColor: C.paper,
  },
  answerText: { fontFamily: mono, fontSize: 30, lineHeight: 38, fontWeight: '700', letterSpacing: 4 },
  missed: { textAlign: 'center', color: C.redDark, fontWeight: '800' },
  pad: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  key: {
    flexGrow: 1,
    flexBasis: '30%',
    minHeight: 56,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#F8FAF3',
    borderWidth: 1,
    borderColor: '#B8C6AC',
    borderBottomWidth: 3,
  },
  primaryKey: { backgroundColor: C.red, borderColor: C.redDark },
  keyText: { fontFamily: mono, fontSize: 26, lineHeight: 32, fontWeight: '800' },
});
