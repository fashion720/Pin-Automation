# Pinterest template refresh — production fix

## What changed
- Replaced the previous placeholder-heavy built-in template geometry with 14 production Pinterest compositions.
- Built-in generated pins no longer use template PNGs as a background. Preview PNGs are UI-only; generated pins start from a clean canvas and place article photography into every image slot.
- Every built-in layout fills the full 1000x1500 canvas with 1–4 article images. Text, CTA and site text are overlays, not empty reserved panels.
- Centre-banner layouts now reserve a real banner band between photo groups instead of putting the banner over the middle of four photos.
- Hero layouts use full-bleed photography.
- CTA buttons are larger and readable; footer/site text is 25px and bold by default.
- Create Post now has a Website / Brand text field. Its value is rendered at the bottom of every generated pin instead of the hard-coded `YOUR SITE` label.
- Gemini overlay hooks are constrained to 4–8 words and must be article-specific. The renderer never truncates a word with an ellipsis; it reduces typography size to fit whole words inside the headline box.
- Automatic visual rotation is now template-safe: it changes palette, typography, banner shape and small dimensions derived from the current template, rather than applying coordinates from another layout.
- Custom templates remain supported; only built-in templates use the new clean-canvas renderer.

## Pinterest design rationale
Pinterest recommends a vertical 2:3 / 1000x1500 canvas, clear branding, concise messaging and a visual-first composition. The new layouts follow those constraints while keeping photography dominant.


## Contrast polish (2026-08-30)
- CTA text is always checked against its final button background; low-contrast saved overrides are corrected at render time.
- Headline text is also protected from low contrast against its banner.
- Website/brand text is now rendered in a professional dark rounded footer badge with centered text.
