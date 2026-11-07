# Responsive layout and modal audit

Date: 2026-09-30
Scope: AppWindow and browser launch modes, 90–130% selected font scale

## What was audited

- 46 full-screen overlay instances across 28 source files.
- 37 centred dialogs, confirmations, printable previews, and POS sub-dialogs.
- 9 drawers, sheets, menus, and backdrops that deliberately use edge-aligned layouts.
- All 25 data tables and their nearest overflow boundary.
- Application-shell flex/grid shrink behaviour, fixed-width panels, images, charts, and long identifiers.
- The runtime typography setting in `src/typography.ts`.

## Findings

1. Most large dialogs used `max-h-[88vh]`, `max-h-[90vh]`, or `max-h-[92vh]`.
   These percentages did not reserve a reliable physical gutter and did not account for
   browser/AppWindow chrome or short laptop displays.
2. Several small dialogs and printable slips had no maximum height or vertical scroll
   boundary. At 120–130% text size, their first and last controls could leave the viewport.
3. A centred flex overlay can clip the top of an oversized child. Scrolling the backdrop
   does not make that clipped edge reachable unless safe alignment or a short-height
   top-aligned fallback is used.
4. Form grids responded to viewport breakpoints. A modal may be narrow while the underlying
   application viewport is wide, so two-to-four-column forms remained crowded inside it.
5. Three table containers (`Products` set-up tables and Settings backup history) allowed
   vertical scrolling or clipped overflow but did not provide horizontal scrolling.
6. The selected font size changed the root `rem` but exposed no explicit scale token for
   responsive chrome and future component calculations.
7. Drawers were generally sound, but a rem-based maximum width could grow past a very narrow
   viewport at the largest selected font size.

## Corrections

- Every centred fixed overlay now receives one shared dynamic-viewport contract:
  safe centring, an accessible backdrop scroll boundary, dynamic viewport height, physical
  gutters, contained overscroll, and stable scrollbar space. The shared contract does not
  override a dialog's designed maximum width.
- Short viewports (up to 48rem high) top-align dialogs with a compact gutter, preventing the
  top edge from becoming unreachable.
- The intentionally top-aligned global search palette uses its own dynamic-height boundary;
  its former 4–6rem top offset no longer consumes the usable space on short displays.
- Non-flex confirmation cards and printable slips scroll as a whole. Existing flex-column
  dialogs retain fixed headers/footers and their internal scrollable body.
- Each modal panel is an inline-size container. Responsive form grids collapse based on the
  panel's real width; because the threshold uses `rem`, larger selected text stacks sooner.
- Drawer width is capped at the live viewport.
- Workspace flex/grid children can shrink, and images/SVG/canvas content cannot widen the
  AppWindow.
- The normal POS terminal scales as a 16:9 frame constrained by both the available width and
  height, rather than stretching to the AppWindow width. Maximized mode remains full-screen.
- The POS catalogue search spans the available catalogue toolbar, while the cart uses a
  bounded viewport-relative width inside that proportional terminal frame.
- The POS quick-customer dialog now has an explicit flex column and scrollable content body.
- The three table overflow gaps now scroll in both axes where required.
- Modal and drawer animation respects `prefers-reduced-motion`.
- The typography runtime now publishes `--ui-scale` while retaining the existing 90–130%
  safety clamp.

## Verification matrix

The implementation is designed and statically pinned for these bounds:

| Viewport class | Representative size | Font settings |
|---|---:|---:|
| Compact laptop/AppWindow | 1024 × 600, 1280 × 720 | 90%, 100%, 120%, 130% |
| Standard desktop | 1366 × 768, 1440 × 900 | 90%, 100%, 120%, 130% |
| Large desktop | 1920 × 1080 | 100%, 130% |
| Narrow/mobile browser | 360 × 640, 390 × 844 | 100%, 130% |

The invariant is not that every dialog avoids scrolling. At high text scale on a short screen,
scrolling is the correct accessible behaviour. The invariant is that the title, content, close
control, and final action remain reachable without the application viewport widening.
