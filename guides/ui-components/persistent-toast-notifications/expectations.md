1. Toasts must appear on top of all other page content, including modal dialogs or open menus.
2. Clicking on the DOM content outside of the popover must not dismiss the toast notification.
3. Multiple toasts must be able to be open at the same time without closing one another.
4. The toast must correctly remove itself from the Top Layer once dismissed.
5. Toasts are inserted into a container that is present in the initial markup and is an ARIA live region (`aria-live="polite"`, or `role="alert"` on an individual toast for urgent messages), so screen readers announce them.
6. Showing a toast does not move keyboard focus.
7. The auto-dismiss timer is paused while the pointer is over the toast or focus is inside it.
