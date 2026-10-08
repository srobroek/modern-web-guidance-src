---
name: calculate-with-intrinsic-sizes
description: Calculate the size of an element based on its intrinsic size, while ensuring it fits within given design constraints.
web-feature-ids:
  - calc-size
  - interpolate-size
---

# Calculate With Intrinsic Sizes

`calc-size()` is a CSS function for performing mathematical operations on intrinsic sizing keywords like `auto`, `min-content`, and `fit-content`. Use it only when an intrinsic size needs a calculation or constraint. For a plain keyword transition (e.g., `0` to `auto`), use `interpolate-size: allow-keywords` instead; see {{ GUIDE_REF("animate-to-intrinsic-sizes") }}.

`interpolate-size` is inherited, so set it on the component that animates, or on `:root` when keyword transitions should work across the whole site:

```css
:root {
  interpolate-size: allow-keywords; /* height: 0 ↔ height: auto now transitions without calc-size() */
}
```

## Implementation Steps

1. **Identify the Intrinsic Basis**: Determine which intrinsic keyword (`auto`, `min-content`, etc.) should form the base of your calculation.
2. **Define Constraints**: Use CSS math functions like `clamp()`, `min()`, or `max()` within the second argument to enforce design constraints on the intrinsic size.
3. **Provide a Fallback**: Declare a standard sizing keyword or length immediately before the `calc-size()` declaration. Browsers without support discard the whole `calc-size()` declaration and keep the fallback.
4. **Apply Logical Properties**: Default to using logical properties like `inline-size` or `block-size` to ensure the calculations respect the document's writing mode.
5. **Optional: Progressive Enhancement**: Wrap complex layout logic or animations in a `@supports (inline-size: calc-size(auto, size + 0px))` block to deliver advanced features only to capable browsers.

## Basic Syntax

```css
/* calc-size(<calc-size-basis>, <calc-sum>) — mathematical operations on intrinsic sizing keywords */
.element {
  /* Fallback for browsers that do not support calc-size() */
  inline-size: min-content;

  /* Modify an intrinsic basis with a calculation or function */
  inline-size: calc-size(min-content, size + 2rem);
}
```

### Valid Basis Arguments (`<calc-size-basis>`)
The first argument defines the "base" size for the calculation.

**Standard Keywords:**
- `auto`: The default sizing for the element.
- `min-content`: The smallest size the element can take without overflowing.
- `max-content`: The size the element takes to fit all content on one line.
- `fit-content`: Equivalent to `clamp(min-content, auto, max-content)`.
- `content`: Only valid when `calc-size()` is used within the `flex-basis` property.

**Special Arguments:**
- `any`: A generic basis used when the specific intrinsic type is unknown or when nesting calculations.
- Nested `calc-size()`: Allows for multi-step or conditional calculations.
- `<calc-sum>`: A specific length, percentage, or mathematical expression (e.g., `100px` or `20%`). When a fixed value is used as the basis, the **`size` keyword is still available** (but only within the second argument) and represents the resolved value of that basis.

The `size` keyword is **not valid** within the first argument (`<calc-size-basis>`) itself. It only refers back to the basis from within the second argument (`<calc-sum>`).

### Valid Calculation Arguments (`<calc-sum>`)
The second argument is the mathematical expression.
- It typically uses the `size` keyword to refer to the value of the basis.
- While the `size` keyword is technically optional, omitting it means the calculation will resolve to a fixed value, ignoring the basis entirely.
- It can include standard math operators (`+`, `-`, `*`, `/`).
- It can include CSS math functions like `clamp()`, `min()`, `max()`, and `round()`.
- Each `calc-size()` call has a **single** intrinsic basis. You cannot mix intrinsic sizing keywords in the same call.

## Use Cases

### Animating to an Intrinsic Size With a Calculation
Wrapping an intrinsic keyword in `calc-size()` makes it interpolatable, so a transition from a length to `calc-size(auto, …)` animates even without `interpolate-size`. One end of the transition must still be a length or percentage: two different intrinsic keywords cannot interpolate.

```css
.accordion-content {
  display: block;
  overflow: hidden;
  block-size: 0;
  transition: block-size 0.3s ease-out;
}

.accordion-content.open {
  /* Fallback for browsers without calc-size() */
  block-size: auto;
  /* Animate from 0 to the intrinsic size plus 2rem of extra space */
  block-size: calc-size(auto, size + 2rem);
}
```

#### Respecting User Motion Preferences
Animations that change the size of large layout areas can be disruptive for users with vestibular disorders. Use the `prefers-reduced-motion` media query to simplify or remove non-essential size animations, for example by jumping the size and fading opacity instead.

```css
.accordion-content {
  opacity: 0;
  transition: block-size 0.3s ease, opacity 0.3s ease;
}

.accordion-content.open {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .accordion-content {
    /* Only fade: the block-size change happens instantly */
    transition: opacity 1.5s ease;
  }
}
```

### Applying Constraints to Intrinsic Sizes
You can use `calc-size()` with any CSS math function—such as `min()`, `max()`, `clamp()`, or `round()`—to ensure an element's intrinsic size remains within design boundaries.

```css
.dynamic-container {
  /* Fallback for browsers that do not support calc-size() */
  inline-size: fit-content;

  /*
    Size from the content, while:
    1. Enforcing boundaries using CSS math functions (min, clamp, etc.)
    2. Modifying the intrinsic size with fixed or relative offsets
  */
  inline-size: calc-size(fit-content, min(size + var(--extra-space), var(--max-allowed)));
}
```

## Critical Considerations

- **Percentage Pitfalls**: Percentages inside the `<calc-sum>` are resolved against the **container's size**, not the `size` keyword. For example, `calc-size(auto, size + 10%)` adds 10% of the *parent's* width to the element's `auto` width, which may lead to unexpected results or overflows.
- **Performance Note**: Animating box model properties like `inline-size` or `block-size` triggers layout recalculations, which can be expensive. Use `calc-size()` animations primarily for layout-critical elements where non-layout alternatives are insufficient.

## Fallback strategies

{{ BASELINE_STATUS("calc-size") }}
{{ BASELINE_STATUS("interpolate-size") }}

`calc-size()` and `interpolate-size` are **progressive enhancements**. Browsers that do not support them ignore the declarations: the layout keeps the fallback value from the steps above, and transitions to intrinsic sizes jump instead of animating. That instant jump is an acceptable fallback; avoid measuring elements in JavaScript to animate them manually, which causes layout thrashing.

To apply logic that only makes sense when `calc-size()` is available, detect support in CSS or JavaScript:

```css
@supports (inline-size: calc-size(auto, size + 0px)) {
  .element {
    /* Apply advanced logic only when supported */
  }
}
```

```javascript
if (CSS.supports('inline-size', 'calc-size(auto, size + 0px)')) {
  // Apply advanced sizing or animations
}
```
