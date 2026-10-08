# CSP & Sandboxed Code Execution

## Extension CSP Restrictions

Chrome Extensions enforce a strict Content Security Policy that cannot be relaxed for extension
pages (popup, side panel, options, new tab, etc.).

Blocked by default:
- `eval()`, `new Function()`, `setTimeout("string")`
- Inline `<script>` tags
- Inline event handlers (`onclick="..."`, `onload="..."`, etc.)
- `javascript:` URLs

## HTML Best Practices

```html
<!-- ❌ BAD: Inline script -->
<script>
  document.getElementById('btn').onclick = () => alert('hi');
</script>

<!-- ❌ BAD: Inline event handler -->
<button onclick="doThing()">Click</button>

<!-- ✅ GOOD: External script file -->
<script src="popup.js"></script>
```

In `popup.js`:
```js
document.getElementById('btn').addEventListener('click', () => {
  // Handle click
});
```

## Executing User Code (Code Playground Pattern)

If you need to execute arbitrary code (e.g., a CodePen-like playground), you MUST use a sandboxed
page. **Extension CSP completely blocks `eval()`, `new Function()`, and inline scripts in
normal extension pages.** There is no way around this — you need sandboxing.

### Sandboxed Page in Manifest

Declare a sandboxed page in manifest.json. Sandboxed pages are served in a unique origin with
their own CSP that allows `eval()` and inline scripts, but they cannot access chrome.* APIs.

```json
{
  "sandbox": {
    "pages": ["sandbox.html"]
  }
}
```

Use an iframe in your extension page to embed the sandbox:

```html
<!-- playground.html (extension page) -->
<iframe id="preview" src="sandbox.html"></iframe>
```

**CRITICAL:** Communication between the extension page and the sandboxed iframe MUST use
`postMessage`. You CANNOT access `iframe.contentDocument` or `iframe.contentWindow.document`
directly — this will throw:

```
SecurityError: Blocked a frame with origin "chrome-extension://..." from accessing a cross-origin frame.
```

Correct pattern:

```js
// playground.js — send code to sandbox
const iframe = document.getElementById('preview');
iframe.contentWindow.postMessage({
  html: htmlCode,
  css: cssCode,
  js: jsCode
}, '*');

// sandbox.js — receive and execute
window.addEventListener('message', (event) => {
  // Only run code sent by the extension page that embeds this sandbox; ignore messages from
  // any other window (for example, frames the user's HTML creates).
  if (event.source !== window.parent) return;
  const { html, css, js } = event.data;
  // Clear previous content
  document.body.innerHTML = '';
  document.head.querySelectorAll('style.user-style').forEach(s => s.remove());

  // Apply HTML
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  // Apply CSS
  const style = document.createElement('style');
  style.className = 'user-style';
  style.textContent = css;
  document.head.appendChild(style);

  // Execute JS (eval is allowed in sandbox!)
  try {
    eval(js);
  } catch (e) {
    const errEl = document.createElement('pre');
    errEl.style.color = 'red';
    errEl.textContent = e.message;
    document.body.appendChild(errEl);
  }
});
```

### Do NOT use `blob:` URLs or `srcdoc` to escape the CSP

An iframe loaded from a `blob:` URL or `srcdoc` inherits the policy container — including the
CSP — of the extension page that creates it, so inline `<script>` and `eval()` inside it stay
blocked. An unsandboxed `srcdoc` frame is also same-origin with the extension page, so untrusted
HTML in it can reach the page's DOM. Use the manifest sandbox page above.

### What NOT to Do

```js
// ❌ WILL FAIL: Trying to set iframe content directly
iframe.contentDocument.open();
iframe.contentDocument.write(html);
iframe.contentDocument.close();

// ❌ WILL FAIL: Accessing cross-origin sandbox DOM
const doc = iframe.contentWindow.document;
doc.body.innerHTML = html;

// ❌ WILL FAIL: eval in a normal extension page
eval(userCode); // CSP blocks this
```

## CSP for Remote Resources

Extension pages cannot load remote scripts by default. If you need external libraries:

1. **Bundle them** — download and include in your extension
2. **Use chrome.scripting to inject into web pages** — web pages have their own CSP

For content scripts injected into web pages, the web page's CSP does NOT apply to the
content script's own code. Content scripts run in an isolated world.
