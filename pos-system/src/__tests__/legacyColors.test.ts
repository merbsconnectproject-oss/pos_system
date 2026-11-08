import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAccentScale, hexToChannels } from '../accent';
import { OUT, THEME, accentOpacityClasses, legacyBrowsersCss, oklchToHex, readSources } from '../gen-legacy-css';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');

// A counter PC on an unpatched Windows image ran a browser older than
// Chrome/Edge 111 and Firefox 113. The dashboard's dark metric cards lost their
// background, and accent glows and tints turned solid orange.
describe('colours on browsers older than Chrome/Edge 111 and Firefox 113', () => {
  it('converts oklch to the sRGB hex Tailwind documents', () => {
    expect(oklchToHex(12.9, 0.042, 264.695)).toBe('#020618'); // slate-950
    expect(oklchToHex(100, 0, 0)).toBe('#ffffff');
    expect(oklchToHex(0, 0, 0)).toBe('#000000');
  });

  it('ships a current legacy stylesheet', () => {
    const expected = legacyBrowsersCss(readFileSync(THEME, 'utf8'), readSources());
    expect(readFileSync(OUT, 'utf8'), 'stale: run npm run gen:legacy-css').toBe(expected);
    expect(expected).toContain('@supports not (color: oklch(0% 0 0))');
    expect(expected).toContain('--color-slate-950: #020618;');
    expect(expected).not.toMatch(/--color-[a-z]+-\d+: oklch\(/);
    expect(expected).toContain('.shadow-accent-500\\/20 { --tw-shadow-color: rgb(var(--accent-500-rgb) / 0.2); }');
    expect(expected).toContain('.bg-gradient-to-r, .bg-linear-to-r { --tw-gradient-position: to right; }');
  });

  it('loads it with the stylesheet', () => {
    expect(css).toMatch(/^@import "tailwindcss";\n@import "\.\/legacy-browsers\.css";/);
  });

  it('finds accent opacity classes with their variants, and refuses ones it cannot express', () => {
    expect(accentOpacityClasses(['"p-2 focus:ring-accent-500/20 bg-accent-50/40"'])).toEqual([
      'bg-accent-50/40',
      'focus:ring-accent-500/20',
    ]);
    expect(() => accentOpacityClasses(['group-hover:bg-accent-500/20'])).toThrow(/group-hover/);
  });

  it('tints the accent without color-mix()', () => {
    // The build turns color-mix(in srgb, var(--accent) 8%, …) into a fallback
    // of the full accent, so an old browser painted solid orange row hovers,
    // focus rings and a page-wide glow.
    const rules = css.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(rules).not.toContain('color-mix(');
    expect(rules).toContain('--accent-rgb: 197 82 0;');
    expect(buildAccentScale('#c55200')?.channels).toBe('197 82 0');
    expect(hexToChannels('#abc')).toBe('170 187 204');
  });

  it('defines channels for every default accent shade', () => {
    const shades = [...css.matchAll(/--accent-(\d+): #([0-9a-f]{6});/g)];
    expect(shades).toHaveLength(10);
    for (const [, stop, hex] of shades) {
      expect(css).toContain(`--accent-${stop}-rgb: ${hexToChannels(hex)};`);
    }
  });
});
