---
name: style-parent-with-has
description: Style parent elements of a form field (e.g. labels or fieldsets) when the field is invalid.
web-feature-ids:
  - user-pseudos
---

# Style Parent with :has()

## The Problem
Often, an error state requires styling elements *outside* the input itself—for example, changing the color of a parent `fieldset` border, highlighting the `<label>`, or showing a global error icon in the card header. Historically, this required JavaScript to toggle classes on parent elements.

## The Solution
By combining `:has()` with `:user-invalid`, we can declaratively style any ancestor based on the validity state of a specific descendant. This keeps all presentation logic in CSS.

### Implementation Strategy

1.  **Selector**: Use `.parent:has(:user-invalid)` to target the container.
2.  **Scope**: Be specific to avoid performance issues. Target `.field-group` rather than `body`.
3.  **Fallback**: Requires JS to toggle classes on the parent if either `:has()` or `:user-invalid` is not supported; the native rule needs both.

## Implementation Guide

### 1. HTML Structure
```html
<form id="profile-form">
  <div class="card-section">
    <div class="header">
      <h3>Profile Settings</h3>
      <span class="status-icon"></span>
    </div>

    <div class="field">
      <label for="username">Username</label>
      <input type="text" id="username" required>
    </div>
  </div>
</form>
```

### 2. CSS
```css
/* Default State */
.card-section {
  border: 1px solid #ccc;
  border-left: 4px solid #ccc;
}

/*
  Parent Styling Logic:
  If the card contains ANY user-invalid input, turn the whole card's edge red.
*/
.card-section:has(:user-invalid) {
  border-left-color: #d93025;
  background-color: #fff8f8;
}

/* Change the icon too */
.card-section:has(:user-invalid) .status-icon::after {
  content: "⚠️";
}
```

## Fallbacking & Browser Support

{{ BASELINE_STATUS("user-pseudos") }}

### CSS for Fallback
We use a class `.has-error-fallback` on the parent to mimic the `:has()` behavior. Keep it as a separate rule: in a browser that lacks `:has()` or `:user-invalid`, the native selector is invalid and its whole rule is dropped.

```css
/* Native */
.card-section:has(:user-invalid) {
  border-left-color: #d93025;
}

/* Fallback */
.card-section.has-error-fallback {
  border-left-color: #d93025;
}
```

### JavaScript Fallback

{{ FEATURE("user-pseudos", "javascript-fallback")}}

```js
// 1. Initialize the generic :user-invalid fallback (a no-op where :user-invalid is supported)
const profileForm = document.querySelector('#profile-form');
UserInvalidFallback.init(profileForm);

// 2. Add specialized "parent styling" logic, needed whenever the native
//    .card-section:has(:user-invalid) rule cannot match
const supportsHas = CSS.supports('selector(:has(*))');
const supportsUserInvalid = CSS.supports('selector(:user-invalid)');

if (!supportsHas || !supportsUserInvalid) {
  // Detect invalid fields natively where possible, else via the fallback class
  const invalidSelector = supportsUserInvalid ? ':user-invalid' : '.user-invalid-fallback';

  const syncContainer = (field) => {
    const container = field.closest?.('.card-section');
    if (!container) return;
    container.classList.toggle('has-error-fallback', !!container.querySelector(invalidSelector));
  };

  // Registered after the fallback's listeners, so its classes are already updated.
  // `blur` and `invalid` do not bubble: listen in the capture phase.
  profileForm.addEventListener('blur', (e) => syncContainer(e.target), true);
  profileForm.addEventListener('invalid', (e) => syncContainer(e.target), true);
  profileForm.addEventListener('input', (e) => syncContainer(e.target));
  profileForm.addEventListener('change', (e) => syncContainer(e.target));

  // Handle form resets
  profileForm.addEventListener('reset', () => {
    profileForm.querySelectorAll('.has-error-fallback').forEach((el) => {
      el.classList.remove('has-error-fallback');
    });
  });
}
```

## Other Considerations

1.  **Accessibility**: {{ FEATURE("user-pseudos", "aria-invalid") }}
