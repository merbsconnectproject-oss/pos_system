/**
 * Accent colour — FR-SET-03, FR-SET-04, NFR-15.
 *
 * The accent is a single token. Everything accented in the UI resolves to the
 * `--accent-*` custom properties, so choosing a colour in Settings repaints every
 * accent surface and no component carries a hard-coded accent hex (NFR-15).
 *
 * Semantic colours — success, warning, danger — are fixed and never derived from
 * the accent (FR-SET-04).
 */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function hexToHsl(hex: string): Hsl | null {
  const clean = hex.trim().replace(/^#/, '');
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;

  const r = parseInt(full.slice(0, 2), 16) / 255;
  const g = parseInt(full.slice(2, 4), 16) / 255;
  const b = parseInt(full.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };

  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

function hslToHex({ h, s, l }: Hsl): string {
  const sat = clamp(s, 0, 100) / 100;
  const lum = clamp(l, 0, 100) / 100;
  const a = sat * Math.min(lum, 1 - lum);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = lum - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * value)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** Lightness stops for the 50 → 900 ramp, tuned to stay legible at both ends. */
const RAMP: Record<number, number> = {
  50: 97,
  100: 93,
  200: 85,
  300: 75,
  400: 64,
  500: 54,
  600: 46,
  700: 38,
  800: 30,
  900: 22,
};

/** WCAG-ish relative luminance, enough to pick black or white foreground (NFR-14). */
function readableForeground(hex: string): string {
  const clean = hex.replace(/^#/, '');
  const toLinear = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const r = toLinear(parseInt(clean.slice(0, 2), 16) / 255);
  const g = toLinear(parseInt(clean.slice(2, 4), 16) / 255);
  const b = toLinear(parseInt(clean.slice(4, 6), 16) / 255);
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.45 ? '#1f2937' : '#ffffff';
}

export interface AccentScale {
  base: string;
  shades: Record<number, string>;
  hover: string;
  active: string;
  foreground: string;
}

export function buildAccentScale(hex: string): AccentScale | null {
  const hsl = hexToHsl(hex);
  if (!hsl) return null;
  const shades: Record<number, string> = {};
  Object.entries(RAMP).forEach(([stop, lightness]) => {
    // Desaturate the palest stops slightly so tints do not read as neon.
    const saturation = Number(stop) <= 100 ? hsl.s * 0.75 : hsl.s;
    shades[Number(stop)] = hslToHex({ h: hsl.h, s: saturation, l: lightness });
  });
  return {
    base: hex,
    shades,
    hover: hslToHex({ h: hsl.h, s: hsl.s, l: clamp(hsl.l - 6, 0, 100) }),
    active: hslToHex({ h: hsl.h, s: hsl.s, l: clamp(hsl.l - 12, 0, 100) }),
    foreground: readableForeground(hex),
  };
}

/** The palette offered in Settings K-06. No blue, per the design system. */
export const ACCENT_PRESETS: { name: string; hex: string }[] = [
  { name: 'Orange', hex: '#c55200' },
  { name: 'Amber', hex: '#b45309' },
  { name: 'Crimson', hex: '#be123c' },
  { name: 'Plum', hex: '#86198f' },
  { name: 'Forest', hex: '#15803d' },
  { name: 'Teal', hex: '#0f766e' },
  { name: 'Graphite', hex: '#44403c' },
];

export const DEFAULT_ACCENT = ACCENT_PRESETS[0].hex;

/** Blue is not part of the palette (acceptance criterion 11). */
export function isBlue(hex: string): boolean {
  const hsl = hexToHsl(hex);
  if (!hsl) return false;
  return hsl.h >= 195 && hsl.h <= 260 && hsl.s > 15;
}

/** Writes the whole scale onto :root. One call repaints every accent surface. */
export function applyAccent(hex: string): boolean {
  const scale = buildAccentScale(hex);
  if (!scale) return false;
  const root = document.documentElement.style;
  root.setProperty('--accent', scale.base);
  root.setProperty('--accent-fg', scale.foreground);
  root.setProperty('--accent-hover', scale.hover);
  root.setProperty('--accent-active', scale.active);
  Object.entries(scale.shades).forEach(([stop, value]) => {
    root.setProperty(`--accent-${stop}`, value);
  });
  root.setProperty('--accent-soft', scale.shades[50]);
  root.setProperty('--accent-on-soft', scale.shades[800]);
  root.setProperty('--accent-border', scale.shades[200]);
  // Charts follow the accent; semantic series colours do not.
  root.setProperty('--chart-1', scale.base);
  return true;
}
