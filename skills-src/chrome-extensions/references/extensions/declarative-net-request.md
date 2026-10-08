# Declarative Net Request (Content Filtering)

## Setup

```json
{
  "permissions": ["declarativeNetRequest"],
  "declarative_net_request": {
    "rule_resources": [{
      "id": "ruleset_1",
      "enabled": true,
      "path": "rules/rules.json"
    }]
  }
}
```

Add `"declarativeNetRequestFeedback"` permission to use `onRuleMatchedDebug` (dev only).

## Rule Format

`rules/rules.json`:
```json
[
  {
    "id": 1,
    "priority": 1,
    "action": { "type": "block" },
    "condition": {
      "urlFilter": "||doubleclick.net/",
      "resourceTypes": ["script", "image", "xmlhttprequest", "sub_frame"]
    }
  },
  {
    "id": 2,
    "priority": 1,
    "action": { "type": "block" },
    "condition": {
      "urlFilter": "||google-analytics.com/",
      "resourceTypes": ["script", "xmlhttprequest"]
    }
  }
]
```

### Rule Fields

- `id`: Unique integer per rule
- `priority`: Higher priority rules win conflicts
- `action.type`: `"block"`, `"redirect"`, `"allow"`, `"modifyHeaders"`, `"allowAllRequests"`, `"upgradeScheme"`
- `condition.urlFilter`: Pattern matching (supports `*`, `||`, `|`, `^`)
- `condition.resourceTypes`: Array of resource types to match

### URL Filter Patterns

Anchor filters to a whole domain. An unanchored or unterminated filter also matches unrelated URLs.

| Pattern | Matches |
|---------|---------|
| `"||doubleclick.net/"` | doubleclick.net and all its subdomains, any path (use this for domain blocking) |
| `"||example.com/ads/"` | Paths under `/ads/` on example.com and its subdomains |
| `"|https://www.example.com/"` | www.example.com only (no other subdomains), any path |
| `"doubleclick.net"` | ❌ Any URL containing the text, including `https://example.com/?ref=doubleclick.net` |
| `"||doubleclick.net"` | ❌ Also matches lookalike domains such as `doubleclick.network` |

`*://*.example.com/*` is match-pattern syntax for `host_permissions`, not `urlFilter` syntax.

### Resource Types

`main_frame`, `sub_frame`, `stylesheet`, `script`, `image`, `font`, `object`, `xmlhttprequest`,
`ping`, `csp_report`, `media`, `websocket`, `webtransport`, `webbundle`, `other`

## Dynamic Rules (runtime)

```js
// Add rules at runtime
await chrome.declarativeNetRequest.updateDynamicRules({
  addRules: [{
    id: 1000,
    priority: 1,
    action: { type: 'block' },
    condition: { urlFilter: '||ads.example.com/' }
  }],
  removeRuleIds: [] // IDs to remove
});
```

## Tracking Blocked Requests

`onRuleMatchedDebug` only works in dev (unpacked) and requires `declarativeNetRequestFeedback`:

```js
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  // info.request, info.rule
});
```

For production, let Chrome count matched rules instead of observing traffic with `webRequest`
(which would need broad host permissions and count requests your rules never blocked):

```js
// Show the per-tab count of matched rules as the action badge (needs an "action" key).
await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });

// List the rules matched in a tab, e.g. from the popup. Without declarativeNetRequestFeedback,
// this needs an activeTab grant for that tab (the action click that opens the popup grants it).
const { rulesMatchedInfo } = await chrome.declarativeNetRequest.getMatchedRules({ tabId: tab.id });
```

## Limits

- Static rules: 30,000 guaranteed per extension, plus an additional 300,000 from a pool shared between extensions
- Dynamic rules: 30,000
- Session rules: 5,000
