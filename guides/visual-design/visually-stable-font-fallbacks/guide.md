---
name: visually-stable-font-fallbacks
description: Define font styles such that text remains readable and visually consistent in the event that there's a swap between the preferred font and one of the fallbacks (or vice versa).
web-feature-ids:
  - font-size-adjust
---

# Visually Stable Font Fallbacks

When web fonts load, they often replace a fallback font that has different dimensions, even if both are set to the same `font-size`. This causes "layout shift" (Cumulative Layout Shift) and can make text illegible if the fallback's lowercase letters (x-height) are significantly different than the preferred font.

The `font-size-adjust` property normalizes the size of each font in the stack to one metric (usually the x-height), so lowercase text looks the same size whichever font is active. It matches only that one metric: glyph widths, line breaks and line heights can still differ, so it reduces layout shift but does not remove it. To match widths and vertical metrics as well, tune a fallback `@font-face` with `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` (see the fallback section below).

## Implementation steps

### 1. Measure the aspect value of your preferred font
To normalize fallbacks, you need the "aspect value" of your preferred web font: its x-height divided by the font size (for example, 0.545 for Verdana). Measure it once and write it into the CSS as a number, for example by matching two spans side by side in DevTools, by reading the font's `sxHeight` and `unitsPerEm` values, or with a calculator such as https://philipwalton.github.io/demos/font-size-adjust-calculator/.

Do not use `from-font` for swap stability. It takes the metric from the *first available font*, which is the font the browser can use right now: while the web font is still loading or after it fails, that is the fallback. The fallback is then normalized to its own x-height, which changes nothing, and the shift remains.

### 2. Apply font-size-adjust to the text container
Apply the property to the element or a parent container. If the preferred font fails to load or is still loading, the fallback is scaled to the preferred font's x-height. The preferred font itself is unchanged, because the number is its own aspect value.

```css
.text-content {
  /* Define your font stack as usual */
  font-family: "MyWebFont", "Arial", sans-serif;
  font-size: 1rem;

  /* MANDATORY: use the measured aspect value of "MyWebFont" (0.52 is an
     example). Arial is then scaled to the same x-height as MyWebFont. */
  font-size-adjust: 0.52;
}
```

### 3. (Optional) Adjust for specific metrics
While x-height is the default and most common, you can normalize by other metrics like `cap-height` (useful for all-caps headers) or `ch-width` (useful for monospaced fonts). Measure that metric of the preferred font in the same way.

```css
h1 {
  /* Cap height of the preferred font divided by its font size (example value) */
  font-size-adjust: cap-height 0.7;
}
```

### 4. Verify visual stability
Ensure that the `font-size-adjust` value correctly aligns the fallback. You can test this by temporarily blocking the web font or adjusting the `font-family` declaration in your browser's DevTools and verifying that lowercase letters keep the same height. Expect some change in line length: only the chosen metric is matched.

## Fallback strategies

{{ BASELINE_STATUS("font-size-adjust") }}

In browsers that do not support `font-size-adjust`, the font will be rendered at its default scale. This may result in layout shifts or changes in readability during font swaps. 

To mitigate this without `font-size-adjust`, or to also match widths and line heights, use the `@font-face` descriptors `size-adjust`, `ascent-override`, `descent-override` and `line-gap-override` on a local fallback face, though these are more complex to calculate than a single `font-size-adjust` value.
