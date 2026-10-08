# Omnibox Integration

## Setup

```json
{
  "omnibox": { "keyword": "wiki" }
}
```

User types `wiki` + Space in the address bar to activate.

## Providing Suggestions

```js
// Descriptions are XML: escape the five predefined entities in any text you interpolate,
// or titles like "AT&T" and input containing "<" break the suggestion markup.
function escapeXml(text) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' };
  return text.replace(/[&<>"']/g, (ch) => entities[ch]);
}

let latestInput = '';

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  latestInput = text;
  if (text.length < 2) return;

  try {
    const response = await fetch(
      `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(text)}&limit=5&format=json`
    );
    const [, titles, , urls] = await response.json();
    // Responses can arrive out of order; drop results for input the user has already changed.
    if (text !== latestInput) return;

    const suggestions = titles.map((title, i) => ({
      content: urls[i],
      description: `${escapeXml(title)} - <url>${escapeXml(urls[i])}</url>`
    }));

    suggest(suggestions);
  } catch (err) {
    console.error('Search failed:', err);
  }
});
```

## Handling Selection

```js
chrome.omnibox.onInputEntered.addListener((text, disposition) => {
  const url = text.startsWith('http') ? text
    : `https://en.wikipedia.org/wiki/${encodeURIComponent(text)}`;

  switch (disposition) {
    case 'currentTab':
      chrome.tabs.update({ url });
      break;
    case 'newForegroundTab':
      chrome.tabs.create({ url });
      break;
    case 'newBackgroundTab':
      chrome.tabs.create({ url, active: false });
      break;
  }
});
```

## Description Formatting

Suggestions support XML-like formatting (escape interpolated text with `escapeXml()` above):
- `<url>text</url>` — renders as URL style
- `<match>text</match>` — bold match highlighting
- `<dim>text</dim>` — dimmed/secondary text

## Default Suggestion

```js
chrome.omnibox.onInputChanged.addListener((text, suggest) => {
  chrome.omnibox.setDefaultSuggestion({
    description: `Search Wikipedia for "<match>${escapeXml(text)}</match>"`
  });
  // ... fetch and suggest
});
```

## Required host_permissions

If fetching suggestions from an API, declare:
```json
{
  "host_permissions": ["https://en.wikipedia.org/*"]
}
```
