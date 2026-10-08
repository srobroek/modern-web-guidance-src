# Temporal

## Fallbacks

For browsers that do not yet support the native `Temporal` API, use feature detection and a polyfill. The standard reference polyfill is `@js-temporal/polyfill`.

Note that the polyfill does not automatically assign the `Temporal` object to the global scope to avoid conflicts. You must manually assign it if your code relies on the global `Temporal` object.

Start the app only after `Temporal` is available, on both paths: when the browser supports it natively and after the polyfill has loaded.

```javascript
// Resolve once Temporal is available, loading the polyfill only when it is missing.
async function ensureTemporal() {
  if (typeof Temporal === 'undefined') {
    // Prefer installing @js-temporal/polyfill as a project dependency and importing it
    // through your bundler. If you load it from a CDN, pin an exact version.
    const module = await import('https://esm.sh/@js-temporal/polyfill@0.5.1');
    globalThis.Temporal = module.Temporal;
  }
}

// Runs initializeApp() in native and polyfilled browsers alike.
ensureTemporal()
  .then(initializeApp)
  .catch((error) => {
    console.error('Temporal is unavailable:', error);
    // Show an "unsupported browser" message here instead of starting the app.
  });

function initializeApp() {
  // Your app logic that uses Temporal goes here.
}
```

Only extend `Date.prototype` if your code calls `date.toTemporalInstant()`. Add the polyfill's `toTemporalInstant` export inside the polyfill branch, and only when the method is missing, so you never overwrite a native implementation.
