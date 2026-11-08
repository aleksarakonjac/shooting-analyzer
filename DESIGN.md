---
name: Dnevnik streljaštva
description: Range Hall Lane Board. Concrete ground, black enamel lane plates, one orange flag.
colors:
  ground: "#e9ebec"
  ground-raised: "#f4f5f6"
  ground-sunk: "#dcdfe1"
  ink: "#14181b"
  ink-muted: "#4a5359"
  rule: "#b9bfc3"
  flag: "#ff5a1f"
  hazard: "#f2d400"
  data: "#1f5fbf"
  data-ink: "#174a96"
typography:
  display:
    fontFamily: "Big Shoulders, Arial Narrow, sans-serif"
    fontSize: "clamp(2rem, 4vw + 1rem, 3.25rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "0.01em"
  plate-numeral:
    fontFamily: "Big Shoulders Stencil, Big Shoulders, sans-serif"
    fontSize: "clamp(2.5rem, 6vw, 4.25rem)"
    fontWeight: 800
    lineHeight: 1
  body:
    fontFamily: "Barlow, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  plate: "2px"
spacing:
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground-raised}"
    rounded: "{rounded.plate}"
    padding: "8px 18px"
    height: "44px"
  lane-plate:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground-raised}"
    rounded: "{rounded.plate}"
    padding: "12px 16px 16px"
  flag-badge-proposed:
    backgroundColor: "{colors.flag}"
    textColor: "{colors.ink}"
    rounded: "{rounded.plate}"
  flag-badge-confirmed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.ground-raised}"
    rounded: "{rounded.plate}"
---

# Design System: Dnevnik streljaštva

## Overview

**Creative North Star: Range Hall Lane Board.** The ISSF shooting hall supplies the type, palette and density: painted concrete, black enamel lane plates with stencilled numerals, signal hatching. The interface is for shooters and coaches at a range or at a laptop afterwards, in bright light; light ground only, no dark mode. Mode is Operate: scanability and consistency outrank expression, and the brand lives in a few precise details.

Rejected: neon/gamer styling, tiny dense UI, empty decorative layouts.

## Colors

Colour fills large flat regions (the black rail, the black plates); it is not sprinkled as accents.

- **Ground concrete** (`#e9ebec`): page. **Raised** (`#f4f5f6`) for inputs; **sunk** (`#dcdfe1`) for wells.
- **Enamel ink** (`#14181b`): text, the side rail, lane plates, primary buttons.
- **Chamber-flag orange** (`#ff5a1f`): means exactly one thing, "proposed, awaiting your confirmation". Also the brand notch and the active-tab marker. Text on orange is ink, never white.
- **Hi-vis yellow** (`#f2d400`): warnings and alerts, with an ink border; the focus ring on the black rail.
- **Data blue** (`#1f5fbf`, as text `#174a96`): the single data colour and links.

State is never colour alone: every state also has a word and a form (see Components).

## Typography

- **Display and titles:** Big Shoulders (condensed signage), uppercase, for page titles and the brand.
- **Lane-plate numerals:** Big Shoulders Stencil. Reserved for key figures.
- **Body and UI:** Barlow; tabular numerals (`.num`) wherever figures are compared.
- Body measure up to 70ch. Serbian Latin diacritics (č ć š ž đ) are loaded through the latin-ext subset.

## Layout

Desktop: a 15rem black side rail plus content; content blocks left-aligned, max 64rem, forms 40rem. Phone (≤720px): the same markup becomes a fixed bottom bar with icon-over-label items (min 64px tall), orange top rule, content padded for it. Gutter is `clamp(1rem, 4vw, 2.5rem)`. Spacing is a 4px-based scale; more space above a heading than below it.

## Elevation & Depth

Almost flat. Only lane plates carry a soft offset shadow (`0 1px 2px` plus `0 6px 14px -6px`). No glows, no hard offset shadows.

## Shapes

Square-cornered enamel: radius 2px everywhere. Borders are 2px solid ink on controls.

## Components

- **App shell:** black rail with the brand (orange left notch); nav items with authored 1.75-stroke icons; the current page is shown by a ground-coloured block (desktop) or an orange top marker (phone). Skip link first.
- **Lane plate:** black plate, small uppercase label, large stencil numeral, optional unit. The key-figure form.
- **Flag badge:** `proposed` is orange with a dashed edge, a pennant icon and the word "Predloženo"; `confirmed` is black with a solid edge, a check icon and "Potvrđeno".
- **State line:** a rule plus a word. `live` solid blue, `pending` dashed orange-brown, `stale` half-thickness grey, `disabled` hairline with struck-through text.
- **Period tabs:** segmented control, selected = black with `aria-current`.
- **Inputs and buttons:** 44px minimum height, 2px ink border; primary button is a black plate; alerts are yellow with an ink border.

## Do's and Don'ts

- Do keep orange for "proposed, awaiting confirmation" only.
- Do pair every state colour with a word and a form.
- Do use lane plates for the few numbers that matter; keep the rest as plain text.
- Don't add a dark theme, gradients, glass, or coloured side-stripes on cards.
- Don't use a system display face for titles or numerals.
- Don't put an eyebrow label above a heading.
