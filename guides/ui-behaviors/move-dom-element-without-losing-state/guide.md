---
name: move-dom-element-without-losing-state
description: Move or reparent a DOM element without losing important element state, such as interactivity states (:focus/:active), `<iframe>` loading state, animation/transition state, etc
web-feature-ids:
- move-before
---

# Move DOM Element Without Losing State

When reparenting DOM elements using traditional methods like `appendChild()` or `insertBefore()`, the browser implicitly removes the element from the DOM and then inserts it into its new location. This "remove and insert" operation resets many internal states, causing `<iframe>` elements to reload, CSS animations to restart, and input fields to lose focus.

To move an element while preserving its state, use the `moveBefore()` API. This method performs an atomic move, completely bypassing the removal and insertion steps.

### Moving an element with state

Call `moveBefore()` with the same arguments as `insertBefore()`: the node to move, and a reference node to insert before (or `null` to append to the end of the new parent). Unlike `insertBefore()`, it only performs a state-preserving move and throws a `HierarchyRequestError` `DOMException` instead of falling back to remove-and-insert when:

- the node and the new parent do not share the same root (for example, a detached node moving into the document, a connected node moving into a detached subtree, or a move between documents);
- the node is not an `Element` or `CharacterData` node (for example, a `DocumentFragment`).

It also throws a `NotFoundError` if the reference node is not a child of the new parent. `MutationObserver`s still record the move as a removal plus an addition.

```javascript
const newParent = document.getElementById('new-parent');
const elementWithState = document.getElementById('iframe-or-focused-input');

// MANDATORY: Use moveBefore to preserve state. 
// Passing null as the second argument appends the element to the end of newParent.
newParent.moveBefore(elementWithState, null);
```

### Moving custom elements (Web Components)

If you are moving custom elements using `moveBefore()`, define a `connectedMoveCallback()` method on the custom element. When it exists (even empty), the browser calls it instead of `disconnectedCallback()` and `connectedCallback()`. When it does not exist, a `moveBefore()` move still runs `disconnectedCallback()` then `connectedCallback()`, exactly as a remove-and-insert would, so any teardown and setup logic in those callbacks runs again.

Use `connectedMoveCallback()` for logic that depends on the element's new DOM location.

```javascript
class MyCustomElement extends HTMLElement {
  connectedCallback() {
    // Runs on initial insertion.
  }
  
  connectedMoveCallback() {
    // Runs when the element is moved via moveBefore().
    // Use this to update state that depends on the new DOM location.
  }
}
```

### Fallback strategies

{{ BASELINE_STATUS("move-before") }}

Since `moveBefore()` is a progressive enhancement, you MUST use feature detection before calling it, falling back to traditional `insertBefore()` or `appendChild()` operations for older browsers. When the move might cross documents or connect a detached node, also catch the `HierarchyRequestError` and fall back to `insertBefore()`, which handles those cases (with the usual state loss).

```javascript
const targetParent = document.getElementById('target-container');
const nodeToMove = document.getElementById('moving-element');

function moveOrInsert(parent, node, referenceNode = null) {
  // Check if moveBefore is supported on the Element prototype
  if ('moveBefore' in Element.prototype) {
    try {
      parent.moveBefore(node, referenceNode);
      return;
    } catch (error) {
      // A state-preserving move is impossible (cross-document, or connected <-> disconnected).
      if (!(error instanceof DOMException && error.name === 'HierarchyRequestError')) throw error;
    }
  }
  // Fallback: traditional move.
  // Note: This WILL reset <iframe>, animation, and focus state.
  parent.insertBefore(node, referenceNode);
}

moveOrInsert(targetParent, nodeToMove);
```