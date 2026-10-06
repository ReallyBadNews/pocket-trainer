import { Asset } from 'expo-asset';
import { Image } from 'expo-image';

export type CardTextureImage = { localUri: string };

/** Expo GL uploads native images from local files; it cannot upload a URL. */
export async function loadCardTexture(uri: string): Promise<CardTextureImage> {
  // Use the same decoded-image cache as CardArt, including saved WebP copies.
  // Expo GL's stb decoder only accepts PNG/JPEG, so serialize a valid PNG.
  const image = await Image.loadAsync(uri);

  const { ImageManipulator, SaveFormat } =
    // SAFETY: this is the module named in the type; it is required here so it loads only when a card is inspected.
    require('expo-image-manipulator') as typeof import('expo-image-manipulator');

  const context = ImageManipulator.manipulate(image);
  let rendered: Awaited<ReturnType<typeof context.renderAsync>> | undefined;

  try {
    rendered = await context.renderAsync();
    const result = await rendered.saveAsync({ format: SaveFormat.PNG });

    return { localUri: result.uri };
  } finally {
    rendered?.release();
    context.release();
    image.release();
  }
}

/** Release builds serve bundled assets from disk via expo-updates: `uri` is empty, only `localUri` is set. */
export async function loadBundledCardTexture(module: number): Promise<CardTextureImage> {
  const asset = await Asset.fromModule(module).downloadAsync();

  return loadCardTexture(asset.localUri ?? asset.uri);
}
