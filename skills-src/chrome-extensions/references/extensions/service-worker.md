# Service Worker Lifetime & State Management

## The Core Problem

Chrome terminates extension service workers after ~30 seconds of inactivity. Unlike Manifest V2
persistent background pages, you CANNOT rely on in-memory state.

## Rules

1. **Never store state in global variables** — treat every event handler as if the SW just started (in-flight coordination such as the update queue below is fine; it is never the source of truth)
2. **Use chrome.storage for all persistent state** — read on demand, write after changes
3. **Use chrome.alarms for timers** — not setTimeout/setInterval (these die with the SW)
4. **Use chrome.storage.session for ephemeral session state** — survives SW restart but not browser restart

## Storage Tier Selection

| Need | Use |
|------|-----|
| Survives browser restart, syncs across devices | `chrome.storage.sync` (8KB/item, 100KB total) |
| Survives browser restart, local only | `chrome.storage.local` (10MB default) |
| Survives SW restart only | `chrome.storage.session` (10MB default) |
| Never persisted (avoid) | Global variables ❌ |

## Pattern: State Read-on-Demand

```js
// ❌ BAD: State in memory
let count = 0;
chrome.webNavigation.onCompleted.addListener(() => {
  count++;
  chrome.action.setBadgeText({ text: String(count) });
});

// ✅ GOOD: State in storage, with read-modify-write updates serialized. Overlapping events
// would otherwise both read the same count across the await and lose an increment.
let storageQueue = Promise.resolve();
function updateStorage(update) {
  const run = storageQueue.then(update);
  storageQueue = run.catch(() => {}); // keep the queue usable after a failed update
  return run;
}

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId !== 0) return; // Main frame only
  return updateStorage(async () => {
    const { visitCount } = await chrome.storage.local.get({ visitCount: 0 });
    await chrome.storage.local.set({ visitCount: visitCount + 1 });
    await chrome.action.setBadgeText({ text: String(visitCount + 1) });
  });
});
```

## Pattern: Alarms Instead of Timers

```js
// ❌ BAD: Timer dies when SW terminates
setInterval(() => checkForUpdates(), 60000);

// ✅ GOOD: Alarm persists
chrome.alarms.create('check-updates', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'check-updates') {
    checkForUpdates();
  }
});
```

Minimum alarm interval: 0.5 minutes.

## Pattern: One-Time Initialization

```js
// Set up defaults and context menus on install
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await chrome.storage.local.set({ settings: defaultSettings });
  }
  // Menus persist across SW restarts, and create() with an existing id fails with
  // "Cannot create item with duplicate id" — so create them here, not at every SW start.
  chrome.contextMenus.create({
    id: 'myItem',
    title: 'My Context Menu Item',
    contexts: ['selection']
  });
});
```

## Pattern: Keeping the SW Alive (When Necessary)

Chrome stops an idle SW after 30 seconds without events or extension API calls. Occasionally you
need it alive for a long-running operation. Use one of:

1. **Extension API calls or events** — each one resets the idle timer
2. **Long-lived port messages** — since Chrome 114, sending a message over a port keeps the SW
   alive; merely holding a port open does NOT
3. **WebSocket traffic** — since Chrome 116, sending or receiving WebSocket messages resets the timer

```js
// Port-based keepalive from popup/side panel: the SW stays alive only while messages flow
const port = chrome.runtime.connect({ name: 'keepalive' });
const keepAlive = setInterval(() => port.postMessage({ type: 'ping' }), 20_000);
port.onDisconnect.addListener(() => clearInterval(keepAlive));
```

Do not create an offscreen document only to keep code running: `chrome.offscreen.createDocument()`
requires a reason such as `DOM_PARSER` or `AUDIO_PLAYBACK`, and keep-alive is not one.

⚠️ Do NOT abuse keepalive patterns. Chrome may enforce stricter limits in future versions.

## Pattern: Event Registration

All event listeners MUST be registered synchronously at the top level of the service worker.
Chrome replays events to a restarted SW, but only for listeners that were registered synchronously.

```js
// ✅ GOOD: Top-level registration
chrome.runtime.onMessage.addListener(handleMessage);
chrome.tabs.onUpdated.addListener(handleTabUpdate);
chrome.webNavigation.onCompleted.addListener(handleNavigation);

// ❌ BAD: Conditional or async registration
async function setup() {
  const { enabled } = await chrome.storage.local.get('enabled');
  if (enabled) {
    chrome.tabs.onUpdated.addListener(handleTabUpdate); // Too late!
  }
}
setup();
```

Instead, register all listeners and check conditions inside them:

```js
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const { enabled } = await chrome.storage.local.get('enabled');
  if (!enabled) return;
  // Process...
});
```

## Date-Based Resets

For daily counters, store the date alongside the count:

```js
function getToday() {
  return new Date().toISOString().split('T')[0]; // "2025-01-15"
}

// Run through updateStorage() (above) so two events on the same day cannot both read the same count.
function incrementDailyCount() {
  return updateStorage(async () => {
    const { dailyCount = 0, countDate = '' } = await chrome.storage.local.get(['dailyCount', 'countDate']);
    const today = getToday();
    const newCount = countDate === today ? dailyCount + 1 : 1; // new day — reset
    await chrome.storage.local.set({ dailyCount: newCount, countDate: today });
    return newCount;
  });
}
```
