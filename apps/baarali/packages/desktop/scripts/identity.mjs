#!/usr/bin/env node
// BAARALI(07/11/2026): Baarali's sign, every file from one source
// (control/src/b-mark.ts), as OpenBaara's kit is made from its own
// (openbaara/src/lib/brand.ts, `npm run brand:kit`). Change the drawing
// there, then run this; never retouch the files one by one.
//
//   node scripts/identity.mjs                 the app's files (assets/...)
//   node scripts/identity.mjs --kit <folder>  also the identity kit to hand out
//
// PNG rendering needs @resvg/resvg-js. It is not a dependency of the app:
// point BRAND_TOOLS at a node_modules that has it (OpenBaara's site does):
//   BRAND_TOOLS=~/openbaara/openbaara/node_modules node scripts/identity.mjs
// The .icns needs macOS (iconutil).

import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { INK, PAPER, bSvg, lockupSvg, wordSvg } from '../../control/src/b-mark.ts';

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, '..');
const repo = resolve(desktop, '../../../..');
const mobileBrand = join(repo, 'apps/x/apps/mobile/assets/brand');

function resvg() {
  for (const base of [process.env.BRAND_TOOLS && join(process.env.BRAND_TOOLS, 'x.js'), import.meta.url].filter(Boolean)) {
    try {
      return createRequire(base)('@resvg/resvg-js').Resvg;
    } catch {
      // next
    }
  }
  console.error('identity: @resvg/resvg-js not found. Set BRAND_TOOLS to a node_modules that has it.');
  process.exit(1);
}
const Resvg = resvg();

const png = (svg, width) => new Resvg(svg, { fitTo: { mode: 'width', value: width } }).render().asPng();
const put = (path, data) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};

/** An .ico holding PNGs (Windows Vista and later read them). */
function ico(svgAt) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((s) => png(svgAt(s), s));
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(s >= 256 ? 0 : s, e);
    head.writeUInt8(s >= 256 ? 0 : s, e + 1);
    head.writeUInt16LE(1, e + 4);
    head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(images[i].length, e + 8);
    head.writeUInt32LE(offset, e + 12);
    offset += images[i].length;
  });
  return Buffer.concat([head, ...images]);
}

function icns(svg, out) {
  const dir = mkdtempSync(join(tmpdir(), 'baarali-icon-'));
  const set = join(dir, 'icon.iconset');
  mkdirSync(set);
  for (const s of [16, 32, 128, 256, 512]) {
    writeFileSync(join(set, `icon_${s}x${s}.png`), png(svg, s));
    writeFileSync(join(set, `icon_${s}x${s}@2x.png`), png(svg, s * 2));
  }
  try {
    execFileSync('iconutil', ['-c', 'icns', set, '-o', out]);
  } catch {
    console.warn('identity: iconutil unavailable, icon.icns left as it was');
  }
  rmSync(dir, { recursive: true, force: true });
}

// The tiles. iOS and Android draw their own corners: their icons are full
// squares. The desktop icons keep macOS's grid (824 px in 1024, radius 185).
const tileBlack = (size, radius = 0, pad = 0.24) => bSvg({ size, body: PAPER, tile: INK, pad, radius });
const tileWhite = (size, radius = 0, pad = 0.24) => bSvg({ size, body: INK, tile: PAPER, pad, radius });
const macIcon = (size) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 1024 1024">` +
  `<rect x="100" y="100" width="824" height="824" rx="185" fill="${INK}"/>` +
  bSvg({ size: 824, body: PAPER, pad: 0.24 }).replace('<svg ', '<svg x="100" y="100" ') +
  '</svg>';

// ── The app's own files ──────────────────────────────────────────────
const a = (p) => join(desktop, 'assets', p);
put(a('brand/mark.svg'), bSvg({ size: 1024, pad: 0.04 }));
put(a('brand/icon-noir.svg'), tileBlack(1024, 0.225));
put(a('brand/icon-blanc.svg'), tileWhite(1024, 0.225));
put(a('brand/wordmark.svg'), wordSvg({ height: 142 }));
put(a('logo.svg'), tileBlack(1024, 0.225));
put(a('icon.svg'), macIcon(1024));
put(a('icon.png'), png(macIcon(1024), 1024));
put(a('icon.ico'), ico((s) => tileBlack(s, 0.2, 0.18)));
icns(macIcon(1024), a('icon.icns'));
put(a('logo-only.png'), png(bSvg({ size: 800, pad: 0.04 }), 800));

put(a('mobile/icon.png'), png(tileBlack(1024), 1024));
// Shown on #0A0A0A (brand.mjs, expo-splash-screen) at 140 pt.
put(a('mobile/splash-icon.png'), png(bSvg({ size: 1024, body: PAPER, pad: 0.04 }), 1024));
// Android: the foreground keeps to the adaptive icon's safe circle (66 %).
put(a('mobile/android-icon-foreground.png'), png(bSvg({ size: 1024, body: PAPER, pad: 0.31 }), 1024));
put(a('mobile/android-icon-monochrome.png'), png(bSvg({ size: 1024, body: PAPER, pad: 0.31 }), 1024));
put(a('mobile/baarali-mark.png'), png(bSvg({ size: 512, pad: 0.04 }), 512));
put(a('mobile/baarali-tile.png'), png(tileBlack(288, 0.225), 288));
put(join(mobileBrand, 'wordmark-dark.svg'), wordSvg({ height: 71, color: INK }));
put(join(mobileBrand, 'wordmark-light.svg'), wordSvg({ height: 71, color: PAPER }));
console.log('identity: app files written');

// ── The kit to hand out ─────────────────────────────────────────────
const at = process.argv.indexOf('--kit');
if (at > 0) {
  const kit = resolve(process.argv[at + 1] ?? 'Baarali-identite');
  const k = (p) => join(kit, p);
  const variants = { noir: [INK, null], blanc: [PAPER, null] };
  for (const [name, [color]] of Object.entries(variants)) {
    const mark = bSvg({ size: 512, body: color, pad: 0.04 });
    const lockup = lockupSvg({ height: 200, color });
    const word = wordSvg({ height: 142, color });
    put(k(`01-logo/svg/baarali-symbole-${name}.svg`), mark);
    put(k(`01-logo/svg/baarali-horizontal-${name}.svg`), lockup);
    put(k(`01-logo/svg/baarali-nom-${name}.svg`), word);
    put(k(`01-logo/png-transparent/baarali-symbole-${name}-1024.png`), png(mark, 1024));
    put(k(`01-logo/png-transparent/baarali-horizontal-${name}-2000.png`), png(lockup, 2000));
  }
  put(k('01-logo/png-sur-fond/baarali-symbole-fond-noir-1024.png'), png(tileBlack(1024, 0, 0.2), 1024));
  put(k('01-logo/png-sur-fond/baarali-symbole-fond-blanc-1024.png'), png(tileWhite(1024, 0, 0.2), 1024));
  put(k('01-logo/png-sur-fond/baarali-horizontal-fond-noir-2400.png'), png(lockupSvg({ height: 200, color: PAPER, background: INK }).replace(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/, (_, x, y, w, h) => `viewBox="${+x - 40} ${+y - 40} ${+w + 80} ${+h + 80}"`).replace(/<rect x="0" y="([-\d.]+)" width="([\d.]+)" height="([\d.]+)"/, (_, y, w, h) => `<rect x="-40" y="${+y - 40}" width="${+w + 80}" height="${+h + 80}"`), 2400));
  put(k('02-icones/icon.svg'), tileBlack(48, 0.225, 0.18));
  put(k('02-icones/favicon.ico'), ico((s) => tileBlack(s, 0.2, 0.18)));
  for (const s of [1024, 512, 192]) put(k(`02-icones/icone-application-${s}.png`), png(tileBlack(s), s));
  put(k('02-icones/icone-apple-180.png'), png(tileBlack(180), 180));
  put(k('03-reseaux-sociaux/photo-de-profil-fond-noir.png'), png(tileBlack(800, 0, 0.26), 800));
  put(k('03-reseaux-sociaux/photo-de-profil-fond-blanc.png'), png(tileWhite(800, 0, 0.26), 800));
  console.log(`identity: kit written to ${kit}`);
}
