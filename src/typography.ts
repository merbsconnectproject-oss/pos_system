import type { GeneralSettings } from './types';

export type FontFamily = GeneralSettings['fontFamily'];

/** Fixed stacks keep appearance settings safe and usable while offline. */
export const FONT_CHOICES: ReadonlyArray<{
  key: FontFamily;
  label: string;
  description: string;
  stack: string;
}> = [
  {
    key: 'JAKARTA',
    label: 'Jakarta',
    description: 'Current modern look',
    stack: "'Plus Jakarta Sans', system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  {
    key: 'SYSTEM',
    label: 'System',
    description: 'Fast and familiar',
    stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  { key: 'ARIAL', label: 'Arial', description: 'Clean and compact', stack: "Arial, Helvetica, sans-serif" },
  { key: 'VERDANA', label: 'Verdana', description: 'Wide and very readable', stack: "Verdana, Geneva, sans-serif" },
  { key: 'GEORGIA', label: 'Georgia', description: 'Traditional serif', stack: "Georgia, 'Times New Roman', serif" },
];

export const applyTypography = (fontFamily: FontFamily, scalePercent: number) => {
  const choice = FONT_CHOICES.find((item) => item.key === fontFamily) ?? FONT_CHOICES[0];
  const safeScale = Math.min(130, Math.max(90, scalePercent));
  document.documentElement.style.setProperty('--font-sans', choice.stack);
  document.documentElement.style.setProperty('--ui-scale', String(safeScale / 100));
  document.documentElement.style.fontSize = `${15.5 * safeScale / 100}px`;
};
