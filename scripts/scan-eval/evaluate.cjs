#!/usr/bin/env node
// Re-ranks saved OCR output with the app's JavaScript ranking and reports scan accuracy.
//
//   node scripts/scan-eval/evaluate.cjs <ocr.jsonl> <manifest.json> [build-dir] [--json out.json]
//        [--artwork distances.jsonl] [--emit-compare requests.jsonl] [--quiet]
//
// build-dir defaults to .test-build (`npx tsc -p tsconfig.test.json`); point it at another build, e.g.
// `npx tsc -p tsconfig.test.json --outDir /tmp/scan-eval/build-b`, to compare ranking code on the same OCR.
// Mirrors src/lib/scan-pipeline.ts: rank the first read (live auto-capture takes it only when
// !needsScanRefinement), merge the refine pass only when refinement is needed, then optionally apply
// artwork distances (from artwork.swift) when the pipeline would compare pictures.
'use strict';

const fs = require('fs');

const path = require('path');

const Module = require('module');

const argv = process.argv.slice(2);

const flags = {};

const positional = [];

for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--quiet') flags.quiet = true;
  else if (argv[i].startsWith('--')) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}

if (positional.length < 2) {
  console.error(
    'usage: evaluate.cjs <ocr.jsonl> <manifest.json> [build-dir] [--json out] [--artwork distances.jsonl] [--emit-compare out.jsonl]',
  );
  process.exit(2);
}

const [ocrFile, manifestFile, buildArg = '.test-build'] = positional;

const REPO = path.resolve(__dirname, '..', '..');

const build = path.resolve(buildArg);

// Builds outside the repo still need its node_modules (valibot).
process.env.NODE_PATH = [path.join(REPO, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter);

Module._initPaths();

const catalog = require(path.join(build, 'lib/catalog'));

const { detectCardLanguage } = require(path.join(build, 'lib/language-detect'));

const {
  scanCandidates,
  needsScanRefinement,
  rerankByArtwork,
  cardImage,
  allCards,
  normalize,
  setForCard,
  printedNumber,
} = catalog;

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));

const photos = new Map(manifest.photos.map((p) => [p.id, p]));

const rows = fs
  .readFileSync(ocrFile, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));

const artwork = new Map();

if (flags.artwork && fs.existsSync(flags.artwork))
  for (const line of fs.readFileSync(flags.artwork, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    artwork.set(`${r.id}|${r.mode}`, r);
  }

const cardsById = new Map(allCards.map((c) => [`${c.language}:${c.id}`, c]));

// ---- Evidence checks used only to explain failures (approximations of catalog.ts internals) -----------------

const canonical = (s) =>
  s
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/^0+(?=\d)/, '');

const repairDigits = (s) => {
  const m = s.match(/^([a-z]{0,3}?)([0-9oilsbz]+)$/i);

  if (!m || !/\d/.test(s)) return canonical(s);

  return canonical(
    m[1] + m[2].toLowerCase().replace(/[oilsbz]/g, (c) => ({ o: '0', i: '1', l: '1', s: '5', b: '8', z: '2' })[c]),
  );
};

function editDistance(a, b) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);

  for (let i = 1; i <= a.length; i++) {
    const next = [i];

    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(next[j - 1] + 1, row[j] + 1, row[j - 1] + Number(a[i - 1] !== b[j - 1]));
    row = next;
  }

  return row[b.length];
}

/** 'exact' | 'base' | 'fuzzy' | 'missing' for the expected name in the header text. */
function nameEvidence(card, scan) {
  const n = normalize(card.name);
  const base = n.replace(/^(?:mega|メガ)/, '').replace(/(?:vmax|vstar|ex|gx|lvx|v)$/, '');
  const lines = scan.topText.split('\n').map(normalize).filter(Boolean);
  const top = lines.join('');

  if (top.includes(n)) return 'exact';

  if (base.length >= 3 && top.includes(base)) return 'base';
  const max = n.length >= 9 ? 2 : 1;

  for (const target of [n, base])
    for (const line of lines)
      for (let len = target.length - max; len <= target.length + max; len++)
        for (let s = 0; s + len <= line.length; s++)
          if (len > 0 && editDistance(target, line.slice(s, s + len)) <= max) return 'fuzzy';

  if (normalize(scan.text).includes(n)) return 'body-only';

  return 'missing';
}

function fractions(scan) {
  return [
    ...`${scan.bottomText}\n${scan.text}`
      .normalize('NFKC')
      .matchAll(/([A-Za-z]{0,3}[0-9OIlSBZ]{1,4})\s*[/／]\s*([A-Za-z]{0,3}[0-9OIlSBZ]{1,4})/gi),
  ].map((f) => [repairDigits(f[1]), repairDigits(f[2])]);
}

/** Did the footer show the collector number (fraction numerator or a bare token), the total, and the set code? */
function footerEvidence(card, scan) {
  const set = setForCard(card);
  const number = canonical(card.localId);
  const fr = fractions(scan);
  const bottom = scan.bottomText.normalize('NFKC');
  const tokens = bottom.split(/[\s•·]+/).filter(Boolean);
  const numberAsFraction = fr.some((f) => f[0] === number);

  const numberAsToken = tokens.some(
    (t) => /\d/.test(t) && repairDigits(t.replace(/^[A-Z]{2,4}(?:EN)?/, '')) === number,
  );

  const totalRead = !!set && fr.some((f) => f[0] === number && Number(f[1]) === set.cardCount.official);
  const setId = card.id.slice(0, card.id.lastIndexOf('-'));
  const abbreviation = set?.abbreviation?.split(':')[0];
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const idRead = setId.length >= 3 && new RegExp(`(?:^|[^A-Za-z0-9])${esc(setId)}(?:$|[^A-Za-z0-9])`, 'i').test(bottom);

  const abbrRead =
    !!abbreviation &&
    abbreviation.length >= 3 &&
    new RegExp(`(?:^|[^A-Za-z0-9])${esc(abbreviation)}(?:EN)?(?:$|[^A-Za-z0-9])`).test(bottom);

  const printed = printedNumber(card);
  const promo = printed !== card.localId && !/^\d+\//.test(printed) ? printed.replace(/ /g, ' ') : null;

  return {
    number: numberAsFraction ? 'fraction' : numberAsToken ? 'token' : 'missing',
    total: totalRead,
    setCode: idRead || abbrRead ? 'read' : abbreviation || card.language !== 'en' ? 'not-read' : 'no-abbreviation',
    abbreviation: abbreviation ?? null,
    promo,
  };
}

function iou(a, b) {
  const x1 = Math.max(a[0], b[0]),
    y1 = Math.max(a[1], b[1]);

  const x2 = Math.min(a[0] + a[2], b[0] + b[2]),
    y2 = Math.min(a[1] + a[3], b[1] + b[3]);

  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);

  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

const short = (s, n = 90) => {
  const v = String(s ?? '')
    .replace(/\n+/g, ' | ')
    .replace(/\s+/g, ' ')
    .trim();

  return v.length > n ? `${v.slice(0, n)}…` : v;
};

const top3 = (list) =>
  list.slice(0, 3).map((c) => `${c.card.id} ${c.card.name} ${c.score}${c.exactPrinting ? '!' : ''} (${c.evidence})`);

const rankOf = (list, id) => {
  const i = list.findIndex((c) => c.card.id === id);

  return i < 0 ? null : i + 1;
};

// ---- Evaluate -----------------------------------------------------------------------------------------------

const results = [];

const compareRequests = [];

for (const row of rows) {
  const photo = photos.get(row.id);

  if (!photo) continue;
  const expected = photo.expected;

  const r = {
    id: row.id,
    mode: row.mode,
    kind: photo.kind,
    category: photo.category,
    hard: !!photo.hard,
    expected: expected.id,
    expectedLanguage: expected.language,
    printed: expected.printed,
  };

  results.push(r);

  if (row.error || !row.recognize) {
    r.error = row.error ?? 'no recognize output';
    r.causes = ['ocr-error'];
    continue;
  }

  const scan = row.recognize;
  const language = row.mode === 'auto' ? detectCardLanguage(scan) : row.language;
  const initial = scanCandidates(scan, language, 12, 'all');
  const needs = needsScanRefinement(initial);
  const refine = row.refines?.[language] ?? (row.mode === 'auto' ? null : row.refine);
  let final = initial;
  let merged = scan;

  if (needs && refine) {
    merged = {
      ...scan,
      text: `${scan.text}\n${refine.text}`,
      topText: `${scan.topText}\n${refine.topText}`,
      bottomText: `${scan.bottomText}\n${refine.bottomText}`,
    };
    final = scanCandidates(merged, language, 12, 'all');
  }

  const textFinal = final;
  const compare = needsScanRefinement(final) && final.length > 1;

  if (compare) {
    const shortlist = final.filter((c) => cardImage(c.card) && c.score >= final[0].score - 40).slice(0, 6);

    if (shortlist.length >= 2) {
      compareRequests.push({
        id: row.id,
        mode: row.mode,
        preview: row.preview,
        ids: shortlist.map((c) => c.card.id),
        urls: shortlist.map((c) => cardImage(c.card).replace('/low.webp', '/low.png')),
      });
      const a = artwork.get(`${row.id}|${row.mode}`);

      if (a && a.distances) {
        final = rerankByArtwork(final, new Map(a.ids.map((id, i) => [id, a.distances[i] ?? -1])));
        r.artworkApplied = true;
      }
    }
  }

  const card = cardsById.get(`${expected.language}:${expected.id}`);
  Object.assign(r, {
    language,
    languageOk: language === expected.language,
    autoCropped: scan.autoCropped,
    cropIoU: photo.truth ? Number(iou(scan.crop, photo.truth.bbox).toFixed(3)) : null,
    recognizeTop: initial[0]?.card.id ?? null,
    recognizeOk: initial[0]?.card.id === expected.id && language === expected.language,
    recognizeExact: !!initial[0]?.exactPrinting,
    recognizeRank: language === expected.language ? rankOf(initial, expected.id) : null,
    liveAccept: initial.length > 0 && !needs,
    refined: needs && !!refine,
    refineMissing: needs && !refine,
    textTop: textFinal[0]?.card.id ?? null,
    finalTop: final[0]?.card.id ?? null,
    finalOk: final[0]?.card.id === expected.id && language === expected.language,
    finalExact: !!final[0]?.exactPrinting,
    finalRank: language === expected.language ? rankOf(final, expected.id) : null,
    compareStage: compare,
    initialTop3: top3(initial),
    finalTop3: top3(final),
    timings: { ...scan.timings, refineMs: refine?.wallMs ?? null },
    read: {
      top: short(scan.topText, 70),
      bottom: short(scan.bottomText, 160),
      refineTop: short(refine?.topText, 60),
      refineBottom: short(refine?.bottomText, 100),
    },
  });
  r.wrongAutoAccept = r.liveAccept && !r.recognizeOk;

  if (r.finalOk) continue;

  // Why did the expected card not come first?
  const causes = [];

  if (!card) causes.push('not-in-catalog');

  if (!r.languageOk) causes.push(`wrong-language(${language})`);

  if (!scan.autoCropped) causes.push('crop-failed');
  else if (r.cropIoU !== null && r.cropIoU < 0.8) causes.push(`crop-wrong-region(iou ${r.cropIoU})`);

  if (card) {
    const name = nameEvidence(card, merged);
    const footer = footerEvidence(card, merged);
    r.evidence = { name, ...footer };

    if (name === 'missing' || name === 'body-only') causes.push('name-not-read');
    else if (name === 'fuzzy') causes.push('name-fuzzy-only');

    if (footer.number === 'missing') causes.push('number-not-read');

    if (footer.setCode === 'no-abbreviation') causes.push('set-has-no-abbreviation');
    else if (footer.setCode === 'not-read' && !footer.promo) causes.push('set-code-not-read');

    if (r.finalRank && r.finalRank > 1) causes.push(`outranked(rank ${r.finalRank})`);
    else if (r.languageOk && !r.finalRank) causes.push('not-in-candidates');
  }

  r.causes = causes.length ? causes : ['unknown'];
}

// ---- Report -------------------------------------------------------------------------------------------------

const pct = (n, d) => (d ? `${((100 * n) / d).toFixed(1)}%` : '–');

const median = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);

  return v.length ? v[Math.floor(v.length / 2)] : NaN;
};

const p90 = (xs) => {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);

  return v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.9))] : NaN;
};

function summary(list) {
  const ok = list.filter((r) => !r.error);

  return {
    n: list.length,
    recognizeTop1: ok.filter((r) => r.recognizeOk).length,
    finalTop1: ok.filter((r) => r.finalOk).length,
    liveAccept: ok.filter((r) => r.liveAccept).length,
    wrongAutoAccept: ok.filter((r) => r.wrongAutoAccept).length,
    confidentlyWrong: ok.filter((r) => !r.finalOk && r.finalExact).length,
    noCandidates: ok.filter((r) => !r.finalTop).length,
    errors: list.length - ok.length,
  };
}

const groups = [
  ['all', () => true],
  ['real', (r) => r.kind === 'real'],
  ['synthetic normal', (r) => r.kind === 'synthetic' && !r.hard],
  ['synthetic hard', (r) => r.kind === 'synthetic' && r.hard],
  ...[...new Set(results.map((r) => r.category))].map((c) => [`cat:${c}`, (r) => r.category === c]),
];

const table = [];

for (const mode of ['specific', 'auto'])
  for (const [label, test] of groups) {
    const list = results.filter((r) => r.mode === mode && test(r));

    if (!list.length) continue;
    const s = summary(list);
    table.push({
      mode,
      group: label,
      n: s.n,
      'top1 recognize': pct(s.recognizeTop1, s.n),
      'top1 after refine': pct(s.finalTop1, s.n),
      'live accept': pct(s.liveAccept, s.n),
      'wrong auto-accept': s.wrongAutoAccept,
      'wrong w/ exact': s.confidentlyWrong,
      'no match': s.noCandidates,
    });
  }

if (!flags.quiet) {
  console.log(
    `\nScan accuracy — ${results.length} reads, build ${path.relative(process.cwd(), build) || build}${artwork.size ? ', artwork distances applied' : ''}\n`,
  );
  console.table(table);
  const t = results.filter((r) => r.timings);
  console.log(
    `\nOCR timings (ms): recognize median ${median(t.map((r) => r.timings.totalMs)).toFixed(0)}, p90 ${p90(t.map((r) => r.timings.totalMs)).toFixed(0)}; ` +
      `refine median ${median(t.map((r) => r.timings.refineMs)).toFixed(0)}, p90 ${p90(t.map((r) => r.timings.refineMs)).toFixed(0)}`,
  );
  // The crop does not depend on the language, so count it once per photo.
  const crops = results.filter((r) => r.mode === 'specific' && r.timings);
  const loose = crops.filter((r) => r.autoCropped && r.cropIoU !== null && r.cropIoU < 0.8);
  console.log(
    `Auto-crop: found a card in ${crops.filter((r) => r.autoCropped).length}/${crops.length} photos; ` +
      `${loose.length} crops overlap the true card by IoU < 0.8 (${loose.map((r) => `${r.id} ${r.cropIoU}`).join(', ') || 'none'})`,
  );
  const causes = {};

  for (const r of results.filter((x) => !x.finalOk))
    for (const c of r.causes ?? [])
      causes[`${r.mode}: ${c.replace(/\(.*\)/, '')}`] = (causes[`${r.mode}: ${c.replace(/\(.*\)/, '')}`] ?? 0) + 1;
  console.log('\nFailure causes (a failure can have several):');
  console.table(
    Object.entries(causes)
      .sort()
      .map(([cause, count]) => ({ cause, count })),
  );

  const wrongAccepts = results.filter((r) => r.wrongAutoAccept);
  console.log(`\nWrong live auto-accepts (${wrongAccepts.length}):`);

  for (const r of wrongAccepts)
    console.log(`  [${r.mode}] ${r.id}: expected ${r.expected}, accepted ${r.initialTop3[0]}`);

  console.log('\nFailures after refine:');

  for (const r of results.filter((x) => !x.finalOk)) {
    console.log(
      `\n  [${r.mode}] ${r.id}  expected ${r.expected} (${r.printed})${r.hard ? ' HARD' : ''}  lang ${r.language ?? '?'}  crop ${r.autoCropped ? `auto iou=${r.cropIoU ?? '-'}` : 'FAILED'}`,
    );
    console.log(
      `     causes: ${(r.causes ?? []).join(', ')}${r.evidence ? `  evidence: ${JSON.stringify(r.evidence)}` : ''}`,
    );

    if (r.error) {
      console.log(`     error: ${r.error}`);
      continue;
    }

    console.log(`     top:    ${r.read.top}`);
    console.log(`     bottom: ${r.read.bottom}`);

    if (r.refined) console.log(`     refine: top ${r.read.refineTop} / bottom ${r.read.refineBottom}`);
    console.log(`     recognize → ${r.initialTop3.join(' ; ') || '(none)'}`);
    console.log(`     final     → ${r.finalTop3.join(' ; ') || '(none)'}`);
  }
}

if (flags.json)
  fs.writeFileSync(
    flags.json,
    JSON.stringify(
      { build, ocr: path.resolve(ocrFile), manifest: path.resolve(manifestFile), table, results },
      null,
      2,
    ),
  );

if (flags['emit-compare'])
  fs.writeFileSync(
    flags['emit-compare'],
    compareRequests.map((r) => JSON.stringify(r)).join('\n') + (compareRequests.length ? '\n' : ''),
  );
