---
name: persistent-app-tours
description: Create persistent onboarding walkthroughs using tethered native overlays that stay open during user interaction.
web-feature-ids:
  - popover
  - anchor-positioning
---

# Creating Persistent App Tours

Onboarding tours require overlays that persist while users interact with the highlighted features. Unlike auto popovers, manual popovers do not close when the user clicks elsewhere on the page. Combining `popover="manual"` with CSS Anchor Positioning allows you to create non-modal, tethered tour steps.

### Recommended Implementation

#### HTML
```html
<div id="feature-target">Highlight this feature</div>

<!-- MANDATORY: Enforce overlay dialog semantics and accessible name bindings -->
<div id="tour-step" popover="manual" role="dialog" aria-labelledby="tour-title">
  <!-- Assume an <h1> precedes this element in the full document outline -->
  <h2 id="tour-title">Step 1</h2>
  <p>Learn how to use this feature.</p>
  <button popovertarget="tour-step" popovertargetaction="hide">Got it</button>
</div>
```

#### CSS
```css
#feature-target {
  anchor-name: --feature-target;
}

#tour-step {
  position-anchor: --feature-target;
  position-area: right center;
  inset: auto;
  margin: 1rem;
  padding: 1rem;
  border: 1px solid blue;
  border-radius: 0.5rem;
  background: aliceblue;
}
```

#### JavaScript
```javascript
const tourStep = document.getElementById('tour-step');
tourStep.showPopover();
// MANDATORY: Programmatically route focus into the non-modal popover so keyboard/assistive technology users immediately perceive the new context
tourStep.querySelector('button').focus();
```

If you load the popover polyfill (see Fallback strategies), **MANDATORY:** await its import before calling `showPopover()`. In browsers without native popover support, `showPopover()` does not exist until the polyfill has loaded, so calling it earlier throws a `TypeError`.

```html
<script type="module">
  if (!("popover" in HTMLElement.prototype)) {
    await import("https://unpkg.com/@oddbird/popover-polyfill@0.7.3/dist/popover.min.js");
  }
  const tourStep = document.getElementById('tour-step');
  tourStep.showPopover();
  tourStep.querySelector('button').focus();
</script>
```

### Implementation Guidelines

* **MANDATORY:** Use `popover="manual"` to prevent the tour step from closing accidentally during user interaction.
* **MANDATORY:** Mark the container with `role="dialog"` and link its heading via `aria-labelledby`.
* **MANDATORY:** Shift programmatic focus inside the popover immediately after opening to prevent focus abandonment.
* **DO** use CSS Anchor Positioning to tether the tour step to the specific feature being explained.
* **DO** provide an explicit "Close" or "Next" button within the popover that uses `popovertargetaction="hide"`.

### Fallback strategies

{{ FEATURE_FALLBACKS("popover") }}

#### anchor-positioning

{{ BASELINE_STATUS("anchor-positioning", "css.properties.anchor-name") }}

To support browsers without anchor positioning, you can choose between using a polyfill or a pure CSS fallback.

##### Option 1: Polyfill Fallback
The `@oddbird/css-anchor-positioning` polyfill can be used to emulate anchor positioning. It does not support implicit anchors, so you MUST add explicit anchor names to the trigger. Additionally, the polyfill emulates `position-area` on popovers by wrapping the target and moving its insets onto the wrapper, which behaves differently from native positioning, so you MUST use `anchor()` on the desired insets instead of `position-area`.

**MANDATORY:** Pin the polyfill to an exact version. An unversioned or `@latest` CDN URL runs whatever is published next, without review.

```html
<script type="module">
  if (!CSS.supports('anchor-name: --foo')) {
    await import("https://unpkg.com/@oddbird/css-anchor-positioning@0.10.2/dist/css-anchor-positioning.js");
  }
</script>
```

```css
#tour-step {
  /* If using the anchor positioning polyfill with a popover, DO use `anchor()` functions instead of `position-area`. */
  left: anchor(right);
  top: anchor(top);
}
```

##### Option 2: Non-Polyfill CSS Fallback
If you prefer not to use a polyfill, you can default the tour step to a fixed position at the bottom of the viewport using `@supports not`.

```css
@supports not (anchor-name: --foo) {
  #tour-step {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100%;
    margin: 0;
    border-radius: 0;
  }
}
```