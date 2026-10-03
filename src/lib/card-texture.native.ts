import { Asset } from 'expo-asset';
import { Image } from 'expo-image';

export type CardTextureImage = { localUri: string };

/** Expo GL uploads native images from local files; it cannot upload a URL. */
export async function loadCardTexture(source: string | number): Promise<CardTextureImage> {
  // Use the same decoded-image cache as CardArt, including saved WebP copies.
  // Expo GL's stb decoder only accepts PNG/JPEG, so serialize a valid PNG.
  const uri = typeof source === 'number' ? Asset.fromModule(source).uri : source;
  const image = await Image.loadAsync(uri);
  const { ImageManipulator, SaveFormat } = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
  const context = ImageManipulator.manipulate(image);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;
  try {
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.PNG });
    return { localUri: result.uri };
  } finally { rendered?.release(); context.release(); image.release(); }
}
