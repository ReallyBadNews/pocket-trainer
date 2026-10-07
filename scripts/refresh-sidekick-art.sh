#!/usr/bin/env bash
# Rebuilds the bundled sidekick portraits from PokéAPI's official artwork, the
# same art the Pokédex shows online. Bundling keeps the trainer's sidekick on
# screen offline. Requires curl, ImageMagick (magick) and cwebp.
#
# Usage: scripts/refresh-sidekick-art.sh
# Keep the list in step with SIDEKICKS in src/lib/sidekicks.ts.
set -euo pipefail

out="$(cd "$(dirname "$0")/.." && pwd)/assets/images/sidekicks"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
mkdir -p "$out"

while read -r id dex; do
  curl -fsSL "https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${dex}.png" -o "$tmp/$id.png"
  # Trim the transparent margin so every Pokémon fills its bubble, then centre it on a square canvas.
  magick "$tmp/$id.png" -trim +repage -resize 176x176 -background none -gravity center -extent 192x192 "$tmp/$id-square.png"
  cwebp -quiet -q 82 -alpha_q 90 -m 6 "$tmp/$id-square.png" -o "$out/sidekick-$id.webp"
done <<'EOF'
pikachu 25
bulbasaur 1
charmander 4
squirtle 7
pichu 172
growlithe 58
lapras 131
lucario 448
snorlax 143
mewtwo 150
dragonite 149
gengar 94
zapdos 145
aerodactyl 142
eevee 133
mew 151
togepi 175
charizard 6
feraligatr 160
sceptile 254
infernape 392
samurott 503
greninja 658
decidueye 724
cinderace 815
meowscarada 908
rayquaza 384
EOF

du -ch "$out"/*.webp | tail -1
