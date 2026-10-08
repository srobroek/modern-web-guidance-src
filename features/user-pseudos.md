# User Pseudos (`:user-valid` / `:user-invalid`)

## Keep `aria-invalid` in sync { #aria-invalid }

Native `:user-invalid` does not automatically sync with ARIA attributes. Add the following JavaScript to keep `aria-invalid` in sync with the visual state:

```javascript
// Sync aria-invalid with the CSS :user-invalid state, for validatable fields only
// (buttons, hidden, disabled, and read-only controls never get aria-invalid).
const isValidatableField = (el) =>
  el.matches?.('input, select, textarea') &&
  el.willValidate &&
  !['submit', 'reset', 'button', 'image'].includes(el.type);

const syncAria = (el) => {
  if (!isValidatableField(el)) return;
  el.setAttribute('aria-invalid', el.matches(':user-invalid') ? 'true' : 'false');
};

// Update on blur (to show error), on input (to clear it), and on a submit
// attempt, which fires a non-bubbling `invalid` event at each invalid field.
document.addEventListener('blur', (e) => syncAria(e.target), true);
document.addEventListener('invalid', (e) => syncAria(e.target), true);
document.addEventListener('input', (e) => {
  if (e.target.hasAttribute('aria-invalid')) syncAria(e.target);
});
```


## Fallbacks

### CSS for Fallback

Wrap the native and fallback selectors in `:is()`. A plain comma-separated list is invalid as a whole in a browser that does not recognize `:user-invalid`, so it would also drop the fallback class rule; `:is()` takes a forgiving selector list and ignores only the unknown part.

```css
input:is(:user-invalid, .user-invalid-fallback) {
  border-color: #d93025;
  background-color: #fce8e6;
}

input:is(:user-invalid, .user-invalid-fallback) + .error-msg {
  display: block;
}
```

### JavaScript Fallback

Use a reusable utility that tracks interaction state using a `WeakMap`. This avoids polluting the DOM with "dirty" classes or data attributes.

```javascript
const UserInvalidFallback = (() => {
  const dirtyState = new WeakMap();

  const updateState = (input) => {
    const isValid = input.checkValidity();

    // Update both visual and ARIA state
    input.classList.toggle('user-invalid-fallback', !isValid);
    input.classList.toggle('user-valid-fallback', isValid);

    if (!isValid) {
      input.setAttribute('aria-invalid', 'true');
    } else {
      input.removeAttribute('aria-invalid');
    }
  };

  const handleEvent = (event) => {
    const input = event.target;

    if (event.type === 'reset') {
      const controls = input.elements || [];
      for (const control of controls) {
        dirtyState.delete(control);
        control.classList.remove('user-invalid-fallback');
        control.classList.remove('user-valid-fallback');
        control.removeAttribute('aria-invalid');
      }
      return;
    }

    if (!input.checkValidity) return;

    if (event.type === 'input' || event.type === 'change') {
      const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasInteracted = true;
      dirtyState.set(input, state);
      if (state.hasBlurred) {
        updateState(input);
      }
    } else if (event.type === 'blur') {
      const state = dirtyState.get(input) || { hasInteracted: false, hasBlurred: false };
      state.hasBlurred = true;
      dirtyState.set(input, state);
      if (state.hasInteracted) {
        updateState(input);
      }
    } else if (event.type === 'invalid') {
      // A submit attempt flags every invalid field, even untouched ones, as :user-invalid does
      dirtyState.set(input, { hasInteracted: true, hasBlurred: true });
      updateState(input);
    }
  };

  const init = (root = document) => {
    if (CSS.supports('selector(:user-invalid)')) return;

    root.addEventListener('blur', handleEvent, true); // Capture phase
    root.addEventListener('input', handleEvent);
    root.addEventListener('change', handleEvent);
    root.addEventListener('reset', handleEvent, true); // Capture resets
    root.addEventListener('invalid', handleEvent, true); // `invalid` does not bubble; capture it
  };

  return { init };
})();

// Usage: call init() once for each form that needs the fallback, for example:
// UserInvalidFallback.init(document.querySelector('#signup-form'));
```
