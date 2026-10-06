import { Stack } from 'expo-router';
import { pageStackOptions } from '@/components/page';

export const unstable_settings = { anchor: 'binder' };

/** The Binder tab: its list first, then the pages it opens. */
export default function BinderStack() {
  return <Stack screenOptions={pageStackOptions} />;
}
