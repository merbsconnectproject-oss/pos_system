# Design System Snapshot

Date: 2026-09-09

This snapshot records the current application design system as implemented in the project. It is the baseline for future screen-by-screen conformance checks against `SCREEN-INVENTORY.md`, `PRD (1).md`, and `CHECKLIST.md`.

## Implementation Stack

- React 19 application built with Vite 6.
- Tailwind CSS v4 via `@tailwindcss/vite`.
- Icons from `lucide-react`.
- Global design tokens and base typography live in `src/index.css`.
- Component styling is currently expressed primarily through Tailwind utility classes inside React components.

## Core Tokens

- Primary accent: `#c55200`, exposed as `--accent`, `--primary-accent`, and chart series 1.
- Accent hover: `#b14900`.
- Accent active: `#9f4100`.
- Canvas: `#f8fafc`.
- Paper: `#ffffff`.
- Sunken surface: `#f1f5f9`.
- Primary ink: `#0f172a`.
- Muted ink: `#475569`.
- Subtle ink: `#64748b`.
- Border: `#e2e8f0`.
- Strong border: `#cbd5e1`.

## Typography

- Sans family: `Plus Jakarta Sans`, then system fallbacks.
- Mono family: `JetBrains Mono`, then system monospace fallbacks.
- Money, SKU, receipt numbers, and technical IDs use tabular mono figures where appropriate.
- Global letter spacing is normalized to `0`, with heading exceptions already defined in `src/index.css`.

## Radius Scale

- The app overrides Tailwind radii to tighter values.
- Frequent component radius usage:
  - Inputs/buttons: `rounded-lg` or `rounded-xl`.
  - Cards/modals: `rounded-xl` or `rounded-2xl`.
  - Small media and badges: `rounded`, `rounded-lg`, or `rounded-full`.

## Color Usage Rules Currently Applied

- Orange is the brand accent and should be reserved for primary actions, active navigation, focal indicators, and small brand accents.
- Slate/white surfaces are the default structural palette.
- Green, amber, and red are semantic only: success/profit, warning/low stock, and danger/error.
- Recent refinements removed saturated outlet card header blocks from the Multi-Outlet Comparison screen and standardized the POS product grid.

## Component Patterns

- App shell: persistent header, collapsible sidebar, content canvas.
- Sidebar: grouped navigation, active item uses orange accent.
- Header: active outlet selector, Add New primary action, POS shortcut, settings and user menu.
- Cards: white or slate surfaces with 1px slate borders.
- Tables: dense, small text, muted headers, clear right-aligned numeric columns.
- Modals/drawers: centered modal cards or right drawers with slate overlay and subtle animation classes.
- Empty states: centered icon, concise title, muted supporting text.
- POS product cards: 4:3 product media, neutral fallback icon surface, two-line titles, muted SKU metadata, prominent slate price.
- Digital receipt: bordered invoice card with header, itemized table, financial summary, and payment details sections.

## Known Design-System Gaps

- `CHECKLIST.md` still marks component CSS extraction from the datasheet into the app stylesheet as open.
- Some older screens still contain local color choices that need later section-by-section cleanup.
- There is no automated visual snapshot test suite yet.
