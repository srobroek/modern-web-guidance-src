---
name: conditional-async-dependencies
description: Conditionally load or initialize async dependencies (such as importing polyfills for missing web features) without requiring complex orchestration across all of a page's script dependencies.
web-feature-ids:
  - top-level-await
---

# Conditional Async Dependencies

Top-level `await` allows modules to act as asynchronous functions, meaning they can pause module execution to await promises. This is extremely useful for conditionally loading async dependencies—like polyfills or heavy secondary libraries—only when required by the browser. 

By utilizing top-level await, you can encapsulate the conditional loading logic inside a single module, effectively preventing downstream consumer modules from executing until the dependency is fully loaded and ready.

### Conditional polyfill pattern

While top-level `await` can be used to conditionally load any async dependency that's a module, a good use of the conditional depenency loading pattern is to conditionally load polyfills for browsers that don't support a specific feature. This approach encapsulates feature detection and the dynamic import inside a single dependency module.

In the following case, the `popover` attribute polyfill is conditionally loaded if it isn't present on `HTMLElement.prototype`:

```javascript
// conditionally-load-polyfill.js

// Check if the feature is missing before doing work.
// MANDATORY: Prefer checking HTMLElement.prototype over window or document
// when checking for a global DOM attribute or property like popover.
if (!('popover' in HTMLElement.prototype)) {
  // Use top-level await to pause the execution of any module that imports this file 
  // until the polyfill finishes downloading and executing.
  await import('/path/to/popover-polyfill.js');
}

// Export a marker if needed by your application
export const polyfillLoaded = true;
```

```javascript
// main.js

// MANDATORY: Because conditionally-load-polyfill.js uses top-level await,
// the body of main.js does not run until the polyfill is ready.
import './conditionally-load-polyfill.js';

// Now it is safe to use the feature (e.g., showing a popover)
const myPopover = document.getElementById('my-popover');
if (myPopover) {
  myPopover.showPopover();
}
```

### Start the application after the polyfill module

**MANDATORY:** Top-level `await` only delays modules that import the awaiting module, directly or through their own imports. It does **not** delay sibling imports. In `import './conditionally-load-polyfill.js'; import './app.js';`, `app.js` does not import the polyfill module, so it can run *before* the polyfill has loaded.

Use one entry module that statically imports the polyfill module and then loads the rest of the application with a dynamic `import()`:

```javascript
// DO NOT rely on import order between siblings:
// main.js: import './conditionally-load-polyfill.js'; import './app.js';
// app.js may execute before the awaited polyfill import resolves.

// INSTEAD (entry.js): the only module that imports the awaiting module.
import './conditionally-load-polyfill.js';

// Start the app only after the polyfill is ready. Modules loaded from here
// can use the feature without importing the polyfill module themselves.
await import('./app.js');
```

Importing the polyfill module from every consumer also orders execution correctly, but many modules importing it at once triggers the Safari bug described below.

### Fallback strategies

{{ BASELINE_STATUS("top-level-await") }}

Top-level `await` is supported in Chrome 89 and Firefox 89. Safari 15 to 26 also run it, but have a WebKit bug (bug 242740) when multiple modules *simultaneously* import a module that contains a top-level `await`. Safari 27 fixes it, which is why the feature only became Baseline Newly available in 2026.

If you support Safari 15 to 26, use the single entry module pattern above: exactly one module statically imports the module that contains the top-level `await`.

If you must support browsers without top-level `await` at all, replace it with an `async` function that loads the polyfill and then calls `import('./app.js')`.
