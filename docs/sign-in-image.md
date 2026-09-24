# Bundled images

## `counter-bg.jpg` — the sign-in background

A photograph of a supermarket checkout hall, sitting behind the illustrated
terminal on the sign-in page.

**Swap it for a photograph of your own shop and nothing in the code changes** —
keep the filename. It is served from `/assets/counter-bg.jpg` and referenced
once, in `src/components/AuthView.tsx`.

If you do replace it, match the treatment: a wide landscape frame, blurred and
darkened before it ships. The blur is baked into the file rather than applied in
CSS for two reasons — it keeps the asset at ~66 KB for an installer that has to
work offline, and it means no shop's branding and nobody's face is legible on a
screen that is not theirs.

Source: "Belle Etoile, Bartreng, Cactus, Keesen, Juli 2025" by Bdx, via
Wikimedia Commons, dedicated to the public domain under CC0 1.0. No attribution
is required; it is recorded here for provenance. Cropped to 1600x871, blurred,
desaturated and darkened.
