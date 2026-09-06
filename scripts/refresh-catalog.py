"""Refresh compact, public metadata snapshots. Run with Python 3; no API keys."""
import csv
import io
import json
import pathlib
import urllib.request
import urllib.error
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'src' / 'data'
DEST.mkdir(parents=True, exist_ok=True)

def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read().decode('utf-8')

names_url = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv'
species = {}
for row in csv.DictReader(io.StringIO(fetch(names_url))):
    language = {'9': 'en', '1': 'ja'}.get(row['local_language_id'])
    if language:
        number = int(row['pokemon_species_id'])
        species.setdefault(number, {'id': number})[language] = row['name']
        if language == 'en':
            species[number]['genus'] = row['genus']
(DEST / 'species.json').write_text(json.dumps(list(species.values()), ensure_ascii=False, separators=(',', ':')))

counts = {}
for language in ('en', 'ja'):
    sets = json.loads(fetch(f'https://api.tcgdex.net/v2/{language}/sets'))
    (DEST / f'sets-{language}.json').write_text(json.dumps(sets, ensure_ascii=False, separators=(',', ':')))
    cards = json.loads(fetch(f'https://api.tcgdex.net/v2/{language}/cards'))
    # TCG Pocket is digital; this app catalogs physical cards only.
    try:
        pocket = json.loads(fetch(f'https://api.tcgdex.net/v2/{language}/series/tcgp'))
    except urllib.error.HTTPError as error:
        if error.code != 404:
            raise
        pocket = {'sets': []}
    pocket_sets = {entry['id'].lower() for entry in pocket['sets']}
    cards = [card for card in cards if '/tcgp/' not in card.get('image', '').lower()
             and card['id'].rsplit('-', 1)[0].lower() not in pocket_sets]
    compact = [{key: card[key] for key in ('id', 'localId', 'name', 'image') if key in card} for card in cards]
    if len(compact) < 1000:
        raise RuntimeError(f'Unexpectedly small {language} catalog: {len(compact)}')
    (DEST / f'cards-{language}.json').write_text(json.dumps(compact, ensure_ascii=False, separators=(',', ':')))
    counts[language] = len(compact)

(DEST / 'catalog-meta.json').write_text(json.dumps({'updatedAt': datetime.now(timezone.utc).isoformat(), 'counts': counts, 'sources': ['https://tcgdex.dev', names_url]}, indent=2))
print(json.dumps(counts))

# Refresh classifications against the newly written physical-card indexes.
import runpy
runpy.run_path(str(ROOT / 'scripts' / 'refresh-card-types.py'), run_name='__main__')
