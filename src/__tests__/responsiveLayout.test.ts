import { readFileSync, readdirSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTypography } from '../typography';

const css = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const typography = readFileSync(new URL('../typography.ts', import.meta.url), 'utf8');
const posModal = readFileSync(new URL('../components/PosModal.tsx', import.meta.url), 'utf8');

const componentRoot = new URL('../components/', import.meta.url);
const componentFiles = readdirSync(componentRoot)
  .filter((name) => name.endsWith('.tsx'))
  .map((name) => new URL(name, componentRoot));
const overlaySources = [new URL('../App.tsx', import.meta.url), ...componentFiles]
  .map((file) => readFileSync(file, 'utf8'))
  .join('\n');

describe('responsive AppWindow layout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'document');
  });

  it('constrains every centred overlay to the live dynamic viewport', () => {
    expect(css).toContain('.fixed.inset-0.items-center > :first-child');
    expect(css).toContain('max-height: calc(100dvh - var(--modal-gutter) - var(--modal-gutter))');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('align-items: safe center');
    const sharedPanelRule = css.match(/\.fixed\.inset-0\.items-center > :first-child \{([\s\S]*?)\}/)?.[1] || '';
    expect(sharedPanelRule).not.toContain('max-width:');

    const literalOverlays = Array.from(
      overlaySources.matchAll(/['"]([^'"]*fixed inset-0[^'"]*)['"]/g),
      (match) => match[1],
    );
    const centred = literalOverlays.filter((classes) => classes.includes('items-center'));
    expect(centred.length).toBeGreaterThanOrEqual(35);

    // Every full-screen flex overlay must be deliberately centred, edge-docked,
    // top-aligned, responsive-only, or the POS's explicit maximized/sheet mode.
    const accidental = literalOverlays.filter((classes) => {
      if (!classes.includes(' flex')) return false;
      return !classes.includes('items-center')
        && !classes.includes('justify-end')
        && !classes.includes('items-start')
        && !classes.includes('md:hidden')
        && !classes.includes('lg:relative')
        && !(classes.includes('z-60') && classes.includes('animate-modal-backdrop'));
    });
    expect(accidental).toEqual([]);
  });

  it('responds to the modal width instead of only the application window', () => {
    expect(css).toContain('container-type: inline-size');
    expect(css).toContain('@container (max-width: 25rem)');
    expect(css).toContain('[class*="md:grid-cols-"]');
    expect(css).toContain('grid-template-columns: minmax(0, 1fr) !important');
  });

  it('carries the selected font scale into responsive chrome', () => {
    expect(typography).toContain("setProperty('--ui-scale', String(safeScale / 100))");
    expect(typography).toContain('Math.min(130, Math.max(90, scalePercent))');

    const setProperty = vi.fn();
    vi.stubGlobal('document', { documentElement: { style: { setProperty }, fontSize: '' } });
    applyTypography('SYSTEM', 200);

    expect(setProperty).toHaveBeenCalledWith('--ui-scale', '1.3');
    expect(document.documentElement.style.fontSize).toBe('20.15px');
  });

  it('keeps short AppWindow viewports top-aligned and drawers within the screen', () => {
    expect(css).toContain('@media (max-height: 48rem)');
    expect(css).toContain('.ui-command-layer > .animate-command-palette');
    expect(css).toContain('.fixed.inset-0.justify-end');
    expect(css).toContain('max-width: 100vw');
  });

  it('keeps the POS search full-width with an explicit readable text colour', () => {
    expect(posModal).toContain('aria-label="Search products by name, SKU, or barcode"');
    expect(posModal).toContain('block w-full min-w-0');
    expect(posModal).toContain('text-slate-900 caret-accent-600');
    expect(posModal).not.toContain('sm:max-w-[28rem] lg:max-w-[34rem]');
  });

  it('preserves the normal POS window aspect ratio instead of stretching its width', () => {
    expect(posModal).toContain('ui-pos-window-normal rounded-xl');
    expect(css).toContain('.ui-pos-window-normal');
    expect(css).toContain('aspect-ratio: 16 / 9');
    expect(css).toContain('width: min(96vw, 1550px, 165dvh)');
  });
});
