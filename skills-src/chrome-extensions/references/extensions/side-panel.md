# Side Panel

## Setup

Add to manifest.json:
```json
{
  "permissions": ["sidePanel"],
  "side_panel": {
    "default_path": "sidepanel/sidepanel.html"
  }
}
```

## Opening the Side Panel — REQUIRED

**A side panel definition alone does NOT make it openable.** You MUST provide an explicit
trigger to open it. Without one of these, users have no way to access the panel:

### Most common: Open on action icon click

If the extension's primary function is the side panel, remove `default_popup` from the action
and use `chrome.action.onClicked` to open the side panel:

```js
// service-worker.js
chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ windowId: tab.windowId });
});
```

⚠️ `chrome.action.onClicked` only fires when there is NO `default_popup` set. If you have both
a popup and a side panel, open the side panel from the popup via a button, or use a different
trigger.

### Alternative triggers

```js
// Open from a context menu item
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'open-panel') {
    await chrome.sidePanel.open({ windowId: tab.windowId });
  }
});

// Open from a keyboard shortcut (defined in manifest commands).
// sidePanel.open() must run in response to the user action: call it before any other await.
// onCommand passes the active tab, so no tabs.query() is needed first.
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'open-side-panel' && tab) {
    chrome.sidePanel.open({ windowId: tab.windowId });
  }
});
```

You can also open it for a specific tab:
```js
await chrome.sidePanel.open({ tabId: tab.id });
```

### Simplest: Auto-open via setPanelBehavior

If the side panel should open whenever the user clicks the extension icon, use `setPanelBehavior`
as a one-liner instead of an `onClicked` listener:

```js
// service-worker.js
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
```

⚠️ **The property is `openPanelOnActionClick` — NOT `openPanelOnActionIconClick`.**
Using the wrong name causes a synchronous TypeError that silently aborts the service worker.

When using `setPanelBehavior`, do NOT also define `default_popup` — the popup takes priority.

## Setting Panel Per-Tab

```js
// Different side panel content for different tabs
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (tab.url?.includes('github.com')) {
    await chrome.sidePanel.setOptions({
      tabId,
      path: 'sidepanel/github-panel.html',
      enabled: true
    });
  }
});
```

## Communication with Side Panel

The side panel is an extension page, so it can use all chrome.* APIs directly and communicate
with the service worker via `chrome.runtime.sendMessage` / `chrome.runtime.onMessage`.

To get data from the active tab's content script:

```js
// In side panel JS
async function getPageContent() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTENT' });
  return response;
}
```

Or use `chrome.scripting.executeScript` from the side panel. It needs the `scripting` permission and access to the tab: a matching host permission, or an `activeTab` grant that already exists for that tab (for example, from the action click that opened the panel). A click inside the panel does not create a grant — see below.

```js
const [{ result }] = await chrome.scripting.executeScript({
  target: { tabId: tab.id },
  func: () => document.body.innerText
});
```

## Side Panel vs Popup

| Feature | Side Panel | Popup |
|---------|-----------|-------|
| Stays open | Yes | Closes when clicking away |
| Resizable | Yes (by user) | Fixed size |
| Coexists with page | Yes (side by side) | Overlays page |
| Use when | Extended interaction, reading | Quick actions, settings |

## Important Notes

- The side panel shares a single instance per window — opening it replaces existing content
- Use `chrome.sidePanel.setOptions({ enabled: false })` to disable for specific tabs
- Side panel HTML files have full access to chrome.* APIs
- The side panel persists across tab switches (per-window)

### ⚠️ Clicks inside the side panel do NOT grant `activeTab`

`activeTab` is granted when the user invokes the extension: clicking the extension icon, context
menu items, keyboard shortcuts, or omnibox suggestions. **Clicking a button inside a side panel
does NOT create a new grant.** A grant from the action click that opened the panel still covers
that tab until the user navigates to another site, but not tabs the user switches to afterwards.

If your side panel must read or modify page content on tabs it was not invoked on (e.g., a
"Summarize" button that works after tab switches), declare host access for only the sites it
needs. Host access also exposes `tab.url`/`tab.title`, so `tabs` is not required:

```json
{
  "permissions": ["scripting", "sidePanel"],
  "host_permissions": ["https://docs.example.com/*"]
}
```

Use `"<all_urls>"` only when the panel genuinely works on every site (and expect extra review
scrutiny), or request it at runtime through `optional_host_permissions`.
