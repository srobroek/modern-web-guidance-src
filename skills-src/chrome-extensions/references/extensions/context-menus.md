# Context Menus

## Setup

```json
{ "permissions": ["contextMenus"] }
```

## Creating Menus

Create in the service worker in `onInstalled`. Menu items live in the browser, not the service worker, so they survive service worker restarts — and `create()` with an existing `id` fails with `Cannot create item with duplicate id`. Do not re-create them on every service worker start:

```js
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'save-link',
    title: 'Save to Reading List',
    contexts: ['link']        // Only show on right-click of links
  });

  chrome.contextMenus.create({
    id: 'translate-selection',
    title: 'Translate "%s"',   // %s = selected text
    contexts: ['selection']
  });

  // M150+: Context menu for the tab strip (right-clicking a tab)
  chrome.contextMenus.create({
    id: 'duplicate-tab',
    title: 'Custom Duplicate Tab',
    contexts: ['tab']
  });
});
```

## Handling Clicks

Confirm every action to the user — a silent save looks like a failure. A short badge flash on the
action icon needs no extra permissions (it requires an `"action"` key in the manifest):

```js
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  try {
    switch (info.menuItemId) {
      case 'save-link':
        await saveLink(info.linkUrl, info.selectionText || info.linkUrl);
        await flashBadge('✓', '#188038');
        break;
      case 'translate-selection':
        await translateText(info.selectionText, tab.id);
        break;
      case 'duplicate-tab':
        await chrome.tabs.duplicate(tab.id); // 'tab' parameter is the clicked tab
        break;
    }
  } catch (err) {
    console.error('Context menu action failed:', err);
    await flashBadge('!', '#d93025');
  }
});

// Shows short text on the action icon, then clears it.
async function flashBadge(text, color) {
  await chrome.action.setBadgeBackgroundColor({ color });
  await chrome.action.setBadgeText({ text });
  // A service worker can stop before a timer fires; clearing the badge is cosmetic, so a
  // lost timeout only leaves the mark visible until the next action.
  setTimeout(() => chrome.action.setBadgeText({ text: '' }), 2000);
}
```

For text the user should read (such as a translation), show it in the page with
`chrome.scripting.executeScript()` (needs the `scripting` permission plus `activeTab`, which the
menu click grants for that tab, or a matching host permission) or with `chrome.notifications`
(needs the `notifications` permission and a real icon file).

## Context Types

`all`, `page`, `frame`, `selection`, `link`, `editable`, `image`, `video`, `audio`, `launcher`, `browser_action`, `action`, `tab` (M150+)

## Submenus

```js
chrome.contextMenus.create({ id: 'parent', title: 'My Extension', contexts: ['page'] });
chrome.contextMenus.create({ id: 'child1', parentId: 'parent', title: 'Option 1', contexts: ['page'] });
chrome.contextMenus.create({ id: 'child2', parentId: 'parent', title: 'Option 2', contexts: ['page'] });
```

## Dynamic Updates

```js
chrome.contextMenus.update('save-link', { title: 'New Title' });
chrome.contextMenus.remove('save-link');
chrome.contextMenus.removeAll();
```
