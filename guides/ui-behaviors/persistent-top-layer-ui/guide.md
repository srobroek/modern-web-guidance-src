---
name: persistent-top-layer-ui
description: Keep a modal dialog, fullscreen element, or native popover visibly open and functionally active when its underlying DOM node is moved or reparented in the DOM.
web-feature-ids:
- move-before
---

# Persistent Top Layer UI

When moving an open `<dialog>`, `popover`, or fullscreen element in the DOM using traditional methods like `appendChild()` or `insertBefore()`, the browser implicitly removes the element from the DOM and re-inserts it. The removal takes the element out of the top layer: popovers close, fullscreen elements exit fullscreen, and a modal dialog stops being modal (it keeps its `open` attribute, so it comes back as an open *non-modal* dialog, with the rest of the page no longer inert).

To reparent top-layer elements without interrupting the user experience or closing them, use the atomic `moveBefore()` API instead.

### Reparenting open top-layer elements

`moveBefore()` takes two arguments: the node to move, and a reference node to insert before (or `null` to append to the end of the new parent).

```javascript
const newParent = document.getElementById('new-container');
const dialogElement = document.getElementById('my-dialog');

// MANDATORY: Use moveBefore to ensure the <dialog> or popover stays open.
// Passing null appends it to the end of newParent.
newParent.moveBefore(dialogElement, null);
```

### Fallback strategies

{{ BASELINE_STATUS("move-before") }}

Since `moveBefore()` is a progressive enhancement, you MUST use feature detection before calling it. For older browsers, you will have to fallback to traditional reparenting.

**MANDATORY**: In unsupported browsers, record each piece of state before the traditional move and restore it separately afterwards:

- **Modal dialog**: after the move it is still open but non-modal, and `showModal()` on an open non-modal dialog throws an `InvalidStateError`. Call `close()` first, then `showModal()`. `close()` fires a `close` event, so keep `close` handlers that discard data from treating this as a user dismissal.
- **Non-modal dialog** (opened with `show()`): it stays open; do not call `showModal()` on it, which would throw.
- **Popover**: it is closed after the move; call `showPopover()`.
- **Focus**: re-focus the element that had focus inside the moved subtree.
- **Fullscreen**: it cannot be restored here, because `requestFullscreen()` needs a fresh user activation.

```javascript
const targetParent = document.getElementById('target-container');
const topLayerElement = document.getElementById('my-top-layer-element');

function moveTopLayerElement(parent, element, referenceNode = null) {
  // Check if moveBefore is supported
  if ('moveBefore' in Element.prototype) {
    parent.moveBefore(element, referenceNode);
    return;
  }

  // Fallback: traditional move. Record state first; the move resets it.
  const wasModal = element instanceof HTMLDialogElement && element.matches(':modal');
  // Only query :popover-open where the Popover API exists; matches() throws on unknown selectors.
  const wasPopoverOpen = typeof element.showPopover === 'function' &&
    element.popover !== null && element.matches(':popover-open');
  const focused = element.contains(document.activeElement) ? document.activeElement : null;

  parent.insertBefore(element, referenceNode);

  if (wasModal) {
    // Now an open non-modal dialog: showModal() alone would throw InvalidStateError.
    element.close();
    element.showModal();
  } else if (wasPopoverOpen) {
    element.showPopover();
  }
  // A non-modal dialog keeps its open attribute across the move and needs no restore.

  focused?.focus();
}

moveTopLayerElement(targetParent, topLayerElement);
```