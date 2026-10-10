import { useState, type ReactNode } from 'react';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { Image } from 'expo-image';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, C, ErrorNotice, R, S, Txt } from '@/components/pokedex-ui';
import type { AppUpdates } from '@/lib/use-app-updates';

/** Shown inside the Settings sheet; the sheet's back arrow returns to Settings. */
export function AboutScreen({ appUpdates, children }: { appUpdates?: AppUpdates; children?: ReactNode }) {
  const [installing, setInstalling] = useState(false);
  const [installError, setInstallError] = useState<string | null>(null);

  const version =
    Application.nativeApplicationVersion ??
    (Platform.OS === 'web' ? Constants.expoConfig?.version : null) ??
    'Unavailable';

  const build = Application.nativeBuildVersion ?? (Platform.OS === 'web' ? 'Browser preview' : 'Unavailable');

  // Which published JavaScript is running, so a parent can tell whether the latest change has arrived.
  const update =
    Platform.OS === 'web'
      ? 'Browser preview'
      : __DEV__
        ? 'Development'
        : !Updates.isEnabled
          ? 'Unavailable'
          : Updates.isEmbeddedLaunch || !Updates.updateId
            ? 'Included with build'
            : `${Updates.createdAt?.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) ?? 'Downloaded'} · ${Updates.updateId.slice(0, 8)}`;

  return (
    <ScrollView contentContainerStyle={s.content}>
      <Image
        source={require('../../assets/crafted/device.png')}
        contentFit="contain"
        style={s.device}
        accessible
        accessibilityLabel="Our handcrafted 3D Pokédex"
      />
      <Txt accessibilityRole="header" variant="title">
        Pocket Pokédex
      </Txt>
      <Txt muted>Your Pokémon cards, collected in one place.</Txt>
      {appUpdates?.ready && (
        <View style={s.update}>
          <Txt variant="subtitle">A new Pokédex update is ready</Txt>
          <Txt muted variant="caption">
            The app restarts to finish updating. Your cards stay saved.
          </Txt>
          <Button
            title="Update now"
            icon="download"
            busy={installing}
            onPress={() => {
              setInstalling(true);
              setInstallError(null);
              appUpdates.install().then(
                () => setInstalling(false),
                () => {
                  setInstalling(false);
                  setInstallError('The update could not be downloaded. Check the internet connection and try again.');
                },
              );
            }}
          />
          <ErrorNotice text={installError} />
        </View>
      )}
      <View style={s.details}>
        <View style={s.row}>
          <Txt muted variant="label">
            Version
          </Txt>
          <Txt selectable variant="readout" style={s.value}>
            {version}
          </Txt>
        </View>
        <View style={s.row}>
          <Txt muted variant="label">
            Build number
          </Txt>
          <Txt selectable variant="readout" style={s.value}>
            {build}
          </Txt>
        </View>
        <View style={s.row}>
          <Txt muted variant="label">
            App update
          </Txt>
          <Txt selectable variant="readout" style={s.value}>
            {update}
          </Txt>
        </View>
      </View>
      <Txt muted variant="caption">
        Version information helps when reporting a problem.
      </Txt>
      {children}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  content: { padding: S.xl, paddingBottom: 26, gap: S.lg },
  device: { alignSelf: 'center', width: 190, height: 154 },
  update: {
    gap: S.sm,
    padding: S.lg,
    borderRadius: R.lg,
    backgroundColor: C.screen,
    borderWidth: 1,
    borderColor: C.line,
  },
  details: { gap: S.sm },
  row: {
    minHeight: 44,
    paddingVertical: S.sm,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: S.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: C.line,
  },
  value: { fontWeight: '600', flexShrink: 1 },
});
