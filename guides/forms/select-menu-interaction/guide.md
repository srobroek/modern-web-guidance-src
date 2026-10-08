---
name: select-menu-interaction
description: Validate that a non-default option has been chosen in a select menu only after the user has interacted with the control.
web-feature-ids:
  - user-pseudos
---

# Select Menu Interaction

## The Problem
For mandatory dropdowns (e.g., "Choose a Country"), standard validation flags the field as invalid immediately if the default option has an empty value. This can create visual noise. We want to show the error only after the user picks the empty option, or attempts to submit the form while nothing is chosen. Opening and closing the menu without changing the selection is not an interaction and must not show the error.

## The Solution
The `:user-invalid` pseudo-class works seamlessly with `<select>` elements. It respects the user's interaction flow: loading the page, focusing and blurring, or opening and closing the menu without changing the selection doesn't count as an interaction, so the field stays neutral until the user picks an option or attempts to submit.

### Implementation Strategy

1.  **HTML Constraint**: Use a `<select>` with `required`. The first option should have `value=""` and ideally be disabled/hidden to force a valid choice. A disabled placeholder cannot be picked again, so the error then appears only on a submit attempt.
2.  **Visual Feedback**: Use `:user-invalid` to style the select box border.
3.  **Timing**: The browser marks the select as interacted as soon as the user picks an option (no blur needed), and on a submit attempt. Re-picking an enabled empty placeholder therefore shows the error immediately.

## Implementation Guide

### 1. HTML Structure
The "placeholder" option is key here.

```html
<form id="country-form">
  <div class="field">
    <label for="country">Country</label>
    <select
      id="country"
      name="country"
      required
      aria-errormessage="country-error"
    >
      <option value="" disabled selected>Select a country...</option>
      <option value="us">United States</option>
      <option value="ca">Canada</option>
      <option value="uk">United Kingdom</option>
    </select>
    <div id="country-error" class="error-msg">
      Please select a country.
    </div>
  </div>
</form>
```

### 2. CSS
```css
.error-msg {
  display: none;
  color: #d93025;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

/*
  Only show the error after the user picks an option or attempts to submit.
  :is() keeps the fallback class working in browsers without :user-invalid
  (a plain comma list would be dropped whole there). The shared fallback CSS
  below targets input elements, so a select needs these select rules.
*/
select:is(:user-invalid, .user-invalid-fallback) {
  border-color: #d93025;
  background-color: #fce8e6;
}

select:is(:user-invalid, .user-invalid-fallback) + .error-msg {
  display: block;
}

select:is(:user-valid, .user-valid-fallback) {
  border-color: #188038;
}
```

## Fallbacking & Browser Support

{{ FEATURE_FALLBACKS("user-pseudos") }}

If you use the JavaScript fallback, initialize it on the form that holds the select:

```javascript
UserInvalidFallback.init(document.getElementById('country-form'));
```

## Other Considerations

1.  **Mobile behavior**: On mobile devices, "blur" might happen differently depending on the OS picker. Testing on actual devices is recommended.
2.  **Accessibility**: {{ FEATURE("user-pseudos", "aria-invalid") }}
