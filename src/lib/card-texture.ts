import { Asset } from 'expo-asset';

export type CardTextureImage = TexImageSource;

/** Browser images must finish decoding before WebGL uploads them. */
export async function loadCardTexture(source: string | number): Promise<CardTextureImage> {
  const uri = typeof source === 'number' ? Asset.fromModule(source).uri : source;

  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('The card artwork could not be loaded.'));
    image.src = uri;
  });
}
