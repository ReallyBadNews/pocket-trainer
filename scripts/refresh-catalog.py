"""Refresh compact, public metadata snapshots. Run with Python 3; no API keys."""
import argparse
import concurrent.futures
import csv
import io
import json
import pathlib
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
DEST = ROOT / 'src' / 'data'
DEST.mkdir(parents=True, exist_ok=True)
LANGUAGES = ('en', 'ja', 'ko', 'zh-cn', 'zh-tw')
# Newer upstream catalogs are sparse; larger ones should never shrink this far.
MINIMUM_CARDS = {'ko': 200, 'zh-cn': 40}
parser = argparse.ArgumentParser()
parser.add_argument('--languages', nargs='+', choices=LANGUAGES, default=LANGUAGES)
args = parser.parse_args()

def fetch(url):
    with urllib.request.urlopen(url, timeout=90) as response:
        return response.read().decode('utf-8')

names_url = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/master/data/v2/csv/pokemon_species_names.csv'
species = {}
for row in csv.DictReader(io.StringIO(fetch(names_url))):
    language = {'9': 'en', '1': 'ja', '3': 'ko', '12': 'zh-cn', '4': 'zh-tw'}.get(row['local_language_id'])
    if language:
        number = int(row['pokemon_species_id'])
        species.setdefault(number, {'id': number})[language] = row['name']
        if language == 'en':
            species[number]['genus'] = row['genus']
(DEST / 'species.json').write_text(json.dumps(list(species.values()), ensure_ascii=False, separators=(',', ':')))

meta_path = DEST / 'catalog-meta.json'
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
counts = meta.get('counts', {})
updated_by_language = meta.get('updatedByLanguage', {lang: meta.get('updatedAt') for lang in counts})
for language in args.languages:
    sets = json.loads(fetch(f'https://api.tcgdex.net/v2/{language}/sets'))
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
    # The zh-cn endpoint currently leaks Traditional Chinese SV sets.
    # Mainland printings use their own C-prefixed product codes.
    if language == 'zh-cn':
        cards = [card for card in cards if card['id'].upper().startswith('C')]
        sets = [entry for entry in sets if entry['id'].upper().startswith('C')]
    # English cards print an abbreviation (MEG, 30C) instead of the TCGdex set id.
    # Other languages print codes that already match their ids (SV5K, CBB4C).
    if language == 'en':
        def abbreviation(entry):
            detail = json.loads(fetch(f"https://api.tcgdex.net/v2/en/sets/{urllib.parse.quote(entry['id'])}"))
            return detail.get('abbreviation', {}).get('official')
        with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
            for entry, code in zip(sets, pool.map(abbreviation, sets)):
                if code:
                    entry['abbreviation'] = code
    (DEST / f'sets-{language}.json').write_text(json.dumps(sets, ensure_ascii=False, separators=(',', ':')))
    compact = [{key: card[key] for key in ('id', 'localId', 'name', 'image') if key in card} for card in cards]
    if len(compact) < MINIMUM_CARDS.get(language, 1000):
        raise RuntimeError(f'Unexpectedly small {language} catalog: {len(compact)}')
    (DEST / f'cards-{language}.json').write_text(json.dumps(compact, ensure_ascii=False, separators=(',', ':')))
    supplements = json.loads((DEST / 'card-supplements.json').read_text()).get(language, {})
    counts[language] = len({card['id'] for card in compact} | supplements.keys())
    updated_by_language[language] = datetime.now(timezone.utc).isoformat()

(DEST / 'catalog-meta.json').write_text(json.dumps({'updatedAt': datetime.now(timezone.utc).isoformat(), 'counts': counts, 'updatedByLanguage': updated_by_language, 'sources': ['https://tcgdex.dev', names_url]}, indent=2))
print(json.dumps(counts))

# Refresh classifications against the newly written physical-card indexes.
import runpy
runpy.run_path(str(ROOT / 'scripts' / 'refresh-card-types.py'))['refresh'](args.languages)
