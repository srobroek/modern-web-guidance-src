---
name: declarative-dialog-popover-control
description: Toggle the visibility of a dialog or popover from a button without writing JavaScript.
web-feature-ids:
  - invoker-commands
  - popover
  - dialog
---

# Declarative Dialog and Popover Control

Use the Invoker Commands API to toggle the visibility of `<dialog>` and `[popover]` elements directly from HTML buttons, eliminating the need for custom JavaScript event listeners.

By applying the `commandfor` (target ID) and `command` (action) attributes to a `<button>`, the browser automatically handles open/close state changes, focus management, and accessibility bindings (such as `aria-expanded`). This declarative approach is recommended because it removes brittle boilerplate code, ensures interactions are functional immediately upon HTML parsing, and guarantees a robust, natively accessible user experience.

## Implementing Declarative Popovers

Popovers can be toggled open and closed using a single button.

```html
<!-- MANDATORY: The commandfor attribute links the invoker to the ID of the target element so the browser knows what to control. -->
<!-- MANDATORY: The command attribute specifies the action to perform. Use 'toggle-popover' to handle both open and close states automatically. -->
<button commandfor="my-popover" command="toggle-popover">
  Toggle Popover
</button>

<!-- MANDATORY: The target element must have the popover attribute to be controlled as a popover. -->
<div id="my-popover" popover>
  <p>Popover content goes here.</p>
</div>
```

If you need to control opening and closing with separate buttons, you can use the `show-popover` and `hide-popover` commands.

```html
<!-- MANDATORY: Use 'show-popover' to explicitly open the popover. It will not close the popover if clicked again. -->
<button commandfor="my-explicit-popover" command="show-popover">
  Show Popover
</button>

<div id="my-explicit-popover" popover="manual">
  <p>This popover is explicitly opened and closed by separate buttons.</p>

  <!-- MANDATORY: Use 'hide-popover' to explicitly close the targeted popover. -->
  <button commandfor="my-explicit-popover" command="hide-popover">
    Hide Popover
  </button>
</div>
```

## Implementing Declarative Modal Dialogs

Unlike popovers, modal dialogs typically use separate buttons for opening and closing. Use the `show-modal` command specifically when you need to open a dialog as a modal.

```html
<!-- MANDATORY: Use command="show-modal" to trigger the dialog as a modal, trapping focus and preventing interaction with the rest of the page. -->
<!-- MANDATORY: The commandfor attribute connects this button to the dialog ID. -->
<button commandfor="confirm-dialog" command="show-modal">
  Open Confirmation
</button>

<dialog id="confirm-dialog">
  <p>Are you sure you want to proceed?</p>

  <!-- MANDATORY: Use command="close" to dismiss the dialog safely. -->
  <button commandfor="confirm-dialog" command="close">
    Cancel
  </button>
</dialog>
```

## Fallback strategies

{{ BASELINE_STATUS("invoker-commands") }}

Because Invoker Commands and Popovers are not yet universally supported, you MUST provide a fallback for older browsers: load the polyfills below, or map the built-in commands by hand.

### Polyfilling Invoker Commands

MANDATORY: Feature detect support by checking for the `commandForElement` property on the `HTMLButtonElement` prototype. Do NOT check the window or document object. You MUST dynamically import the polyfill only when the native feature is missing. DO NOT unconditionally load the polyfill.
Mandatory: Listen for the 'command' event directly on the target element because the native 'command' event does not bubble.

**Option 1: Using a bundler**
Install the polyfill via npm (`npm install invokers-polyfill`). This approach is for projects using a bundler (like Vite or Webpack) or import maps. For all other setups, use the CDN option below.

```javascript
// MANDATORY: Feature detect 'commandForElement' on HTMLButtonElement.prototype.
// Conditionally load the invokers-polyfill only in browsers lacking native support.
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  import('invokers-polyfill');
}
```

**Option 2: Using a CDN**
For projects without a bundler, dynamically import the polyfill directly from a CDN inside a `<script type="module">`.

```html
<script type="module">
  // MANDATORY: Feature detect 'commandForElement' on HTMLButtonElement.prototype.
  // Conditionally load the invokers-polyfill from a CDN only in browsers lacking native support.
  if (!('commandForElement' in HTMLButtonElement.prototype)) {
    import('https://esm.run/invokers-polyfill');
  }
</script>
```

**Invokers Polyfill Limitations**
MANDATORY: This polyfill does not handle the ARIA states (e.g., `aria-expanded`) of the command button the way native browsers do. You are strongly encouraged to handle these states yourself to ensure your site is fully accessible.

### Manual fallback for built-in commands

If you prefer not to load the polyfill, map each built-in command to the dialog or popover method it invokes. Install the listener **only** when native support is missing, otherwise each click runs the command twice (natively and again from the listener), and a toggle undoes itself. Like the polyfill, this does not expose `aria-expanded` on the button; set it yourself if the button controls a popover.

```javascript
if (!('commandForElement' in HTMLButtonElement.prototype)) {
  // Use show/hide with a state check rather than togglePopover(force):
  // Firefox 125-140 support popovers but ignore the force argument.
  // With the popover polyfill, test the .\:popover-open class instead.
  const isOpenPopover = (el) => el.matches(':popover-open');
  const builtInCommands = {
    'show-modal': (el) => { if (!el.open) el.showModal(); },
    'close': (el) => { if (el.open) el.close(); },
    'toggle-popover': (el) => (isOpenPopover(el) ? el.hidePopover() : el.showPopover()),
    'show-popover': (el) => { if (!isOpenPopover(el)) el.showPopover(); },
    'hide-popover': (el) => { if (isOpenPopover(el)) el.hidePopover(); },
  };

  document.addEventListener('click', (event) => {
    const button = event.target.closest('button[commandfor][command]');
    if (!button) return;

    const target = document.getElementById(button.getAttribute('commandfor'));
    // Built-in command values are matched case-insensitively.
    const run = builtInCommands[button.getAttribute('command').toLowerCase()];
    if (target && run) run(target);
  });
}
```

{{ FEATURE_FALLBACKS("popover") }}
