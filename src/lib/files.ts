import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import type { Card } from './model';
import { cardImage } from './catalog';

export async function keepCardArt(card: Card): Promise<Card> {
  const url = cardImage(card);
  if (!url) return card;
  try {
    const directory = new Directory(Paths.document, 'card-art');
    directory.create({ idempotent: true, intermediates: true });
    const destination = new File(directory, `${card.language}-${card.id.replace(/[^a-z0-9-]/gi, '_')}.webp`);
    if (!destination.exists) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const downloaded = await Promise.race([
          File.downloadFileAsync(url, destination).then(() => true),
          new Promise<false>(resolve => { timer = setTimeout(() => resolve(false), 4000); }),
        ]);
        if (!downloaded) return card;
      } finally { clearTimeout(timer); }
    }
    return { ...card, localImage: destination.uri };
  } catch { return card; }
}
export async function exportFile(text: string) {
  const file = new File(Paths.cache, 'pocket-trainer-backup.json');
  file.write(text);
  if (!await Sharing.isAvailableAsync()) throw new Error('File sharing is unavailable on this device.');
  await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json', dialogTitle: 'Save your trainer backup' });
}
export async function importFile(): Promise<string | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'text/plain'], copyToCacheDirectory: true });
  if (result.canceled) return null;
  if ((result.assets[0].size ?? 0) > 20_000_000) throw new Error('Choose a backup smaller than 20 MB.');
  return new File(result.assets[0].uri).text();
}
