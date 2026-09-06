import type { Card } from './model';
export const keepCardArt = async (card: Card) => card;
export async function exportFile(text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'pocket-trainer-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function importFile(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input'); input.type = 'file'; input.accept = '.json,application/json';
    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (file && file.size > 20_000_000) throw new Error('Choose a backup smaller than 20 MB.');
        resolve(file ? await file.text() : null);
      } catch (error) { reject(error); }
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}
