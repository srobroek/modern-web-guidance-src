# Chrome Prompt API (LanguageModel) — Extension-Specific Notes

The `LanguageModel` API (Prompt API) works in all extension contexts — service worker, popup,
side panel, and other extension pages — with no additional manifest permissions required.

For general Prompt API usage (availability checks, session creation, streaming, session
management), use the `modern-web-guidance` skill.

## Deprecated namespace

Extensions that used the origin trial may still have the old API surface. Remove it:

```js
// ❌ OLD — deprecated
const session = await self.ai.languageModel.create();

// ✅ CURRENT (Chrome 138+)
const session = await LanguageModel.create({ ... });
```

Also remove the expired permission from manifest.json:
```json
"permissions": ["aiLanguageModelOriginTrial"]  // ❌ remove this
```

## Extension-only: `LanguageModel.params()`

Extensions have access to `LanguageModel.params()`, which returns model constraints not
available on the web:

```js
const params = await LanguageModel.params();
// { defaultTopK: 3, maxTopK: 128, defaultTemperature: 1, maxTemperature: 2 }

const session = await LanguageModel.create({
  temperature: 0.7,
  topK: 5
});
```

## Complete extension example: page summarizer

A full wiring example showing manifest + service worker + side panel together.
A side panel button click does NOT grant `activeTab` (see Rule 12), so a summarizer that works on
any page declares host access to all sites. Host access also populates `tab.url`, so `tabs` is not
needed.

### manifest.json
```json
{
  "manifest_version": 3,
  "name": "AI Page Summarizer",
  "version": "1.0",
  "permissions": ["sidePanel", "scripting"],
  "host_permissions": ["<all_urls>"],
  "background": { "service_worker": "service-worker.js" },
  "side_panel": { "default_path": "sidepanel/sidepanel.html" },
  "action": { "default_title": "Summarize Page" }
}
```

### service-worker.js
```js
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
```

### sidepanel/sidepanel.js
```js
const statusEl = document.getElementById('status');
const summaryEl = document.getElementById('summary');
const summarizeButton = document.getElementById('summarize');
let busy = false;

summarizeButton.addEventListener('click', async () => {
  if (busy) return; // a second click would interleave chunks from two streams
  busy = true;
  summarizeButton.disabled = true;
  let session;
  try {
    if (!globalThis.LanguageModel) {
      statusEl.textContent = 'Prompt API not available in this browser.';
      return;
    }

    const availability = await LanguageModel.availability({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }]
    });
    if (availability === 'unavailable') {
      statusEl.textContent = 'AI model not available on this device.';
      return;
    }

    // Uses the "<all_urls>" host permission — activeTab does NOT come from a side panel click
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const [{ result: pageText }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const body = document.body.cloneNode(true);
        body.querySelectorAll('script, style, nav, footer, header').forEach(el => el.remove());
        return body.innerText.substring(0, 4000);
      }
    });

    session = await LanguageModel.create({
      expectedInputs: [{ type: "text", languages: ["en"] }],
      expectedOutputs: [{ type: "text", languages: ["en"] }],
      initialPrompts: [{ role: 'system', content: 'Summarize web page content in 3-5 bullet points.' }],
      monitor(m) {
        m.addEventListener('downloadprogress', (e) => {
          const pct = e.total ? Math.floor((e.loaded / e.total) * 100) : 0;
          statusEl.textContent = `Downloading model: ${pct}%`;
        });
      }
    });

    statusEl.textContent = '';
    summaryEl.textContent = '';
    for await (const chunk of session.promptStreaming(`Summarize:\n\n${pageText}`)) {
      summaryEl.textContent += chunk; // APPEND — do not replace
    }
  } catch (err) {
    // Restricted pages (chrome://, the Web Store) reject executeScript; prompts can fail too.
    statusEl.textContent = `Could not summarize this page: ${err.message}`;
  } finally {
    session?.destroy(); // free the model session even when the stream fails
    busy = false;
    summarizeButton.disabled = false;
  }
});
```
