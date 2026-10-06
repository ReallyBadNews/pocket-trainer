import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { TabList, TabTrigger, Tabs } from 'expo-router/ui';
import { C } from '@/components/pokedex-ui';
import { WebMetadata } from '@/components/web-metadata';
import { CollectionProvider } from '@/lib/collection-context';
import { TABS } from '@/lib/pokedex-nav';
import { PokedexShell } from '@/screens/pocket-trainer';

// Deep links into a tab's pages still land on top of the Pokédex tab.
export const unstable_settings = { anchor: '(dex)' };

const theme = { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: C.screen, card: C.screen } };

/** The tab triggers only register routes; the Pokédex shell draws the real tab bar with `useTabTrigger`. */
export default function RootLayout() {
  return (
    <CollectionProvider>
      <ThemeProvider value={theme}>
        <WebMetadata />
        <StatusBar style="light" />
        <Tabs style={{ flex: 1 }}>
          <TabList style={{ display: 'none' }}>
            {TABS.map(tab => <TabTrigger key={tab.name} name={tab.name} href={tab.href} />)}
          </TabList>
          <PokedexShell />
        </Tabs>
      </ThemeProvider>
    </CollectionProvider>
  );
}
