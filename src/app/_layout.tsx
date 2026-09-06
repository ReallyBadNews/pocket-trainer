import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { WebMetadata } from '@/components/web-metadata';
import { CollectionProvider } from '@/lib/collection-context';

export default function RootLayout() {
  return (
    <CollectionProvider>
      <WebMetadata />
      <StatusBar style="light" />
      <Slot />
    </CollectionProvider>
  );
}
