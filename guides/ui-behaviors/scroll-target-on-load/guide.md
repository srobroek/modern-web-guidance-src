---
name: scroll-target-on-load
description: Build a scrollable list of elements (e.g. a carousel of images or a chat conversation thread) that can be displayed with a particular element scrolled into view on the initial render.
web-feature-ids:
  - scroll-initial-target
  - scroll-into-view
---

# Set a scroll target for the initial render

The CSS property `scroll-initial-target` offers a declarative, CSS-only way to bring a specific descendant element into the visible area of its scroll container as soon as that container is rendered. Previously, developers relied on JavaScript (`Element.scrollIntoView()`) or URL fragment identifiers (`#item-id`), both of which have limitations and are tricky to implement.

## How to Implement

To implement this successfully:

1. **Ensure a scroll container:** The target element must be inside a scroll container (an element with overflow that allows scrolling, such as `overflow: auto`). This can be any ancestor element, including the root `<html>` element.
2. **Target the Item:** Apply `scroll-initial-target: nearest` to the specific descendant element you want to bring into view.

## Example Code: Vertical Media Feed

In this example, a feed starts scrolled to a specific "featured" item rather than the very top of the list.

```css
/** 
 * TARGET: The item that should be visible on initial load.
 */
.item.target {
  scroll-initial-target: nearest;
}
```

## Strategic Implementation & Best Practices

- **DO** use `scroll-initial-target` for "middle-start" experiences, such as a calendar starting on the current day or a gallery starting on a specific image.
- **DO NOT** confuse this with accessibility focus. This property only moves the **visual** viewport; it does not move the keyboard focus. You must manually manage `element.focus()` if the target is intended to be the starting point for keyboard users.
- **DO NOT** use this if you need a smooth "scrolling" animation on load; this property is discrete and sets the position instantly during the layout phase.
- **DO NOT** set `scroll-initial-target` on multiple elements within the same scrollable container. If multiple elements specify `scroll-initial-target: nearest`, the browser selects the one that appears first in the DOM tree order.
- **DO** provide dimensions for media. Since the scroll position is calculated during initial layout, ensure images or videos have `aspect-ratio` or fixed `height`/`width` to prevent the target from shifting after the media loads.
- **DO** account for the **Precedence Hierarchy**: A URL fragment (e.g., `example.com/#top`) takes precedence over `scroll-initial-target`.

## Fallback Strategy

{{ BASELINE_STATUS("scroll-initial-target") }}

For browsers that do not yet support the API, use a JavaScript fallback. Use the `DOMContentLoaded` event to ensure the browser scrolls the element into view as soon as the HTML parsing completes, providing a faster experience than waiting for all images and resources to load. Alternatively, placing the script at the end of the `<body>` element is also acceptable and avoids the need for an event listener.

Make the fallback behave like the native property:

- Skip it when the URL fragment points to an element, so fragment navigation keeps precedence.
- Align the target to the start of its scroll container (the native property uses `block: "start"`, `inline: "nearest"`).
- Only scroll the feed. `scrollIntoView()` also scrolls every scrollable ancestor, including the page, while the native property only sets the initial position of the target's nearest scroll container, so restore the page's scroll position afterwards. Drop the restore when the page itself (`<html>`) is the target's scroll container.

```javascript
/**
 * Progressive Enhancement Fallback
 */
document.addEventListener("DOMContentLoaded", () => {
  // Check for native CSS support
  if (CSS.supports("scroll-initial-target", "nearest")) return;

  // A URL fragment takes precedence over the initial scroll target.
  const hash = location.hash.slice(1);
  let fragment = hash;
  try { fragment = decodeURIComponent(hash); } catch { /* keep the raw value */ }
  if (fragment && document.getElementById(fragment)) return;

  const feedTarget = document.querySelector(".item.target");
  if (!feedTarget) return;

  const { scrollX, scrollY } = window;
  // Match the native alignment within the feed.
  feedTarget.scrollIntoView({ behavior: "instant", block: "start", inline: "nearest" });
  // scrollIntoView() also scrolled the page; put it back where it was.
  // (Remove this line when the page itself is the feed's scroll container.)
  window.scrollTo({ left: scrollX, top: scrollY, behavior: "instant" });
});
```
