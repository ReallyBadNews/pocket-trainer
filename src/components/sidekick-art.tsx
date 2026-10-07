import { Image } from 'expo-image';
import type { StyleProp, ImageStyle } from 'react-native';
import type { SidekickId } from '@/lib/sidekicks';

// Metro requires literal asset paths. scripts/refresh-sidekick-art.sh trims and
// squares PokéAPI's official artwork so each Pokémon fills the same frame offline.
const SIDEKICK_IMAGES = {
  pikachu: require('../../assets/images/sidekicks/sidekick-pikachu.webp'),
  bulbasaur: require('../../assets/images/sidekicks/sidekick-bulbasaur.webp'),
  charmander: require('../../assets/images/sidekicks/sidekick-charmander.webp'),
  squirtle: require('../../assets/images/sidekicks/sidekick-squirtle.webp'),
  pichu: require('../../assets/images/sidekicks/sidekick-pichu.webp'),
  growlithe: require('../../assets/images/sidekicks/sidekick-growlithe.webp'),
  lapras: require('../../assets/images/sidekicks/sidekick-lapras.webp'),
  lucario: require('../../assets/images/sidekicks/sidekick-lucario.webp'),
  snorlax: require('../../assets/images/sidekicks/sidekick-snorlax.webp'),
  mewtwo: require('../../assets/images/sidekicks/sidekick-mewtwo.webp'),
  dragonite: require('../../assets/images/sidekicks/sidekick-dragonite.webp'),
  gengar: require('../../assets/images/sidekicks/sidekick-gengar.webp'),
  zapdos: require('../../assets/images/sidekicks/sidekick-zapdos.webp'),
  aerodactyl: require('../../assets/images/sidekicks/sidekick-aerodactyl.webp'),
  eevee: require('../../assets/images/sidekicks/sidekick-eevee.webp'),
  mew: require('../../assets/images/sidekicks/sidekick-mew.webp'),
  togepi: require('../../assets/images/sidekicks/sidekick-togepi.webp'),
  charizard: require('../../assets/images/sidekicks/sidekick-charizard.webp'),
  feraligatr: require('../../assets/images/sidekicks/sidekick-feraligatr.webp'),
  sceptile: require('../../assets/images/sidekicks/sidekick-sceptile.webp'),
  infernape: require('../../assets/images/sidekicks/sidekick-infernape.webp'),
  samurott: require('../../assets/images/sidekicks/sidekick-samurott.webp'),
  greninja: require('../../assets/images/sidekicks/sidekick-greninja.webp'),
  decidueye: require('../../assets/images/sidekicks/sidekick-decidueye.webp'),
  cinderace: require('../../assets/images/sidekicks/sidekick-cinderace.webp'),
  meowscarada: require('../../assets/images/sidekicks/sidekick-meowscarada.webp'),
  rayquaza: require('../../assets/images/sidekicks/sidekick-rayquaza.webp'),
} as const satisfies Record<SidekickId, number>;

/** Decorative: callers name the sidekick in their own label. Locked sidekicks are a “Who’s that Pokémon?” silhouette. */
export function SidekickArt({
  id,
  size,
  locked = false,
  style,
}: {
  id: SidekickId;
  size: number;
  locked?: boolean;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      accessible={false}
      source={SIDEKICK_IMAGES[id]}
      recyclingKey={id}
      tintColor={locked ? '#526B50' : undefined}
      style={[{ width: size, height: size }, locked && { opacity: 0.45 }, style]}
      contentFit="contain"
      cachePolicy="memory-disk"
    />
  );
}
