import React from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  BatteryCharging,
  Cable,
  Construction,
  Drill,
  Droplets,
  Hammer,
  HardHat,
  Lightbulb,
  LockKeyhole,
  Package,
  PaintBucket,
  Plug,
  Ruler,
  ShieldCheck,
  Sun,
  Wrench,
  Zap,
} from 'lucide-react';

type CategoryStyle = {
  background: string;
  foreground: string;
  border: string;
};

type CategoryRule = CategoryStyle & {
  terms: string[];
  icon: LucideIcon;
};

/**
 * A restrained retail palette chosen by hand. Categories keep the same colour
 * everywhere; there are intentionally no gradients, generated imagery, or
 * random per-product colours.
 */
const CATEGORY_RULES: CategoryRule[] = [
  { terms: ['lighting', 'lamp', 'bulb', 'chandelier'], icon: Lightbulb, background: '#F2C94C', foreground: '#332600', border: '#D7AD31' },
  { terms: ['solar', 'inverter'], icon: Sun, background: '#E88932', foreground: '#321A06', border: '#C76B19' },
  { terms: ['cable', 'wire'], icon: Cable, background: '#A44A5B', foreground: '#FFFFFF', border: '#803443' },
  { terms: ['switch', 'socket', 'plug'], icon: Plug, background: '#3975A6', foreground: '#FFFFFF', border: '#28597F' },
  { terms: ['protection', 'breaker', 'fuse', 'surge'], icon: ShieldCheck, background: '#B6473E', foreground: '#FFFFFF', border: '#8E342E' },
  { terms: ['electrical', 'power'], icon: Zap, background: '#3E6383', foreground: '#FFFFFF', border: '#2C4962' },
  { terms: ['conduit', 'trunking', 'duct'], icon: Construction, background: '#54745A', foreground: '#FFFFFF', border: '#3B5741' },
  { terms: ['power tool', 'machinery', 'drill', 'machine'], icon: Drill, background: '#35475E', foreground: '#FFFFFF', border: '#263548' },
  { terms: ['hand tool', 'hardware', 'spanner', 'wrench'], icon: Wrench, background: '#A65B32', foreground: '#FFFFFF', border: '#824323' },
  { terms: ['paint', 'adhesive', 'finish'], icon: PaintBucket, background: '#B85D55', foreground: '#FFFFFF', border: '#91463F' },
  { terms: ['plumbing', 'sanitary', 'pipe', 'water'], icon: Droplets, background: '#2F7F83', foreground: '#FFFFFF', border: '#225F62' },
  { terms: ['fastener', 'fixing', 'screw', 'bolt', 'nail'], icon: Hammer, background: '#665486', foreground: '#FFFFFF', border: '#4D3C69' },
  { terms: ['safety', 'building', 'site'], icon: HardHat, background: '#D39A2F', foreground: '#302000', border: '#AD7920' },
  { terms: ['battery', 'backup', 'ups'], icon: BatteryCharging, background: '#47735C', foreground: '#FFFFFF', border: '#335742' },
  { terms: ['security', 'lock', 'access'], icon: LockKeyhole, background: '#555F73', foreground: '#FFFFFF', border: '#3D4658' },
  { terms: ['measure', 'level', 'ruler'], icon: Ruler, background: '#94723C', foreground: '#FFFFFF', border: '#70542B' },
];

const FALLBACK_STYLES: CategoryStyle[] = [
  { background: '#526D82', foreground: '#FFFFFF', border: '#3B5366' },
  { background: '#687A52', foreground: '#FFFFFF', border: '#4E603B' },
  { background: '#8A6046', foreground: '#FFFFFF', border: '#694733' },
  { background: '#6D5C78', foreground: '#FFFFFF', border: '#51435B' },
  { background: '#3E7471', foreground: '#FFFFFF', border: '#2D5856' },
];

const normalized = (category: string) => category.trim().toLocaleLowerCase();

export const productCategoryAppearance = (category: string): CategoryStyle & { icon: LucideIcon } => {
  const name = normalized(category);
  const match = CATEGORY_RULES.find((rule) => rule.terms.some((term) => name.includes(term)));
  if (match) return match;

  // Unknown merchant-created categories still receive a stable colour rather
  // than changing on reload. The palette is curated; only its selection is hashed.
  const hash = Array.from(name).reduce((value, character) => ((value * 31) + character.charCodeAt(0)) >>> 0, 0);
  return { ...FALLBACK_STYLES[hash % FALLBACK_STYLES.length], icon: Package };
};

interface ProductCategoryVisualProps {
  category: string;
  className?: string;
  iconClassName?: string;
  showLabel?: boolean;
}

export const ProductCategoryVisual: React.FC<ProductCategoryVisualProps> = ({
  category,
  className = '',
  iconClassName = 'h-6 w-6',
  showLabel = false,
}) => {
  const appearance = productCategoryAppearance(category);
  const Icon = appearance.icon;

  return (
    <div
      role="img"
      aria-label={`${category || 'General'} category`}
      className={`flex items-center justify-center overflow-hidden border ${className}`}
      style={{
        backgroundColor: appearance.background,
        color: appearance.foreground,
        borderColor: appearance.border,
      }}
    >
      <div className="flex min-w-0 flex-col items-center justify-center gap-2 p-2 text-center">
        <Icon aria-hidden="true" className={`${iconClassName} shrink-0`} strokeWidth={1.8} />
        {showLabel && (
          <span className="max-w-full text-[10px] font-black uppercase tracking-[0.12em] leading-tight">
            {category || 'General'}
          </span>
        )}
      </div>
    </div>
  );
};
