* The document contains a top-layer element (such as a `<dialog>` or an element with a `popover` attribute).
* The script contains a feature detection check for `moveBefore` to safely handle unsupported browsers.
* The script uses `moveBefore` to move the top-layer element to a new parent if the feature is supported.
* The script falls back to using `insertBefore` or `appendChild` if `moveBefore` is not supported.
* In the fallback, a dialog that was modal before the move is restored with `close()` followed by `showModal()` (not `showModal()` alone, which throws on the still-open dialog), and an open popover is restored with `showPopover()`.