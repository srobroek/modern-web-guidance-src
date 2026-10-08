# `light-dark()` function

## Fallbacks

For browsers that support `color-scheme` but not yet `light-dark()`, light and dark versions of colors should first be defined as custom properties, and the `prefers-color-scheme` media query should be used to set colors for the respective mode like in the example below:

```css
:root {
  /* Define browser UI accent color for each mode */
  --brand-accent-light: #0056b3;
  --brand-accent-dark: #00e5ff;
  --accent-color: var(--brand-accent-light);

  /* MANDATORY: Automatically adapt native UI to user system preferences */
  color-scheme: light dark;

  /* Example inherited color property */
  accent-color: var(--accent-color);
}

/*
  MANDATORY: Keep these at-rules at the top level, not nested inside `:root`.
  Browsers old enough to lack light-dark() may also lack CSS nesting and would drop nested rules.
*/

/* MANDATORY: Fallback for browsers without light-dark support */
@media (prefers-color-scheme: dark) {
  :root {
    --accent-color: var(--brand-accent-dark);
  }
}

/* OPTIONAL: use light-dark() for more control of built-in UI colors */
@supports (color: light-dark(white, black)) {
  :root {
    --accent-color: light-dark(var(--brand-accent-light), var(--brand-accent-dark));
  }
}

pre, code {
  color-scheme: dark;

  /* **Mandatory**: any inherited color properties must be set again, even if to the same design tokens */
  accent-color: var(--accent-color);
}
```
