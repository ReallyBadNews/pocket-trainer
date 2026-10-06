import { Stack } from 'expo-router';
import { pageStackOptions } from '@/components/page';

export const unstable_settings = { anchor: 'index' };

/** The Pokédex tab: its list first, then the pages it opens. */
export default function DexStack() {
  return <Stack screenOptions={pageStackOptions} />;
}
