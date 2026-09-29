"""Refresh bundled species types, evolution links and English Pokédex entries from PokéAPI's public CSV data.

Python 3 standard library only; no API key. Output is deterministic so reruns only change when PokéAPI does.
"""
import csv
import io
import json
import pathlib
import re
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'src' / 'data' / 'species-details.json'
BASE = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/'
ENGLISH = '9'
# Type ids 1-18 are the battle types; stellar, unknown and shadow never appear on a default form.
TYPES = ('normal', 'fighting', 'flying', 'poison', 'ground', 'rock', 'bug', 'ghost', 'steel',
         'fire', 'water', 'grass', 'electric', 'psychic', 'ice', 'dragon', 'dark', 'fairy')

def rows(name):
    with urllib.request.urlopen(f'{BASE}{name}.csv', timeout=120) as response:
        return list(csv.DictReader(io.StringIO(response.read().decode('utf-8'))))

def clean(text):
    # Game text wraps with newlines and page breaks (\f); a soft hyphen or real hyphen at a wrap joins one word.
    text = re.sub(r'­\s*', '', text)
    text = re.sub(r'-[ \t]*[\n\f]\s*', '-', text)
    text = text.replace('POKéMON', 'Pokémon')
    return re.sub(r'\s+', ' ', text).strip()

species = sorted(rows('pokemon_species'), key=lambda r: int(r['id']))
ids = [int(r['id']) for r in species]
if ids != list(range(1, len(ids) + 1)) or len(ids) < 1025:
    raise RuntimeError(f'Unexpected species ids: {len(ids)} rows ending at {ids[-1]}')
type_names = {r['id']: r['identifier'] for r in rows('types')}
if [type_names[str(i)] for i in range(1, 19)] != list(TYPES):
    raise RuntimeError('PokéAPI type ids changed')

# Each species' default form carries its types (the pokemon id equals the species id through #1025).
default_form = {r['species_id']: r['id'] for r in rows('pokemon') if r['is_default'] == '1'}
form_types = {}
for r in sorted(rows('pokemon_types'), key=lambda r: int(r['slot'])):
    form_types.setdefault(r['pokemon_id'], []).append(int(r['type_id']) - 1)

# Most recent main-series game wins, ordered by release (version group order), then version id within a pair
# (Scarlet, Violet). The Legends games read like a researcher's journal, which is harder for young readers and
# odd when read aloud, so they are only used for species with no other English entry.
JOURNALS = {'legends-arceus', 'legends-za'}
group_order = {r['id']: int(r['order']) for r in rows('version_groups')}
version_rank = {r['id']: (r['identifier'] not in JOURNALS, group_order[r['version_group_id']], int(r['id'])) for r in rows('versions')}
entries = {}
for r in rows('pokemon_species_flavor_text'):
    if r['language_id'] != ENGLISH:
        continue
    rank = version_rank[r['version_id']]
    if r['species_id'] not in entries or rank > entries[r['species_id']][0]:
        entries[r['species_id']] = (rank, r['flavor_text'])

types, parents, texts = [], [], []
for r in species:
    kinds = form_types.get(default_form.get(r['id'], ''), [])
    if not kinds or any(k >= len(TYPES) for k in kinds):
        raise RuntimeError(f"Species {r['id']} has no battle type")
    types.append(kinds)
    # Babies (Pichu, Tyrogue) are roots because their evolved forms point back at them.
    parents.append(int(r['evolves_from_species_id'] or 0))
    texts.append(clean(entries.get(r['id'], (None, ''))[1]))
if not all(0 <= p <= len(ids) for p in parents):
    raise RuntimeError('Evolution parent outside the species list')

# Parallel arrays indexed by species id - 1 keep the bundle compact.
DEST.write_text(json.dumps({'source': BASE, 'types': TYPES, 't': types, 'from': parents, 'text': texts}, ensure_ascii=False, separators=(',', ':')))
print(f'{DEST.relative_to(ROOT)}: {len(ids)} species, {sum(1 for t in texts if t)} entries, {DEST.stat().st_size:,} bytes')
