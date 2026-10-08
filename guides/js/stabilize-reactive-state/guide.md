---
name: stabilize-reactive-state
description: Manage task deadlines or schedules in data-driven views without unexpected side effects from shared mutable state.
web-feature-ids:
  - temporal
---

# Stabilize Reactive State with Temporal

While some reactive systems (like [React](https://react.dev/)) rely strictly on reference equality to detect state changes, others (like [Vue](https://vuejs.org/) and [Svelte](https://svelte.dev/)) can track mutations to plain objects. However, for built-in objects like the legacy `Date` object, internal mutations (like `setHours()`) do not change the object's reference and are generally not tracked by any framework's default reactivity system. This leads to missed UI updates and hard-to-debug side effects.

The `Temporal` API solves this by providing immutable objects. Any operation that modifies a value (such as adding time or setting a field) returns a new instance with a new memory reference. This guarantees that state updates are always detected by reactive systems, ensuring UI stability.

## How to Implement

To stabilize reactive state using Temporal:

1. **Use Temporal types for state:** Store `Temporal` objects (like `Temporal.PlainDateTime` or `Temporal.PlainDate`) in your reactive state instead of legacy `Date` objects.
2. **Perform immutable updates:** When updating the state, use Temporal methods like `.add()`, `.subtract()`, or `.with()`. These methods return a new object.
3. **Pass the new reference to the state setter:** Use the newly created Temporal object to update your component state, triggering a reliable re-render.

## Example Code: Temporal vs Legacy Date in State

```javascript
// ❌ BAD: Mutating legacy Date breaks reactivity
let dateState = { deadline: new Date() };

function extendDeadlineBad() {
  // Mutates the object in place. Reference remains the same!
  dateState.deadline.setHours(dateState.deadline.getHours() + 1);

  // Frameworks will skip re-rendering because
  // prevState === nextState (same memory reference)
  updateState(dateState);
}

// ✅ GOOD: Temporal ensures immutability and reliable reactivity
let temporalState = { deadline: Temporal.Now.plainDateTimeISO() };

function extendDeadlineGood() {
  // Returns a new object with a new reference.
  const newDeadline = temporalState.deadline.add({ hours: 1 });

  // Create a new state object with the new Temporal reference
  temporalState = { deadline: newDeadline };

  // Frameworks will detect the reference change and re-render the UI
  updateState(temporalState);
}
```

## Strategic Implementation & Best Practices

- **DO** use `Temporal` for date/time values in reactive state when you also need its arithmetic, time zone, or calendar features. If you only need a new reference on each update, replacing the `Date` with a new instance (`new Date(old.getTime() + 60 * 60 * 1000)`) also works without a polyfill.
- **DO** use the most specific Temporal type for your use case (e.g., `Temporal.PlainDate` if you only need the calendar date) to avoid unnecessary complexity.
- **DO NOT** mutate `Date` objects in place when they are part of a component's state.
- **DO** ensure you handle environments without native support by conditionally loading a polyfill.

### Fallback strategies

{{ BASELINE_STATUS("temporal") }}

Since the `Temporal` API is a newer feature and may not be supported in all browsers, you should feature-detect it and conditionally load a polyfill if needed. Start your app only after `Temporal` is available.

```html
<!-- type="module" is required: top-level await is a SyntaxError in a classic script. -->
<script type="module">
  if (typeof Temporal === "undefined") {
    // Pin an exact version, or import @js-temporal/polyfill through your bundler.
    const module = await import("https://esm.sh/@js-temporal/polyfill@0.5.1");
    globalThis.Temporal = module.Temporal;
  }
  // Import app code after Temporal exists, so its top-level Temporal calls cannot run first.
  // "./app.js" is an example path for your application entry module.
  await import("./app.js");
</script>
```