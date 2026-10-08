---
name: soft-edge-content-fade
description: Apply a transparency gradient to content edges to indicate further scrollable areas or to obscure payment-walled text.
web-feature-ids:
  - masks
---

# Soft Edge Content Fade

## Overview
To apply a transparency gradient to the edges of a container (e.g., to indicate more content is available to scroll or to fade out text), use CSS Masking with a linear gradient. This approach is superior to using a semi-transparent overlay because it actually fades the content itself, allowing the background to show through naturally without interfering with text selection or pointer events.

A mask fades everything inside the element, including focus outlines and, on a scroll container, its scrollbar. Keep buttons, links, and the call to action outside the masked element, as the paywall example does.

## Implementation
Pick the recipe that matches the container:

### Fading the bottom edge of truncated content
This is useful for a teaser or paywall preview: the container clips its content and does not scroll, so a static fade is correct.

```css
.paywall-container {
  max-height: 10rem;
  overflow: hidden;

  /* Prefixed copy for Chrome < 120 and Safari < 15.4 */
  -webkit-mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 50%, transparent 100%);
}
```

### Fading the edges of a scroll container
The mask is drawn over the scroll container's box, not over its scrolled content, so the fade stays at the visible edge while the user scrolls. A static gradient is therefore wrong: at the end of the scroll range the last lines stay faded although there is nothing more to reveal. Show each edge's fade only while the user can scroll toward that edge, and keep the scrollbar out of the mask.

Wrap the scroll container in a non-scrolling frame. The script toggles one class per edge on the frame and measures the classic scrollbar width (overlay scrollbars measure 0).

```html
<div class="fade-frame">
  <div class="fade-scroller" tabindex="0">
    <!-- Scrollable content -->
  </div>
</div>
```

```css
.fade-scroller {
  --fade-top: 0px;
  --fade-bottom: 0px;
  overflow-y: auto;

  /* Layer 1 fades the edges. Layer 2 keeps a fully visible strip under the
     scrollbar; at 0px wide it masks nothing. Layers combine with the
     default mask-composite: add. */
  mask-image:
    linear-gradient(to bottom, transparent, black var(--fade-top), black calc(100% - var(--fade-bottom)), transparent),
    linear-gradient(black, black);
  mask-size: 100% 100%, var(--scrollbar-size, 0px) 100%;
  /* For right-to-left content the scrollbar is usually on the left: use 0 0 for layer 2 */
  mask-position: 0 0, 100% 0;
  mask-repeat: no-repeat;
}

.fade-frame.can-scroll-up > .fade-scroller { --fade-top: 2rem; }
.fade-frame.can-scroll-down > .fade-scroller { --fade-bottom: 2rem; }
```

```javascript
const frame = document.querySelector('.fade-frame');
const scroller = frame.querySelector('.fade-scroller');

function updateFade() {
  const maxScroll = scroller.scrollHeight - scroller.clientHeight;
  // 1px tolerance: scrollTop can be fractional on high-density screens
  frame.classList.toggle('can-scroll-up', scroller.scrollTop > 1);
  frame.classList.toggle('can-scroll-down', scroller.scrollTop < maxScroll - 1);

  const style = getComputedStyle(scroller);
  const scrollbarSize = scroller.offsetWidth - scroller.clientWidth
    - parseFloat(style.borderLeftWidth) - parseFloat(style.borderRightWidth);
  frame.style.setProperty('--scrollbar-size', `${scrollbarSize}px`);
}

scroller.addEventListener('scroll', updateFade, { passive: true });
// Runs once on observe and again on resize. Also call updateFade() after
// changing the content, because that changes scrollHeight without a resize.
new ResizeObserver(updateFade).observe(scroller);
```

For shadows or arrows instead of a fade, see {{ GUIDE_REF("scrollability-affordance-hints") }}.

## Fallback strategies
{{ BASELINE_STATUS("masks") }}

If a browser does not support `mask-image` or the prefixed version:
- The content will not fade and will display with sharp edges.
- Ensure the interface is still functional and content is readable without the fade (progressive enhancement).
- You can use a semi-transparent overlay as a fallback, but be aware it requires knowing the background color and may interfere with text selection unless `pointer-events: none` is used.

For truncated content that does not scroll, the overlay can sit inside the clipped container:

```css
/* Fallback using an overlay for browsers that do not support masking */
@supports (not (mask-image: linear-gradient(to bottom, black, transparent))) and (not (-webkit-mask-image: linear-gradient(to bottom, black, transparent))) {
  .paywall-container {
    position: relative;
  }

  .paywall-container::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 50%;
    /* Fallback assumes a solid background color (e.g., white) */
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1));
    pointer-events: none; /* Allow interaction with text underneath */
  }
}
```

For a scroll container, an absolutely positioned overlay inside the scroller scrolls away with the content. Attach it to the non-scrolling `.fade-frame` instead, beside the scrollbar, and show it only while the user can scroll down:

```css
@supports (not (mask-image: linear-gradient(to bottom, black, transparent))) and (not (-webkit-mask-image: linear-gradient(to bottom, black, transparent))) {
  .fade-frame {
    position: relative;
  }

  .fade-frame.can-scroll-down::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: var(--scrollbar-size, 0px);
    height: 2rem;
    background: linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,1));
    pointer-events: none;
  }
}
```
