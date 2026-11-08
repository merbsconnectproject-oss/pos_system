/**
 * Old-browser stylesheet generator — run with `npm run gen:legacy-css`.
 *
 * Emits `src/legacy-browsers.css`. A counter PC on an unpatched Windows image
 * ran a browser older than Chrome/Edge 111 / Firefox 113, and Tailwind v4's
 * output degrades badly there:
 *
 *  - The palette is oklch() with no fallback, so `bg-slate-950` and every other
 *    palette colour resolves to nothing: the dashboard's dark metric cards
 *    showed white text on the page background.
 *  - An opacity modifier on a runtime colour (`shadow-accent-500/20`) is
 *    color-mix() with a fallback of the *full* colour, so soft accent glows and
 *    tints became solid orange.
 *  - `bg-gradient-to-*` interpolates `in oklab`, so gradients vanished.
 *
 * Each block is behind `@supports not (…)`, so a current browser keeps
 * Tailwind's exact output and only an old one takes these rules. Regenerate
 * after a Tailwind upgrade or after adding an accent opacity class; a test
 * fails while the file is stale.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const THEME = resolve(here, '../node_modules/tailwindcss/theme.css');
export const OUT = resolve(here, 'legacy-browsers.css');

/** oklch(L% C H) → #rrggbb, clipped to sRGB (Björn Ottosson's OKLab matrices). */
export function oklchToHex(lightnessPercent: number, chroma: number, hueDegrees: number): string {
  const L = lightnessPercent / 100;
  const h = (hueDegrees * Math.PI) / 180;
  const a = chroma * Math.cos(h);
  const b = chroma * Math.sin(h);

  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
  return (
    '#' +
    linear
      .map((value) => {
        const c = Math.min(1, Math.max(0, value));
        const encoded = c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
        const byte = Math.round(encoded * 255);
        return byte.toString(16).padStart(2, '0');
      })
      .join('')
  );
}

function paletteBlock(themeCss: string): string[] {
  // Achromatic greys spell their hue `none`; at zero chroma any hue is the same.
  const declarations = [
    ...themeCss.matchAll(/(--color-[a-z]+-\d+):\s*oklch\(([\d.]+)%\s+([\d.]+)\s+([\d.]+|none)\)/g),
  ].map(([, name, l, c, h]) => `    ${name}: ${oklchToHex(Number(l), Number(c), h === 'none' ? 0 : Number(h))};`);
  return ['@supports not (color: oklch(0% 0 0)) {', '  :root {', ...declarations, '  }', '}'];
}

/** What each utility prefix sets, for the accent opacity classes. */
const ACCENT_PROPERTIES: Record<string, string> = {
  bg: 'background-color',
  border: 'border-color',
  ring: '--tw-ring-color',
  shadow: '--tw-shadow-color',
  text: 'color',
};
/** Variants whose selector is the class plus a pseudo-class. */
const PSEUDO_VARIANTS = new Set(['hover', 'focus', 'focus-visible', 'active']);

/** Accent opacity classes in use, e.g. `focus:ring-accent-500/20`. */
export function accentOpacityClasses(sources: string[]): string[] {
  const pattern = /(?<![\w:-])((?:[a-z-]+:)?)(bg|border|ring|shadow|text)-accent-(\d+)\/(\d+)(?![\w/-])/g;
  const found = new Set<string>();
  for (const source of sources) {
    for (const [whole, variant] of source.matchAll(pattern)) {
      if (variant && !PSEUDO_VARIANTS.has(variant.slice(0, -1))) {
        throw new Error(`gen-legacy-css: no old-browser rule for variant "${variant}" in ${whole}`);
      }
      found.add(whole);
    }
  }
  return [...found].sort();
}

function accentBlock(classes: string[]): string[] {
  const rules = classes.map((name) => {
    const [, variant = '', utility, shade, alpha] = name.match(/^(?:([a-z-]+):)?([a-z]+)-accent-(\d+)\/(\d+)$/)!;
    const selector = `.${name.replace(/[:/]/g, (c) => `\\${c}`)}${variant ? `:${variant}` : ''}`;
    return `  ${selector} { ${ACCENT_PROPERTIES[utility]}: rgb(var(--accent-${shade}-rgb) / ${Number(alpha) / 100}); }`;
  });
  return ['@supports not (color: color-mix(in lab, red, red)) {', ...rules, '}'];
}

function gradientBlock(): string[] {
  const directions: Record<string, string> = {
    t: 'top', tr: 'top right', r: 'right', br: 'bottom right',
    b: 'bottom', bl: 'bottom left', l: 'left', tl: 'top left',
  };
  const rules = Object.entries(directions).map(
    ([short, long]) => `  .bg-gradient-to-${short}, .bg-linear-to-${short} { --tw-gradient-position: to ${long}; }`,
  );
  return ['@supports not (background-image: linear-gradient(in oklab, red, red)) {', ...rules, '}'];
}

export function legacyBrowsersCss(themeCss: string, sources: string[]): string {
  return [
    '/* Generated by src/gen-legacy-css.ts (npm run gen:legacy-css). Do not edit by hand. */',
    '/* Fallbacks for browsers older than Chrome/Edge 111 and Firefox 113; see the generator. */',
    '',
    ...paletteBlock(themeCss),
    '',
    ...accentBlock(accentOpacityClasses(sources)),
    '',
    ...gradientBlock(),
    '',
  ].join('\n');
}

/** Every .ts/.tsx under src/, where Tailwind finds its classes. */
export function readSources(root = here): string[] {
  return readdirSync(root, { recursive: true, withFileTypes: true })
    // Skip tests and this file, whose comments name example classes.
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !entry.parentPath.includes('__tests__'))
    .filter((entry) => resolve(entry.parentPath, entry.name) !== fileURLToPath(import.meta.url))
    .map((entry) => readFileSync(resolve(entry.parentPath, entry.name), 'utf8'));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(OUT, legacyBrowsersCss(readFileSync(THEME, 'utf8'), readSources()));
  console.log(`wrote ${OUT}`);
}
