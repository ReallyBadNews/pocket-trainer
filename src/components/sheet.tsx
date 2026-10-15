import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C, SheetHeader } from '@/components/pokedex-ui';

/** `overlay` (the grown-up check) covers the sheet and hides it from screen readers while open. `onBack` adds a back arrow for sub-pages; `action` is a round header button for the sheet's own action (Share); `dismissible={false}` stops a stray tap outside from throwing away a game or unsaved work. */
export function Sheet({
  title,
  onClose,
  onBack,
  action,
  children,
  busy = false,
  dismissible = true,
  overlay,
}: {
  title: string;
  onClose: () => void;
  onBack?: () => void;
  action?: ReactNode;
  children: ReactNode;
  busy?: boolean;
  dismissible?: boolean;
  overlay?: ReactNode;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[m.overlay, { paddingTop: Math.max(insets.top, 15), paddingBottom: Math.max(insets.bottom, 15) }]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
        onPress={() => dismissible && !busy && onClose()}
        style={StyleSheet.absoluteFill}
      />
      <View
        accessibilityViewIsModal={!overlay}
        accessibilityElementsHidden={!!overlay}
        importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'}
        style={m.sheet}
      >
        <SheetHeader title={title} onClose={onClose} onBack={onBack} busy={busy} action={action} />
        {children}
      </View>
      {overlay}
    </KeyboardAvoidingView>
  );
}

const m = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#14201CC9',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  sheet: {
    width: '100%',
    maxWidth: 600,
    maxHeight: '100%',
    backgroundColor: C.paper,
    borderRadius: 20,
    overflow: 'hidden',
  },
});
