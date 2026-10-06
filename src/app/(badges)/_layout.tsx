import { Stack } from 'expo-router';
import { pageStackOptions } from '@/components/page';

export const unstable_settings = { anchor: 'badges' };

/** The Badges tab: its list first, then the pages it opens. */
export default function BadgesStack() {
  return <Stack screenOptions={pageStackOptions} />;
}
