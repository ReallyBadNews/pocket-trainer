"""Refresh exact card classifications from public TCGdex field indexes. No API key."""
import concurrent.futures
import json
import pathlib
import urllib.parse
import urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / 'src' / 'data'
# Compact values: category, Trainer subtypes, and a separate TAG TEAM bit.
FIELDS = [('categories', 'Pokemon', 1), ('categories', 'Trainer', 2), ('categories', 'Energy', 3),
          ('trainer-types', 'Item', 4), ('trainer-types', 'Stadium', 5),
          ('trainer-types', 'Supporter', 6), ('trainer-types', 'Tool', 7), ('suffixes', 'TAG TEAM-GX', 16)]

def fetch(task):
    language, field, value, code = task
    url = f'https://api.tcgdex.net/v2/{language}/{field}/{urllib.parse.quote(value)}'
    with urllib.request.urlopen(url, timeout=60) as response:
        result = json.load(response)
    if not isinstance(result.get('cards'), list) or not result['cards']:
        raise RuntimeError(f'Invalid classification index: {url}')
    return language, code, result['cards']

def refresh():
    tasks = [(lang, *field) for lang in ('en', 'ja') for field in FIELDS]
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        results = list(pool.map(fetch, tasks))
    output = {}
    for lang in ('en', 'ja'):
        cards = json.loads((DATA / f'cards-{lang}.json').read_text())
        ids = {c['id'] for c in cards}
        types = {}
        for language, code, entries in results:
            if language != lang or code == 16:
                continue
            for card in entries:
                if card['id'] in ids:
                    types[card['id']] = code
        for language, code, entries in results:
            if language == lang and code == 16:
                for card in entries:
                    if card['id'] in types:
                        types[card['id']] |= 16
        # TAG TEAM Supporters have no suffix in TCGdex. Exact printed names,
        # verified against the official Cosmic Eclipse TAG TEAM Supporter list.
        supporters = {
            'Red & Blue', 'Mallow & Lana', 'Guzma & Hala', 'Cynthia & Caitlin',
            'Bellelba & Brycen-Man', 'Misty & Lorelei',
            'レッド&グリーン', 'マオ&スイレン', 'グズマ&ハラ', 'シロナ&カトレア',
            'ジュジュベ&ハチクマン', 'カスミ&カンナ',
        }
        for card in cards:
            if types.get(card['id']) == 6 and card['name'].replace('＆', '&') in supporters:
                types[card['id']] |= 16
        missing = ids - types.keys()
        if missing:
            raise RuntimeError(f'{lang}: {len(missing)} cards have no category; refusing an incomplete index')
        output[lang] = dict(sorted(types.items()))
        print(lang, 'classified:', len(types), 'TAG TEAM:', sum(bool(v & 16) for v in types.values()))
    (DATA / 'card-types.json').write_text(json.dumps(output, separators=(',', ':')) + '\n')

if __name__ == '__main__':
    refresh()
