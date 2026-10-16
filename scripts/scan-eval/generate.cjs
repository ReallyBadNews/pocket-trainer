#!/usr/bin/env node
// Builds a small synthetic corpus of phone photos of sleeved binder cards for the scan accuracy harness.
//
//   node scripts/scan-eval/generate.cjs [--out /tmp/scan-eval] [--seed 20261015] [--jobs 6] [--limit N]
//        [--real /tmp/scan-lab/photos] [--only <photo id substring>]
//
// Writes <out>/photos/*.jpg, <out>/art/*.png (TCGdex high-res art, reused between runs) and <out>/manifest.json.
// Sampling and rendering are deterministic for a given seed. Requires ImageMagick 7 (`magick`).
'use strict';

const fs = require('fs');

const path = require('path');

const { execFile } = require('child_process');

const { promisify } = require('util');

const run = promisify(execFile);

const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a, i, all) =>
      a.startsWith('--') ? [a.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)] : null,
    )
    .filter(Boolean),
);

const REPO = path.resolve(args.repo ?? path.join(__dirname, '..', '..'));

const OUT = path.resolve(args.out ?? '/tmp/scan-eval');

const SEED = Number(args.seed ?? 20261015);

const JOBS = Number(args.jobs ?? 6);

const REAL = args.real ?? '/tmp/scan-lab/photos';

const FRAME = { w: 1500, h: 2000 };

const CARD = { w: 600, h: 825 };

// Real user photos: file name stem -> expected card.
const REAL_PHOTOS = [
  { stem: 'charcadet-mep022', id: 'mep-022', language: 'en' },
  { stem: 'fennekin-mep080', id: 'mep-080', language: 'en' },
];

function mulberry32(seed) {
  let a = seed >>> 0;

  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const uniform = (rng, a, b) => a + (b - a) * rng();

const choice = (rng, list) => list[Math.floor(rng() * list.length)];

const load = (file) => JSON.parse(fs.readFileSync(path.join(REPO, 'src/data', file), 'utf8'));

const overrides = load('image-overrides.json');

const catalogs = {};

const setMaps = {};

for (const language of ['en', 'ja', 'ko', 'zh-tw', 'zh-cn']) {
  catalogs[language] = load(`cards-${language}.json`);
  setMaps[language] = new Map(load(`sets-${language}.json`).map((s) => [s.id, s]));
}

const setOf = (id) => id.slice(0, id.lastIndexOf('-'));

const imageBase = (language, card) => card.image ?? overrides[language]?.[card.id];

const withArt = (language) => catalogs[language].filter((c) => imageBase(language, c));

function kindOf(language, card) {
  const set = setMaps[language].get(setOf(card.id));
  const official = set?.cardCount.official ?? 0;

  if (official > 0 && /^\d+$/.test(card.localId) && Number(card.localId) > official) return 'secret';

  return /(?:\sex|ex)$/i.test(card.name) && !/^[a-z]*ex$/i.test(card.name) ? 'ex' : 'regular';
}

const artFile = (language, id) => path.join(OUT, 'art', `${language}__${id.replace(/[^A-Za-z0-9._-]/g, '_')}.png`);

async function download(language, card) {
  const file = artFile(language, card.id);

  if (fs.existsSync(file) && fs.statSync(file).size > 10000) return file;
  const url = `${imageBase(language, card)}/high.png`;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(20000) });

      if (response.status === 404) return null;

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = Buffer.from(await response.arrayBuffer());

      if (data.length < 10000) return null;
      fs.writeFileSync(file, data);

      return file;
    } catch (e) {
      if (attempt === 2) {
        console.warn(`download failed ${url}: ${e.message}`);

        return null;
      }
    }
  }

  return null;
}

/** Picks cards in a fixed order, downloading each so cards without published art are replaced. */
async function sample() {
  const rng = mulberry32(SEED);
  const used = new Set();
  const picks = [];

  async function take(language, pool, category, note) {
    let candidates = pool.filter((c) => !used.has(`${language}:${c.id}`));

    while (candidates.length) {
      const card = choice(rng, candidates);
      used.add(`${language}:${card.id}`);
      candidates = candidates.filter((c) => c !== card);
      const file = await download(language, card);

      if (file) {
        picks.push({ category, language, card, art: file, note });

        return true;
      }
    }

    console.warn(`no art for ${category} ${note ?? ''}`);

    return false;
  }

  const inSet = (language, id) => withArt(language).filter((c) => setOf(c.id) === id);
  const inSets = (language, pattern) => withArt(language).filter((c) => pattern.test(setOf(c.id)));

  // 30 recent English main-set cards, rotating commons / ex / secret rares (illustration rares, full art).
  const recent = [
    ['me01', 4],
    ['me02', 4],
    ['me02.5', 4],
    ['me03', 3],
    ['me04', 3],
    ['me05', 3],
    ['sv08.5', 3],
    ['sv10', 3],
    ['sv09', 3],
  ];

  const kinds = ['regular', 'ex', 'secret'];
  let turn = Math.floor(rng() * 3);

  for (const [set, count] of recent) {
    const cards = inSet('en', set);

    for (let i = 0; i < count; i++) {
      const kind = kinds[turn++ % 3];
      const pool = cards.filter((c) => kindOf('en', c) === kind);
      await take('en', pool.length ? pool : cards, 'recent-en', kind);
    }
  }

  // 20 English Black Star promos.
  for (const set of ['mep', 'svp', 'swshp', 'smp'])
    for (let i = 0; i < 5; i++) await take('en', inSet('en', set), 'promo-en', set);

  // 20 older English cards: pick a set first so big eras do not crowd out small ones.
  const older = [
    [/^swsh\d+(?:\.5)?$/, 6],
    [/^sm\d+(?:\.5)?$/, 5],
    [/^xy\d+$/, 4],
    [/^base1$/, 1],
    [/^bw\d+$/, 1],
    [/^(?:dp\d|pl\d)$/, 1],
    [/^ex\d+$/, 1],
    [/^(?:neo\d|gym\d|hgss\d)$/, 1],
  ];

  for (const [pattern, count] of older) {
    const sets = [...new Set(inSets('en', pattern).map((c) => setOf(c.id)))];

    for (let i = 0; i < count; i++) {
      const set = choice(rng, sets);
      await take('en', inSet('en', set), 'older-en', set);
    }
  }

  // 15 Japanese cards (TCGdex has no art for SV-P / M-P promos or the M-era sets yet).
  const japanese = [
    ['SV2a', 3],
    ['SV9', 2],
    ['SV8a', 2],
    ['SV7', 2],
    ['SV4a', 2],
    ['SV6', 1],
    ['SV5K', 1],
    ['S12a', 1],
    ['SV10', 1],
  ];

  for (const [set, count] of japanese) {
    const cards = inSet('ja', set);

    for (let i = 0; i < count; i++) {
      const kind = i % 2 ? 'secret' : rng() < 0.5 ? 'regular' : 'ex';
      const pool = cards.filter((c) => kindOf('ja', c) === kind);
      await take('ja', pool.length ? pool : cards, 'ja', `${set} ${kind}`);
    }
  }

  // 5 Traditional Chinese cards (TCGdex has no Korean art).
  for (const set of ['SV7', 'SV8', 'SV8a', 'SV9', 'SV7a']) await take('zh-tw', inSet('zh-tw', set), 'zh-tw', set);

  // 10 cards whose names have many printings: one recent and one from any era each.
  for (const name of ['Pikachu', 'Charizard', 'Eevee', 'Fennekin', 'Charcadet']) {
    const all = withArt('en').filter((c) => c.name === name);
    const recentPool = all.filter((c) => /^(?:sv|me)/.test(setOf(c.id)));
    await take('en', recentPool.length ? recentPool : all, 'many-printings', name);
    await take('en', all, 'many-printings', name);
  }

  // Binder neighbours: the other targets plus some filler cards.
  const fillers = [];
  const fillerRng = mulberry32(SEED ^ 0x5eed);

  for (const [language, count] of [
    ['en', 24],
    ['ja', 8],
    ['zh-tw', 6],
  ]) {
    const pool = withArt(language);
    let added = 0;

    while (added < count) {
      const card = choice(fillerRng, pool);

      if (used.has(`${language}:${card.id}`)) continue;
      used.add(`${language}:${card.id}`);
      const file = await download(language, card);

      if (file) {
        fillers.push({ language, card, art: file });
        added++;
      }
    }
  }

  return { picks, fillers };
}

// ---- Geometry -------------------------------------------------------------------------------------------

const mul = (A, B) => A.map((row, i) => B[0].map((_, j) => row.reduce((s, _, k) => s + A[i][k] * B[k][j], 0)));

const translate = (x, y) => [
  [1, 0, x],
  [0, 1, y],
  [0, 0, 1],
];

const scale = (s) => [
  [s, 0, 0],
  [0, s, 0],
  [0, 0, 1],
];

const rotate = (deg) => {
  const r = (deg * Math.PI) / 180;

  return [
    [Math.cos(r), -Math.sin(r), 0],
    [Math.sin(r), Math.cos(r), 0],
    [0, 0, 1],
  ];
};

const keystone = (kx, ky) => [
  [1, 0, 0],
  [0, 1, 0],
  [kx, ky, 1],
];

const apply = (M, [x, y]) => {
  const w = M[2][0] * x + M[2][1] * y + M[2][2];

  return [(M[0][0] * x + M[0][1] * y + M[0][2]) / w, (M[1][0] * x + M[1][1] * y + M[1][2]) / w];
};

// Binder page layout in card pixels (TCGdex art is 600x825; a pocket is ~66 mm for a 63 mm card). The grid
// extends up to two pockets around the target; on carpet one side stops after one pocket so the page edge shows.
const POCKET_PAD = 16;

const GUTTER = 26;

const PAGE_MARGIN = 60;

const POCKET = { w: CARD.w + POCKET_PAD * 2, h: CARD.h + POCKET_PAD * 2 };

const pageSize = (grid) => ({
  w: POCKET.w * grid.cols + GUTTER * (grid.cols - 1) + PAGE_MARGIN * 2,
  h: POCKET.h * grid.rows + GUTTER * (grid.rows - 1) + PAGE_MARGIN * 2,
});

const pocketOrigin = (row, col) => [PAGE_MARGIN + col * (POCKET.w + GUTTER), PAGE_MARGIN + row * (POCKET.h + GUTTER)];

const GLARE_SCALE = 4;

const f = (n) => Number(n.toFixed(2));

function plan(index, pick, neighbours) {
  const rng = mulberry32(SEED * 31 + index * 7919);
  const hard = index % 4 === 3;

  const params = {
    hard,
    cardHeight: hard ? uniform(rng, 0.45, 0.56) : uniform(rng, 0.5, 0.85),
    rotation: uniform(rng, -6, 6),
    keystone: [uniform(rng, -1, 1) * (hard ? 7e-5 : 3.5e-5), uniform(rng, -1, 1) * (hard ? 7e-5 : 3.5e-5)],
    background: rng() < 0.55 ? 'carpet' : 'dark',
    glare: hard
      ? {
          at: rng() < 0.6 ? uniform(rng, 0.86, 0.95) : uniform(rng, 0.03, 0.1),
          angle: uniform(rng, -12, 12),
          thickness: uniform(rng, 0.07, 0.14),
          alpha: uniform(rng, 0.55, 0.8),
        }
      : {
          at: uniform(rng, 0.12, 0.88),
          angle: uniform(rng, -25, 25),
          thickness: uniform(rng, 0.05, 0.16),
          alpha: uniform(rng, 0.18, 0.45),
        },
    wash: uniform(rng, 0, 0.12),
    blur: hard ? uniform(rng, 1.2, 2.0) : uniform(rng, 0, 1.2),
    quality: Math.round(uniform(rng, 70, 85)),
    warm: rng() < 0.35,
    light: [uniform(rng, 0.78, 1), uniform(rng, 0.78, 1), uniform(rng, 0.72, 1), uniform(rng, 0.72, 1)],
    noise: uniform(rng, 0.15, 0.4),
    sleeve: uniform(rng, 0.04, 0.1),
    seed: Math.floor(rng() * 1e6),
    // Half the binders use inner (penny) sleeves, whose bright edges outline each card. Drawn from a separate
    // stream so adding it did not move any other parameter.
    rim: mulberry32(SEED * 131 + index * 104729)() < 0.5,
  };

  // Pockets around the target: [above, below, left, right].
  const around = [2, 2, 2, 2];

  // On carpet the binder page ends on one side, right beside the target or one pocket further out.
  if (params.background === 'carpet') {
    const side = Math.floor(rng() * 4);
    around[side] = rng() < 0.5 ? 0 : 1;
    params.edge = `${['top', 'bottom', 'left', 'right'][side]}+${around[side]}`;
  } else params.edge = null;

  const grid = { rows: around[0] + 1 + around[1], cols: around[2] + 1 + around[3], target: [around[0], around[2]] };

  // Neighbours prefer the target's language, like a sorted binder.
  const same = neighbours.filter(
    (n) => n.language === pick.language && n.card.name !== pick.card.name && n.art !== pick.art,
  );

  const other = neighbours.filter((n) => n.language !== pick.language && n.card.name !== pick.card.name);
  const pockets = [];

  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.cols; col++) {
      const [x, y] = pocketOrigin(row, col);

      if (row === grid.target[0] && col === grid.target[1]) {
        pockets.push({
          target: true,
          row,
          col,
          art: pick.art,
          x: x + POCKET_PAD + Math.round(uniform(rng, -5, 5)),
          y: y + POCKET_PAD + Math.round(uniform(rng, -5, 5)),
          rotation: 0,
        });
      } else {
        const n = choice(rng, rng() < 0.75 && same.length ? same : other.length ? other : same);
        pockets.push({
          target: false,
          row,
          col,
          art: n.art,
          id: `${n.language}:${n.card.id}`,
          x: x + POCKET_PAD + Math.round(uniform(rng, -6, 6)),
          y: y + POCKET_PAD + Math.round(uniform(rng, -6, 6)),
          rotation: uniform(rng, -1.2, 1.2),
        });
      }
    }

  const target = pockets.find((p) => p.target);
  const centre = [target.x + CARD.w / 2, target.y + CARD.h / 2];
  let s = (params.cardHeight * FRAME.h) / CARD.h;

  const cardCorners = [
    [target.x, target.y],
    [target.x + CARD.w, target.y],
    [target.x + CARD.w, target.y + CARD.h],
    [target.x, target.y + CARD.h],
  ];

  let M, quad;

  // Shrink until the whole card fits inside the frame with a small margin.
  for (;;) {
    const local = mul(
      keystone(...params.keystone),
      mul(rotate(params.rotation), mul(scale(s), translate(-centre[0], -centre[1]))),
    );

    const q = cardCorners.map((p) => apply(local, p));

    const xs = q.map((p) => p[0]),
      ys = q.map((p) => p[1]);

    const margin = 24;
    const xr = [margin - Math.min(...xs), FRAME.w - margin - Math.max(...xs)];
    const yr = [margin - Math.min(...ys), FRAME.h - margin - Math.max(...ys)];

    if (xr[0] <= xr[1] && yr[0] <= yr[1]) {
      // People roughly centre the card; keep it near the middle of the allowed range.
      const cx = (xr[0] + xr[1]) / 2 + (rng() - 0.5) * Math.min(xr[1] - xr[0], FRAME.w * 0.3);
      const cy = (yr[0] + yr[1]) / 2 + (rng() - 0.5) * Math.min(yr[1] - yr[0], FRAME.h * 0.25);
      M = mul(translate(cx, cy), local);
      quad = cardCorners.map((p) => apply(M, p));
      break;
    }

    s *= 0.97;
  }

  params.cardHeight = (Math.max(...quad.map((p) => p[1])) - Math.min(...quad.map((p) => p[1]))) / FRAME.h;

  // The glare band on the sleeve, in card coordinates (u across, v down), drawn onto the page so it stays on the binder.
  const g = params.glare;
  const slope = Math.tan((g.angle * Math.PI) / 180) * (CARD.w / CARD.h);

  const band = (thickness) =>
    [
      [-0.3, g.at - thickness / 2 + (-0.3 - 0.5) * slope],
      [1.3, g.at - thickness / 2 + (1.3 - 0.5) * slope],
      [1.3, g.at + thickness / 2 + (1.3 - 0.5) * slope],
      [-0.3, g.at + thickness / 2 + (-0.3 - 0.5) * slope],
    ].map(([u, v]) => [target.x + u * CARD.w, target.y + v * CARD.h]);

  return {
    params,
    grid,
    pockets,
    M,
    quad,
    glare: { outer: band(g.thickness), core: band(g.thickness * 0.35), sigma: g.thickness * CARD.h * 0.3 },
  };
}

async function render(photo, layout, tmp) {
  const { params, grid, pockets, M, glare } = layout;
  const PAGE = pageSize(grid);
  fs.mkdirSync(tmp, { recursive: true });
  const page = path.join(tmp, 'page.png');

  const pageArgs = [
    '-size',
    `${PAGE.w}x${PAGE.h}`,
    'xc:#17181b',
    '-seed',
    String(params.seed),
    '-attenuate',
    '0.15',
    '+noise',
    'Gaussian',
  ];

  const rim = params.rim ? 7 : 0;

  for (const p of pockets) {
    const rad = (Math.abs(p.rotation) * Math.PI) / 180;

    const cw = CARD.w + rim * 2,
      ch = CARD.h + rim * 2;

    const w = cw * Math.cos(rad) + ch * Math.sin(rad),
      h = ch * Math.cos(rad) + cw * Math.sin(rad);

    const x = Math.round(p.x + CARD.w / 2 - w / 2),
      y = Math.round(p.y + CARD.h / 2 - h / 2);

    pageArgs.push('(', p.art, '-alpha', 'set', '-resize', `${CARD.w}x${CARD.h}!`, '-background', 'none');

    if (rim)
      pageArgs.push(
        '-bordercolor',
        'none',
        '-border',
        String(rim),
        '-fill',
        'rgba(255,255,255,0.08)',
        '-stroke',
        'rgba(238,238,242,0.6)',
        '-strokewidth',
        '3',
        '-draw',
        `roundrectangle 2,2 ${cw - 3},${ch - 3} 26,26`,
      );

    if (p.rotation) pageArgs.push('-rotate', f(p.rotation).toString());
    pageArgs.push(')', '-geometry', `+${x}+${y}`, '-compose', 'Over', '-composite');
  }

  // Clear pockets: a faint haze over each card, bright welded edges and dotted seams between pockets.
  const draws = [];

  for (let row = 0; row < grid.rows; row++)
    for (let col = 0; col < grid.cols; col++) {
      const [x, y] = pocketOrigin(row, col);
      draws.push(`rectangle ${x},${y} ${x + POCKET.w},${y + POCKET.h}`);
    }

  pageArgs.push(
    '-fill',
    `rgba(255,255,255,${f(params.sleeve)})`,
    '-stroke',
    'rgba(235,235,240,0.42)',
    '-strokewidth',
    '4',
    '-draw',
    draws.join(' '),
  );
  const seams = [];

  for (let i = 1; i < grid.cols; i++) {
    const sx = PAGE_MARGIN + i * (POCKET.w + GUTTER) - GUTTER / 2;
    seams.push(`line ${sx},${PAGE_MARGIN - 20} ${sx},${PAGE.h - PAGE_MARGIN + 20}`);
  }

  for (let i = 1; i < grid.rows; i++) {
    const sy = PAGE_MARGIN + i * (POCKET.h + GUTTER) - GUTTER / 2;
    seams.push(`line ${PAGE_MARGIN - 20},${sy} ${PAGE.w - PAGE_MARGIN + 20},${sy}`);
  }

  pageArgs.push(
    '-fill',
    'none',
    '-stroke',
    'rgba(200,200,205,0.35)',
    '-strokewidth',
    '6',
    '-draw',
    `stroke-dasharray 8 6 ${seams.join(' ')}`,
  );
  // Pocket openings catch light along the top edge.
  const lips = [];

  for (let row = 0; row < grid.rows; row++) {
    const [, y] = pocketOrigin(row, 0);
    lips.push(`line ${PAGE_MARGIN},${y + 8} ${PAGE.w - PAGE_MARGIN},${y + 8}`);
  }

  pageArgs.push('-stroke', 'rgba(255,255,255,0.22)', '-strokewidth', '10', '-draw', lips.join(' '));
  // Sleeve glare: a soft band with a brighter core, drawn small and blurred, then scaled onto the page.
  const k = GLARE_SCALE;
  const poly = (points) => `polygon ${points.map(([x, y]) => `${f(x / k)},${f(y / k)}`).join(' ')}`;
  pageArgs.push(
    '(',
    '-size',
    `${Math.ceil(PAGE.w / k)}x${Math.ceil(PAGE.h / k)}`,
    'xc:none',
    '-stroke',
    'none',
    '-fill',
    `rgba(255,255,255,${f(params.glare.alpha)})`,
    '-draw',
    poly(glare.outer),
    '-fill',
    `rgba(255,255,255,${f(Math.min(0.95, params.glare.alpha + 0.15))})`,
    '-draw',
    poly(glare.core),
    '-channel',
    'RGBA',
    '-blur',
    `0x${f(Math.max(1, glare.sigma / k))}`,
    '+channel',
    '-resize',
    `${PAGE.w}x${PAGE.h}!`,
    ')',
    '-compose',
    'Over',
    '-composite',
    page,
  );
  await run('magick', pageArgs, { maxBuffer: 1 << 24 });

  const corners = [
    [0, 0],
    [PAGE.w, 0],
    [PAGE.w, PAGE.h],
    [0, PAGE.h],
  ];

  const control = corners.map((p) => {
    const [x, y] = apply(M, p);

    return `${p[0]},${p[1]} ${f(x)},${f(y)}`;
  });

  const frame = `${FRAME.w}x${FRAME.h}`;

  const bg =
    params.background === 'carpet'
      ? [
          '(',
          '-size',
          '500x667',
          'xc:',
          '-seed',
          String(params.seed + 1),
          '+noise',
          'Random',
          '-channel',
          'G',
          '-separate',
          '+channel',
          '-blur',
          '0x0.8',
          '-resize',
          `${frame}!`,
          '(',
          '-size',
          frame,
          'xc:',
          '-seed',
          String(params.seed + 2),
          '+noise',
          'Random',
          '-channel',
          'G',
          '-separate',
          '+channel',
          '-blur',
          '0x1.1',
          ')',
          '-compose',
          'Multiply',
          '-composite',
          '-level',
          '5%,75%',
          '+level-colors',
          '#3d3833,#cfc6b9',
          ')',
        ]
      : [
          '(',
          '-size',
          frame,
          'xc:#141416',
          '-seed',
          String(params.seed + 1),
          '-attenuate',
          '0.4',
          '+noise',
          'Gaussian',
          '-blur',
          '0x1.5',
          ')',
        ];

  const [l0, l1, l2, l3] = params.light.map((v) => `gray(${f(v * 100)}%)`);

  const out = [
    ...bg,
    '(',
    page,
    '-alpha',
    'set',
    '-virtual-pixel',
    'transparent',
    '-define',
    `distort:viewport=${frame}+0+0`,
    '-distort',
    'Perspective',
    control.join(' '),
    ')',
    '-compose',
    'Over',
    '-composite',
    // A faint haze over the whole photo, then uneven indoor light.
    '(',
    '-size',
    frame,
    `xc:rgba(255,255,255,${f(params.wash)})`,
    ')',
    '-compose',
    'Over',
    '-composite',
    '(',
    '-size',
    frame,
    'xc:',
    '-sparse-color',
    'Bilinear',
    `0,0 ${l0} ${FRAME.w - 1},0 ${l1} 0,${FRAME.h - 1} ${l2} ${FRAME.w - 1},${FRAME.h - 1} ${l3}`,
    ')',
    '-compose',
    'Multiply',
    '-composite',
    '-alpha',
    'off',
  ];

  if (params.warm)
    out.push(
      '-channel',
      'R',
      '-evaluate',
      'multiply',
      '1.07',
      '-channel',
      'B',
      '-evaluate',
      'multiply',
      '0.85',
      '+channel',
    );

  if (params.blur > 0.05) out.push('-blur', `0x${f(params.blur)}`);
  out.push('-seed', String(params.seed + 3), '-attenuate', f(params.noise).toString(), '+noise', 'Gaussian');
  out.push('-sampling-factor', '4:2:0', '-quality', String(params.quality), photo.file);
  await run('magick', out, { maxBuffer: 1 << 24 });
  fs.rmSync(tmp, { recursive: true, force: true });
}

function printed(language, card) {
  const set = setMaps[language].get(setOf(card.id));
  const promo = set && /promo|プロモ|特典/i.test(set.name);

  if (promo)
    return /^\d+$/.test(card.localId)
      ? language === 'en'
        ? `${set.abbreviation ?? set.id.toUpperCase()} ${card.localId}`
        : `${card.localId}/${set.id}`
      : card.localId;

  return `${set?.abbreviation ? `${set.abbreviation} ` : ''}${card.localId}/${set?.cardCount.official ?? '?'}`;
}

async function pool(items, size, worker) {
  let next = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (next < items.length) {
        const i = next++;
        await worker(items[i], i);
      }
    }),
  );
}

async function main() {
  for (const dir of ['art', 'photos', 'tmp']) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
  const { picks, fillers } = await sample();
  console.log(`sampled ${picks.length} cards (+${fillers.length} fillers)`);
  const neighbours = [...picks, ...fillers];
  const photos = [];

  picks.forEach((pick, i) => {
    const id = `s${String(i + 1).padStart(3, '0')}-${pick.language}-${pick.card.id.replace(/[^A-Za-z0-9.-]/g, '_')}`;
    const layout = plan(i, pick, neighbours);
    const q = layout.quad.map(([x, y]) => [Number((x / FRAME.w).toFixed(4)), Number((y / FRAME.h).toFixed(4))]);

    const xs = q.map((p) => p[0]),
      ys = q.map((p) => p[1]);

    photos.push({
      id,
      file: path.join(OUT, 'photos', `${id}.jpg`),
      kind: 'synthetic',
      category: pick.category,
      note: pick.note,
      expected: {
        id: pick.card.id,
        language: pick.language,
        name: pick.card.name,
        localId: pick.card.localId,
        printed: printed(pick.language, pick.card),
        kind: kindOf(pick.language, pick.card),
      },
      hard: layout.params.hard,
      params: Object.fromEntries(
        Object.entries(layout.params).map(([k, v]) => [k, Number.isFinite(v) ? Number(v.toFixed(5)) : v]),
      ),
      neighbours: layout.pockets
        .filter(
          (p) =>
            !p.target && Math.abs(p.row - layout.grid.target[0]) <= 1 && Math.abs(p.col - layout.grid.target[1]) <= 1,
        )
        .map((p) => p.id),
      truth: {
        quad: q,
        bbox: [
          Math.min(...xs),
          Math.min(...ys),
          Math.max(...xs) - Math.min(...xs),
          Math.max(...ys) - Math.min(...ys),
        ].map((v) => Number(v.toFixed(4))),
      },
      _layout: layout,
    });
  });

  for (const real of REAL_PHOTOS) {
    const source = path.join(REAL, `${real.stem}.jpg`);

    if (!fs.existsSync(source)) {
      console.warn(`missing real photo ${source}`);
      continue;
    }

    const file = path.join(OUT, 'photos', `real-${real.stem}.jpg`);
    fs.copyFileSync(source, file);
    const card = catalogs[real.language].find((c) => c.id === real.id);
    photos.push({
      id: `real-${real.stem}`,
      file,
      kind: 'real',
      category: 'real',
      expected: {
        id: real.id,
        language: real.language,
        name: card?.name,
        localId: card?.localId,
        printed: card && printed(real.language, card),
        kind: card && kindOf(real.language, card),
      },
      hard: false,
      truth: null,
    });
  }

  const limit = Number(args.limit ?? Infinity);
  const todo = photos.filter((p, i) => p.kind === 'synthetic' && i < limit && (!args.only || p.id.includes(args.only)));
  let done = 0;
  await pool(todo, JOBS, async (photo) => {
    await render(photo, photo._layout, path.join(OUT, 'tmp', photo.id));
    done++;

    if (done % 10 === 0 || done === todo.length) console.log(`rendered ${done}/${todo.length}`);
  });
  fs.rmSync(path.join(OUT, 'tmp'), { recursive: true, force: true });

  for (const p of photos) delete p._layout;

  const manifest = {
    version: 1,
    seed: SEED,
    generatedAt: new Date().toISOString(),
    repo: REPO,
    frame: [FRAME.w, FRAME.h],
    photos,
  };

  if (!args.only && !args.limit) fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2));
  else fs.writeFileSync(path.join(OUT, 'manifest.partial.json'), JSON.stringify(manifest, null, 2));
  console.log(`wrote ${photos.length} photos to ${path.join(OUT, 'photos')}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
