import { speciesById } from './catalog';
import { pokedexEntry } from './species-details';

// Pokémon Showdown hosts MP3 cries (PokéAPI's are Ogg Vorbis, which iOS cannot play) and animated sprites.
const SHOWDOWN = 'https://play.pokemonshowdown.com';

/** Showdown file names: lowercase ASCII letters and digits only (Mr. Mime → mrmime, Nidoran♀ → nidoranf). */
export function showdownName(name: string) {
  return name.replace(/♀/g, 'f').replace(/♂/g, 'm').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
const nameFor = (id: number) => { const en = speciesById.get(id)?.en; return en ? showdownName(en) : undefined; };
export const cryUrl = (id: number) => { const name = nameFor(id); return name ? `${SHOWDOWN}/audio/cries/${name}.mp3` : undefined; };
export const animatedSprite = (id: number) => { const name = nameFor(id); return name ? `${SHOWDOWN}/sprites/ani/${name}.gif` : undefined; };

/** What the Pokédex says, like the anime: "Bulbasaur, the Seed Pokémon. While it is young…" */
export function pokedexLine(id: number) {
  const pokemon = speciesById.get(id);
  if (!pokemon) return '';
  const intro = pokemon.genus ? `${pokemon.en}, the ${pokemon.genus}.` : `${pokemon.en}.`;
  const entry = pokedexEntry(id);
  return entry ? `${intro} ${entry}` : intro;
}
