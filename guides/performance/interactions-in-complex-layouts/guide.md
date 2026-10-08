---
name: interactions-in-complex-layouts
description: Make interactions snappier and more responsive (reducing Interaction to Next Paint (INP) scores) by avoiding layout re-calculations in complex layouts, such as data-heavy dashboards or spreadsheet-style grids.
web-feature-ids:
  - content-visibility
---

# Optimizing Interactions in Complex Layouts

Maintain high frame rates (60FPS) and eliminate interaction latency during drag-and-drop or heavy mutations in complex, multi-column layouts like Kanban boards or massive data grids.

## Overview

In complex layouts, performing a minor change to a single item—such as dragging a card or editing a cell—can trigger a chain reaction of style and layout calculations that forces the browser to reflow the entire page. This results in dropped frames and high Interaction to Next Paint (INP) latency.

By applying `content-visibility: auto` to self-contained layout regions (like columns in a Kanban board), you can isolate rendering work inside each region and skip rendering for regions that are scrolled out of view.

### How this relates to deferring off-screen content

{{ GUIDE_REF("defer-rendering-heavy-content") }} limits `content-visibility: auto` to content below the initial fold, because its goal is to cut initial-load rendering, and on-screen elements gain nothing from skipping. This guide has a different goal: containment during interactions. Here, applying `content-visibility: auto` to columns that are on screen is intended, because containment is its only effect on them. The initial on-screen check takes effect in the same frame, so those columns still render on first paint. Long lists inside a column (for example the cards below the column's visible area) and columns scrolled out of view also get the off-screen skipping that the sibling guide describes.

### Mechanism for on-screen and off-screen regions

`content-visibility: auto` behaves differently depending on whether a region is on or near the screen:

*   **Off-screen**: the browser skips the region's contents and adds size containment, so the region is laid out at its `contain-intrinsic-size` without laying out its children.
*   **On-screen**: the browser renders the contents normally. It keeps layout, style, and paint containment, but **not** size containment.
*   Layout containment isolates the region's *internal* layout: nothing outside affects how its children are laid out, and its children affect the outside only through the region's own size.
*   Because on-screen regions have no size containment, a region whose size depends on its children still changes size when a child is added or removed, and the browser then re-lays out the content around it.
*   **MANDATORY**: To keep a mutation local, give each region a size that does not depend on its children: a fixed inline size, and a block size set by the surrounding layout (for example `height: 100%` of the board) with the children scrolling inside the region (`overflow-y: auto`).

## Implementation

### 1. Identify Containment Regions

Apply `content-visibility: auto` to large, self-contained containers that represent isolated layout units (e.g., grid columns, board lists), and size them independently of their contents.

```css
.board-column {
  /* Size the column independently of its cards so a move cannot resize it */
  width: 300px;
  height: 100%;
  overflow-y: auto;

  /* Containment while on-screen, skipped rendering while off-screen */
  content-visibility: auto;
  
  /* Mandatory: Provide a placeholder size to prevent layouts shifts.
     For a vertical column, define a reasonable width and height. 
     - 'auto' is optional and enables the browser to remember the actual size
       once rendered. It must be paired with a <length> value to be used for
       the first render.
     - '300px' is the estimated width of this element. This can be any valid
      CSS <length> value. Replace it with the expected width of your
      component.
     - '800px' is the estimated height of this element. This can be any valid
      CSS <length> value. Replace it with the expected height of your
      component.
   */
  contain-intrinsic-size: auto 300px auto 800px;
}
```

### 2. Manage Interactions

Ensure that interactions occurring inside the column benefit from the containment.

```javascript
// Example: Drag and drop item movement
function moveItemToColumn(itemId, columnId) {
  const item = document.getElementById(itemId);
  const column = document.getElementById(columnId);
  
  // Only the source and target columns lay out their cards again.
  // Both columns have a fixed size, so the move cannot change the board's layout.
  column.appendChild(item);
}
```

### Fallback strategies

{{ BASELINE_STATUS("content-visibility") }}

The property degrades gracefully. In unsupported browsers:
*   The property is ignored, and mutations will cause the standard global reflow.
*   To achieve a similar isolation effect in older browsers, you can fall back to applying containment manually:

```css
@supports not (content-visibility: auto) {
  .board-column {
    /* Manual fallback for containment */
    contain: layout style paint;
  }
}
```
