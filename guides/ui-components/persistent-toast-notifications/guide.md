---
name: persistent-toast-notifications
description: Create non-intrusive toast and overlay notifications for persistent, stackable messaging and state communication.
web-feature-ids:
  - popover
  - anchor-positioning
  - sibling-count
  - transition-behavior
---

# Creating Toast Notifications

Toast notifications are transient status messages. Unlike menus, they should not close when a user interacts with other parts of the page. The popover="manual" state is ideal because it lacks "light-dismiss" behavior and allows multiple notifications to coexist.

### Implementation Guidelines

* **MANDATORY:** Use popover="manual" so the notification stays visible until explicitly closed or timed out by a script.
* **MANDATORY:** Announce toasts to assistive technology. Put the toast container in the initial markup as a live region with `aria-live="polite"`, then insert each toast into it. Live regions only announce changes made after the region exists, so a live region created together with its message is often silent.
* **MANDATORY:** Do not move focus to a toast. Showing a toast must not interrupt what the user is doing.
* **DO** use `role="alert"` on an individual toast only for urgent, time-sensitive messages such as errors. It is announced assertively and interrupts the screen reader. Use the polite container for everything else.
* **DO** use a container to manage the stacking of multiple toasts. Since popovers in the Top Layer ignore parent z-index, you must position them individually or within a common layout group.
* **DO** use sibling-index() to add margin between toast notifications so that items lower in the stack are visible.
* **DO** provide an explicit "Close" button within the toast, using `popovertargetaction="hide"` or a click handler that calls `hidePopover()`.
* **DO** use JavaScript for auto-dismissal timers (e.g., calling hidePopover() after 3000ms). Pause the timer while the pointer is over the toast or focus is inside it, so users have time to read it and reach its controls (see WCAG 2.2 Success Criterion 2.2.1 Timing Adjustable).
* **DO** utilize transition-behavior: allow-discrete to animate the entry and exit from the Top Layer.

### Example

```html
<!-- MANDATORY: The live region is in the initial markup, before any toast is added. -->
<div class="toast-container" aria-live="polite"></div>

<template id="toast-template">
  <div class="toast" popover="manual">
    <p class="toast-message"></p>
    <button class="toast-close" aria-label="Dismiss notification">×</button>
  </div>
</template>
```

```js
const container = document.querySelector('.toast-container');
const template = document.getElementById('toast-template');

function showToast(message, { timeout = 3000 } = {}) {
  const toast = template.content.firstElementChild.cloneNode(true);
  toast.querySelector('.toast-message').textContent = message;
  toast.querySelector('.toast-close').addEventListener('click', () => toast.hidePopover());
  container.append(toast);
  // Show without moving focus; the live region announces the new toast.
  toast.showPopover();

  // Auto-dismiss, but pause while the toast is hovered or focused.
  let hovered = false;
  let focused = false;
  let timer;
  const updateTimer = () => {
    clearTimeout(timer);
    if (!hovered && !focused) timer = setTimeout(() => toast.hidePopover(), timeout);
  };
  toast.addEventListener('pointerenter', () => { hovered = true; updateTimer(); });
  toast.addEventListener('pointerleave', () => { hovered = false; updateTimer(); });
  toast.addEventListener('focusin', () => { focused = true; updateTimer(); });
  toast.addEventListener('focusout', (event) => {
    focused = toast.contains(event.relatedTarget);
    updateTimer();
  });
  updateTimer();

  // Remove the toast after its exit transition so sibling-index() stays accurate.
  toast.addEventListener('toggle', (event) => {
    if (event.newState !== 'closed') return;
    clearTimeout(timer);
    Promise.allSettled(toast.getAnimations().map((animation) => animation.finished))
      .then(() => toast.remove());
  });
}
```

### Fallback Strategies

{{ FEATURE_FALLBACKS("popover") }}

#### sibling-index()

* **Guidance:** If sibling-index() is not supported, set a `--toast-index` custom property from JavaScript and declare it before the `sibling-index()` version. Browsers that don't support `sibling-index()` drop that declaration and keep the custom-property one. Renumber the remaining toasts whenever one is removed. A sibling combinator such as `[popover] + [popover]` gives every toast after the first the same offset, so they overlap.

```css
.toast {
  margin-bottom: calc(var(--toast-index, 1) * 1rem);
  margin-bottom: calc(sibling-index() * 1rem);
}
```

```js
if (!CSS.supports('margin-bottom', 'calc(sibling-index() * 1rem)')) {
  const renumber = () => [...container.children].forEach((toast, index) => {
    toast.style.setProperty('--toast-index', index + 1);
  });
  new MutationObserver(renumber).observe(container, { childList: true });
}
```

#### anchor-positioning

* **Guidance:** Use the [CSS Anchor Positioning Polyfill](https://github.com/oddbird/css-anchor-positioning). For a non-polyfill fallback, default the toast to a fixed position at the bottom of the viewport using `@supports not (anchor-name: --foo)`.

#### transition-behavior

* **Guidance:** If transition-behavior is not supported, use JavaScript to add animation via classes as the toast element transitions in and out.