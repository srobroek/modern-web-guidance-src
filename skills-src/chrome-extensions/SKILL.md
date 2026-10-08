---
name: chrome-extensions
description: >
  Build and publish Chrome Extensions using Manifest V3 best practices. Use this skill
  whenever the user asks to create, modify, debug, or understand Chrome browser extensions,
  add-ons, or anything involving the Chrome Extensions API. Trigger on mentions of: 'Chrome
  extension', 'browser extension', 'manifest.json', 'content script', 'service worker' (in
  browser context), 'popup' (in browser extension context), 'side panel', 'chrome.* API',
  'declarativeNetRequest', 'omnibox', 'context menu' (in extension context), 'userScripts',
  'user script', 'script manager', or any request to build functionality that integrates with
  the Chrome browser UI. Also trigger for publishing to the Chrome Web Store: 'publish
  extension', preparing an extension for publishing, responding to a review rejection, writing
  permission justifications, or drafting a privacy policy.
---

# Chrome Extensions

Build production-quality Chrome extensions using Manifest V3 and publish them to the Chrome Web Store.

## Part 1 — Building Extensions

### Mandatory Rules

These address the most common causes of broken extensions. Violating any produces a non-functional build.

#### 1. Icons: only reference files you create — or omit icons entirely

```
❌ BROKEN — referencing files that don't exist or reusing one file for all sizes:
   "icons": { "16": "icon.png", "48": "icon.png", "128": "icon.png" }

✅ CORRECT — each size is a separate file at the correct pixel dimensions:
   "icons": { "16": "icons/icon-16.png", "48": "icons/icon-48.png", "128": "icons/icon-128.png" }
   (where icon-16.png is 16×16px, icon-48.png is 48×48px, icon-128.png is 128×128px)

✅ ALSO CORRECT — omit icons from manifest if you cannot generate real PNG files:
   (just remove the "icons" and "default_icon" fields — Chrome uses a default icon)
```

**If you include icon references, you MUST create the actual image files.** Generate them with a script (see `references/extensions/icons.md`) or leave them out. Never reference non-existent files.

#### 2. Side panel: you MUST provide a way to open it

Defining `"side_panel": {"default_path": "..."}` does NOT make it openable. Add a trigger:

```js
// In service-worker.js — open side panel on extension icon click
// IMPORTANT: chrome.action.onClicked ONLY fires when there is NO default_popup
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
```

If the extension has both a popup AND side panel, add a button in the popup that calls `chrome.sidePanel.open()`. Alternatively, use `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })` — but the property is `openPanelOnActionClick`, NOT `openPanelOnActionIconClick`; the "Icon" variant causes a synchronous TypeError that silently aborts the service worker. Do NOT also define `default_popup` when using `setPanelBehavior`. See `references/extensions/side-panel.md`.

#### 3. Code execution: manifest-declared sandbox pages ONLY

Extension CSP blocks `eval()`, `new Function()`, inline `<script>` in all extension pages. `blob:` and `srcdoc` iframes do NOT escape it: both inherit the creating page's CSP, so their scripts stay blocked.

```js
// ❌ BROKEN — direct iframe DOM access throws SecurityError
iframe.contentDocument.write(html);

// ❌ BROKEN — eval in extension page
eval(userCode); // CSP blocks this

// ❌ BROKEN — blob: and srcdoc documents inherit the extension page's CSP
iframe.src = URL.createObjectURL(new Blob([doc], { type: 'text/html' }));
iframe.srcdoc = `<script>${js}<\/script>`;

// ✅ CORRECT — sandbox page in manifest + postMessage
// manifest.json: { "sandbox": { "pages": ["sandbox.html"] } }
iframe.contentWindow.postMessage({ html, css, js }, '*');
// sandbox.html runs in a unique origin with its own CSP, so eval is allowed there.
// Only accept messages from the embedding extension page:
window.addEventListener('message', (e) => {
  if (e.source !== window.parent) return;
  eval(e.data.js);
});
```

See `references/extensions/csp-sandbox.md` for full details.

#### 4. `tab.url` and `tab.title` need tab access

`tab.url`, `tab.pendingUrl`, `tab.title`, and `tab.favIconUrl` are populated only when the extension has the `tabs` permission, a host permission matching the tab, or an `activeTab` grant for it. Otherwise they are `undefined` — no error thrown. Request `tabs` only when you must read these fields for tabs you have no host access to. See
`references/extensions/permissions.md`.

#### 5. Always use async/await — never `.then()` chains

```js
// ❌ BAD
chrome.tabs.query({active: true, currentWindow: true}).then(tabs => {
  chrome.scripting.executeScript({target: {tabId: tabs[0].id}, files: ['content.js']}).then(() => {});
});

// ✅ GOOD
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
```

For `runtime.onMessage` listeners that do async work:

```js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    const data = await chrome.storage.local.get('key');
    sendResponse({ data });
  })();
  return true; // keeps channel open
});
```

#### 6. Content scripts: don't block the main thread

When modifying many DOM elements, batch with `requestAnimationFrame` and yield between batches:

```js
async function highlightAll(elements) {
  const BATCH = 20;
  for (let i = 0; i < elements.length; i += BATCH) {
    await new Promise(r => requestAnimationFrame(() => {
      elements.slice(i, i + BATCH).forEach(el => el.style.backgroundColor = 'yellow');
      r();
    }));
    if (globalThis.scheduler?.yield) await scheduler.yield();
  }
}
```

See `references/extensions/content-scripts.md`.

#### 7. Service workers are ephemeral — never store state in variables

```js
// ❌ BROKEN — state lost when SW terminates (~30s of inactivity)
let count = 0;
chrome.tabs.onUpdated.addListener(() => { count++; });

// ✅ CORRECT — persist in chrome.storage, read on every event
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
  if (changeInfo.status !== 'complete') return;
  const { count = 0 } = await chrome.storage.local.get('count');
  await chrome.storage.local.set({ count: count + 1 });
  await chrome.action.setBadgeText({ text: String(count + 1) });
});
```

Use `chrome.alarms` instead of `setTimeout`/`setInterval`. See `references/extensions/service-worker.md`.

#### 8. chrome.identity: extension ID differs between dev and production

When using Google sign-in, the OAuth client_id is tied to a specific extension ID. The ID changes between unpacked development and the Chrome Web Store.

To keep one ID across development and the store, add the store item's public key as the `"key"` field in manifest.json:
1. Upload the zipped extension in the Chrome Developer Dashboard without publishing it
2. On the item's **Package** tab, click **View public key** and copy the key as one line
3. Add `"key": "MIIBIjANBgkqh..."` to manifest.json

If the manifest does not carry that key, document: "After publishing to the Chrome Web Store, update the OAuth client with the store-assigned extension ID." See `references/extensions/auth-identity.md`.

#### 9. Context menus: show user feedback after action

When a context menu item performs an action (save, copy, etc.), confirm it to the user. Use a notification, badge flash, or injected toast — don't let actions happen silently. See `references/extensions/context-menus.md` for a badge-flash example and when to use the alternatives.

#### 10. Prompt API: available in service workers, popup, and side panel

The `LanguageModel` API works in all extension contexts — service worker, popup, and side panel — with no additional manifest permissions required. Extensions also get `LanguageModel.params()`, which is unavailable on the web:

```js
const params = await LanguageModel.params();
// { defaultTopK: 3, maxTopK: 128, defaultTemperature: 1, maxTemperature: 2 }
```

For general Prompt API patterns (availability checks, session creation, streaming), use the `modern-web-guidance` skill. See `references/extensions/prompt-api.md` for the extension-specific wiring example.

#### 11. `chrome.action` API requires `action` in manifest

Using `chrome.action.setBadgeText`, `chrome.action.setIcon`, or `chrome.action.onClicked` requires
an `"action"` key in manifest.json — even if it's empty. Without it, `chrome.action` is `undefined`.

```js
// ❌ BROKEN — manifest has no "action" key
await chrome.action.setBadgeText({ text: '5' });
// TypeError: Cannot read properties of undefined (reading 'setBadgeText')

// ✅ FIX — add "action" to manifest.json (at minimum an empty object)
{ "action": {} }
// or with a popup:
{ "action": { "default_popup": "popup/popup.html" } }
```

#### 12. `activeTab` comes from invoking the extension — not from clicks inside its pages

`activeTab` grants temporary access to the current tab only when the user invokes the extension
(action click, context menu item, keyboard shortcut, omnibox suggestion). A button click inside a
side panel or popup does NOT create a new grant. An existing grant (for example, from the action
click that opened a popup) still covers that tab until the user navigates to another site. When
the panel must act on tabs it has no grant for, request `host_permissions` for only the sites it
needs. See `references/extensions/permissions.md` and `references/extensions/side-panel.md`.

#### 13. DevTools panel URLs are relative to the extension root

When creating a DevTools panel, the panel HTML path is relative to the **extension root**, NOT
relative to the devtools page that calls `chrome.devtools.panels.create()`.

```js
// ❌ BROKEN — path relative to devtools/ directory
chrome.devtools.panels.create("My Panel", "", "panel/panel.html");

// ✅ CORRECT — full path from extension root
chrome.devtools.panels.create("My Panel", "", "devtools/panel/panel.html");
```

See `references/extensions/devtools.md`.

#### 14. Offscreen documents have NO access to most chrome.* APIs

Offscreen documents (`chrome.offscreen`) are **severely restricted**. Most `chrome.*` APIs
are unavailable, including `chrome.downloads`, `chrome.tabs`, `chrome.action`, and others.

```js
// ❌ BROKEN — chrome.downloads is undefined in offscreen documents
chrome.downloads.download({ url, filename: 'recording.webm' }); // TypeError

// ❌ BROKEN — chrome.action is undefined in offscreen documents
chrome.action.setBadgeText({ text: 'REC' }); // TypeError
```

**The only APIs available in offscreen documents are:**
- `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`
- `chrome.runtime.getURL`
- Standard Web APIs (DOM, fetch, MediaRecorder, Canvas, Web Audio, etc.)

**Rule of thumb:** Offscreen documents do the Web API work (recording, parsing, audio). The service worker does all chrome.* API work (downloads, badge updates, notifications). Use `chrome.runtime.sendMessage` to bridge between them. See `references/extensions/message-passing.md`.

#### 15. Notifications and badge icons must reference real image files

`chrome.notifications.create()` requires a valid `iconUrl` pointing to an actual image file.
If the file doesn't exist or the path is wrong, the call fails with `"Unable to download all specified images."`

```js
// ❌ BROKEN — icon file doesn't exist
chrome.notifications.create('reminder', {
  type: 'basic',
  iconUrl: 'icons/icon-128.png', // File not in extension!
  title: 'Reminder',
  message: 'Time is up!'
});

// ✅ Generate a data URL at runtime via OffscreenCanvas — no file needed.
// See `references/extensions/icons.md` for a reusable implementation.
const iconUrl = await getIconDataUrl();
chrome.notifications.create('reminder', { type: 'basic', iconUrl, title: 'Reminder', message: 'Time is up!' });
```

This applies to ALL image references in chrome.* APIs — notifications, `chrome.action.setIcon`,
context menu icons, etc. **If you reference a file, it must exist.**

#### 16. Tab capture: guard against double-start with synchronous admission

`chrome.tabCapture.getMediaStreamId()` fails with `"Cannot capture a tab with an active stream"`
if called while a previous capture is still active. Fast double-clicks on the extension icon
easily trigger this. A guard that reads state with `await` and writes it later is NOT a lock: both
clicks read `'idle'` before either writes. Claim the transition synchronously, then persist it:

```js
// ❌ BROKEN — no guard against rapid clicks
let isRecording = false;
chrome.action.onClicked.addListener(async (tab) => {
  if (isRecording) { stopRecording(); isRecording = false; }
  else { isRecording = true; startRecording(tab); } // Second click = "active stream" error
});

// ❌ BROKEN — check-then-set across an await: two fast clicks both see 'idle'
chrome.action.onClicked.addListener(async (tab) => {
  const { recordingState = 'idle' } = await chrome.storage.session.get('recordingState');
  if (recordingState === 'idle') {
    await chrome.storage.session.set({ recordingState: 'starting' }); // too late
    await startRecording(tab);
  }
});

// ✅ CORRECT — admit one transition at a time with a synchronous in-memory flag.
// The flag only serializes events inside one service worker instance; the committed state
// lives in chrome.storage.session (survives SW restart, cleared on browser close).
let transitionInFlight = false;

chrome.action.onClicked.addListener(async (tab) => {
  if (transitionInFlight) return; // checked and set before the first await
  transitionInFlight = true;
  try {
    const { recordingState = 'idle' } = await chrome.storage.session.get('recordingState');
    if (recordingState === 'idle') {
      await startRecording(tab);
      await chrome.storage.session.set({ recordingState: 'recording' });
      await chrome.action.setBadgeText({ text: 'REC' });
      await chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    } else {
      try { await stopRecording(); }
      finally {
        await chrome.storage.session.set({ recordingState: 'idle' });
        await chrome.action.setBadgeText({ text: '' });
      }
    }
  } catch (err) {
    console.error('Recording transition failed:', err);
  } finally {
    transitionInFlight = false;
  }
});
```

After a service worker restart, reconcile the stored state with reality before trusting it (for
example, `'recording'` with no offscreen document left means the capture ended). This pattern
applies to any chrome API that manages exclusive resources: `chrome.tabCapture`,
`chrome.desktopCapture`, `chrome.offscreen.createDocument` (only one offscreen document allowed at
a time). See `references/extensions/media-capture.md`.

#### 17. `chrome.desktopCapture` requires a target tab with URL access

When calling `chrome.desktopCapture.chooseDesktopMedia()` from a service worker, you must pass
the active tab as the `targetTab` parameter. The tab object must have its `url` field populated,
which requires the `"tabs"` permission, a host permission matching the tab, or an `activeTab`
grant for it.

```js
// ❌ BROKEN — called without targetTab from service worker
chrome.desktopCapture.chooseDesktopMedia(['screen', 'window'], (streamId) => { ... });
// Error: "A target tab is required when called from a service worker context."

// ❌ BROKEN — tab doesn't have url field (missing "tabs" permission)
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
chrome.desktopCapture.chooseDesktopMedia(['screen', 'window'], tab, (streamId) => { ... });
// Error: "targetTab doesn't have URL field set."

// ✅ CORRECT — "tabs" permission in manifest + pass tab object
// manifest.json: { "permissions": ["tabs", "desktopCapture"] }
const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
chrome.desktopCapture.chooseDesktopMedia(['screen', 'window'], tab, (streamId) => {
  if (!streamId) return; // User cancelled
});
```

**Note:** Prefer `chrome.tabCapture.getMediaStreamId()` for tab-only recording. Use `chrome.desktopCapture` only when the user should choose which screen/window to capture. See `references/extensions/media-capture.md`.

#### 18. User scripts: four non-obvious pitfalls

`chrome.userScripts` runs **user-provided code** at runtime. Use it for script managers and
user automation — not for extension-bundled scripts.

- **API is unusable until the user enables it.** Chrome 138+ requires the user to toggle "Allow User Scripts" on the extension's details page; Chrome < 138 requires Developer mode. Until then `chrome.userScripts` may be `undefined`, or defined with every method throwing. Always call `isUserScriptsAvailable()` (it calls `chrome.userScripts.getScripts()` inside `try`) before any `chrome.userScripts.*` call and show an error UI when it returns false.
- **Registered scripts are cleared on extension update.** Persist configs in `chrome.storage`; re-register them in `runtime.onInstalled` for the `"update"` reason.
- **Messaging requires explicit opt-in.** Call `configureWorld({ messaging: true })` first; listen on `runtime.onUserScriptMessage`, not `runtime.onMessage`.
- **`ScriptSource` constraint:** each `js` entry must have exactly one of `code` or `file`. **`id` constraint:** cannot start with `_`.

See `references/extensions/user-scripts.md`.

#### 19. `chrome.windows` has NO `.query()` method — use `getAll`, `getLastFocused`, or `getCurrent`

Unlike `chrome.tabs.query()`, the `chrome.windows` API does NOT have a `.query()` method.

```js
// ❌ BROKEN — chrome.windows.query does not exist
const windows = await chrome.windows.query({ focused: true });
// TypeError: chrome.windows.query is not a function

// ✅ CORRECT — use the right method for your need
const focused = await chrome.windows.getLastFocused({ populate: true });
const current = await chrome.windows.getCurrent({ populate: true });
const all     = await chrome.windows.getAll({ populate: true });
```

**`chrome.windows` methods:** `getAll`, `getLastFocused`, `getCurrent`, `get(windowId)`, `create`, `update`, `remove`. See `references/extensions/tab-management.md`.

#### 20. `chrome.permissions.request()` in the service worker must be called with no `await` before it in the message listener

A user gesture from a UI context (side panel, popup) does propagate across `chrome.runtime.sendMessage`
to the service worker's `onMessage` listener — but only for that one synchronous turn. If the
listener does an `await` (even a short delay) before calling `chrome.permissions.request()`, the
gesture is gone and the call throws `"This function must be called during a user gesture"`. Call
it as the first thing in the listener, with nothing awaited before it — see
`references/extensions/permissions.md`.

### Always Manifest V3

Never generate Manifest V2 code.
- `background.service_worker` not `background.scripts`
- `chrome.action` not `chrome.browserAction`
- `chrome.scripting.executeScript` not `chrome.tabs.executeScript`
- `host_permissions` is separate from `permissions`
- No inline scripts in HTML — use `<script src="file.js">`
- No inline event handlers — use `addEventListener`

---

## Part 2 — Publishing to the Chrome Web Store

Manage `CHROMEWEBSTORE.md` — the single source of truth for all Chrome Web Store listing
metadata, permissions justifications, privacy disclosures, version history, and publishing
readiness for a Chrome extension project.

### Core Workflow

When the user is publishing or preparing to publish an extension, or the project already has a
`CHROMEWEBSTORE.md` in its root, keep that file up to date. It tracks everything the developer
needs to fill out in the Chrome Developer Dashboard, so they can copy-paste from a single doc
instead of scrambling at publish time. Do not create it for extension work that is unrelated to
publishing.

#### When to create CHROMEWEBSTORE.md

Create it when any of these happen:
- The user says they want to publish an extension
- The user asks to "prepare for the store" or "get ready to publish"
- The user asks about store listing requirements

Use the template in `references/webstore/chromewebstore-template.md` as your starting point. Read it
before generating the file.

#### When to update CHROMEWEBSTORE.md

If the project has a `CHROMEWEBSTORE.md`, update it whenever:
- **User-facing changes**: Bump the "Last Updated" date, update the feature list in
  descriptions, and add an entry to Version History
- **manifest.json changes**: If permissions, host_permissions, or content_scripts changed,
  update the Permissions Justification section — every permission needs a plain-English
  reason the review team can understand
- **New release**: Add a Version History entry with version number, date, and summary
- **Privacy-relevant changes**: If data collection, storage, or transmission changed,
  update the Privacy & Data Use section and the privacy policy
- **Asset changes**: If icons or UI changed, note which screenshots need refreshing
- **Rejection response**: If the user reports a CWS rejection, update the file with the
  fix and add a note to Version History

### How to fill it out

For each section, pull information from the actual project files:
1. Read `manifest.json` to extract name, version, description, permissions, host_permissions
2. Scan the codebase for data collection (storage, fetch calls, analytics)
3. Check for icon files and their dimensions
4. Look at the extension's UI to understand features for the description

Write store-facing copy in a tone that is specific, honest, and benefit-oriented. The Chrome
Web Store review team rejects vague descriptions. "Makes your life easier" will be rejected.
"Highlights search results on any webpage and lets you save highlights to a local list" will
pass.

**Lead with user benefits, not implementation details.** Users care what the extension does for
them, not how it was built. For general-audience extensions, strip mentions of APIs, libraries,
frameworks, or code patterns. Developer tools may name the technologies their users work with
(for example, "Inspect Shadow DOM trees"), as long as each sentence still states a benefit:

| ❌ Implementation detail (cut it) | ✅ User benefit (keep it) |
|-----------------------------------|--------------------------|
| "Uses a MutationObserver to detect page changes" | "Automatically detects new content as you browse" |
| "Built with custom elements and Shadow DOM" | "Works seamlessly without affecting page styles" |
| "Powered by a service worker for background processing" | "Runs quietly in the background without slowing your browser" |
| "Leverages the chrome.storage.sync API" | "Your settings sync across all your devices" |
| "Implements declarativeNetRequest for filtering" | "Blocks ads and trackers without reading your page content" |

### CHROMEWEBSTORE.md Sections

Read `references/webstore/chromewebstore-template.md` before generating the file — it defines
what each section covers and how to fill it out. The highest-risk section is Permissions
Justification: write a specific plain-English reason per permission and per host_permission.
"Needed for the extension to work" will be rejected. Read `references/webstore/privacy-policy.md`
for guidance on generating a privacy policy.

### Pre-Publish Checklist

Before submission, run through `references/webstore/review-checklist.md`. The most common
first-submission failures:
- Every permission and host_permission must have a specific justification (not "needed to work")
- If the extension handles user data, the privacy policy URL must be live and match the data use
  disclosure form
- At least 1 screenshot at 1280×800 or 640×400
- ZIP must contain only the files the extension loads: no `.git/`, `node_modules/`, `.env*`,
  private keys (`*.pem`), or `CHROMEWEBSTORE.md`

### Store Listing Copy Guidelines

For copy guidelines and common rejection reasons, see `references/webstore/store-listing.md`.
Key rule: lead with function ("Highlights search terms on any webpage"), not feeling ("Enjoy
searching again").

---

## Reference Files

For detailed API patterns and publishing guidance, read the relevant file BEFORE writing code or content:

| Topic | Reference |
|-------|-----------|
| Permissions | `references/extensions/permissions.md` |
| Side panels | `references/extensions/side-panel.md` |
| Content scripts & DOM | `references/extensions/content-scripts.md` |
| Popups | `references/extensions/popup-ui.md` |
| Service worker lifetime | `references/extensions/service-worker.md` |
| Code execution & CSP | `references/extensions/csp-sandbox.md` |
| API calls | `references/extensions/api-calling.md` |
| Declarative Net Request | `references/extensions/declarative-net-request.md` |
| Chrome Prompt API | `references/extensions/prompt-api.md` |
| DevTools panels | `references/extensions/devtools.md` |
| Authentication | `references/extensions/auth-identity.md` |
| Context menus | `references/extensions/context-menus.md` |
| Omnibox | `references/extensions/omnibox.md` |
| Storage | `references/extensions/storage.md` |
| Tab & window management | `references/extensions/tab-management.md` |
| Tab/desktop capture | `references/extensions/media-capture.md` |
| User scripts | `references/extensions/user-scripts.md` |
| Message passing | `references/extensions/message-passing.md` |
| Icons | `references/extensions/icons.md` |
| CHROMEWEBSTORE.md template | `references/webstore/chromewebstore-template.md` |
| Privacy policy guidance | `references/webstore/privacy-policy.md` |
| Pre-publish review checklist | `references/webstore/review-checklist.md` |
| Store listing tips & rejections | `references/webstore/store-listing.md` |

## Output Checklist

Verify EVERY item before delivering:

- [ ] `manifest_version: 3` — no V2 APIs anywhere
- [ ] All icon files referenced in manifest exist as real files with correct dimensions — or icons are omitted
- [ ] Side panel has an explicit open trigger (not just a manifest declaration)
- [ ] Code execution uses a manifest-declared sandbox page — no `eval()` in extension pages, and no `blob:`/`srcdoc` frames as a CSP workaround
- [ ] `tab.url`/`tab.title` reads are covered by `tabs`, a matching host permission, or an `activeTab` grant
- [ ] All code uses `async`/`await` — no `.then()` chains
- [ ] Content scripts batch DOM updates with `requestAnimationFrame`
- [ ] Service worker persists state in `chrome.storage` — globals hold only transient, in-flight guards
- [ ] No inline scripts or event handlers in HTML
- [ ] Context menu actions show user confirmation
- [ ] `"action": {}` (or more) present in manifest if using `chrome.action.*` APIs
- [ ] If scripting tabs from a side panel: rely on an existing `activeTab` grant or scoped `host_permissions` — a click inside the panel grants nothing
- [ ] DevTools panel paths in `chrome.devtools.panels.create()` are relative to extension root
- [ ] Offscreen documents use ONLY `chrome.runtime` messaging — no `chrome.downloads`, `chrome.action`, etc.
- [ ] All image refs in `chrome.notifications`, `chrome.action.setIcon`, etc. point to real files (or use data URLs)
- [ ] Tab/desktop capture admits one start/stop transition at a time (synchronous guard, not an awaited storage read)
- [ ] `chrome.desktopCapture.chooseDesktopMedia` passes a `targetTab` whose `url` is populated
- [ ] `chrome.windows` calls use `getAll`/`getLastFocused`/`getCurrent` — NOT `.query()` (it doesn't exist)
- [ ] `chrome.permissions.request()` in a service worker `onMessage` listener is called with no `await` before it (gesture is lost after the first async gap)
- [ ] `chrome.userScripts` availability checked with a guarded method call before use (the API is undefined or throws until the user enables it)
- [ ] User script configs persisted in `chrome.storage` and restored on `runtime.onInstalled` `"update"` reason
- [ ] `configureWorld({ messaging: true })` called before user scripts send messages; listening on `onUserScriptMessage` not `onMessage`
- [ ] `ScriptSource` entries each have exactly one of `code` or `file` (not both, not neither)
- [ ] User script `id` values do not start with underscore
- [ ] `sidePanel.setPanelBehavior` uses `openPanelOnActionClick` — NOT `openPanelOnActionIconClick`
- [ ] Error handling on all async operations
- [ ] `host_permissions` scoped to specific domains (not `<all_urls>` unless needed)
- [ ] `return true` in `onMessage` listeners with async responses
- [ ] Any use of `"tab"` in `chrome.contextMenus` `contexts` requires Chrome M150+
