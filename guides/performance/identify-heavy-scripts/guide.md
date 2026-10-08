---
name: identify-heavy-scripts
description: Identify the scripts most responsible for long animation frames
web-feature-ids:
  - long-animation-frames
---

# Identify heavy-running JavaScript

Heavy-running JavaScript can have a detrimental effect on both page load performance and interactivity. Modern web applications are more heavily reliant on JavaScript than ever before, from multiple sources. These include the application code itself (and the framework code it relies on), as well as third-party scripts that add functionality like chat widgets and video players. Behind-the-scenes analytics and marketing scripts are also common contributors that are all too easy to forget.

Identifying root causes of an unresponsive web page can be tricky with certain expertise required to run web performance tracing or profiling and how to interpret the results. Additionally field data is often very different to lab data, which only replicates a small subset of real user scenarios. This can make it difficult to identify the root causes of poor performance, especially for interactions.

The Long Animation Frames API is a lightweight API that can be used to identify heavy-running JavaScript in the field. A heavy-running script can be either a single long-running script, or a script that runs multiple times during the page lifecycle.

## How to implement

Long animation frames are monitored using the `PerformanceObserver` interface. It emits a `long-animation-frame` entry when an animation frame takes longer than 50ms to render. The entry contains information about the long animation frame, including the duration of the frame and the scripts that were executed during the frame.

The `long-animation-frame` entry contains a `scripts` property which is an array of `PerformanceScript` objects. Each `PerformanceScript` object contains information about the script that was executed during the long animation frame, including the `sourceURL` and `duration` of the script.

### Example of identifying the longest running scripts that contribute to long animation frames

```javascript
// Keep one running total per script source instead of every script entry.
// Memory stays bounded by the number of distinct sources, and each callback
// only processes its new entries instead of regrouping the whole history.
const totalsBySource = new Map();

const observer = new PerformanceObserver(list => {
  for (const entry of list.getEntries()) {
    for (const script of entry.scripts) {
      // Group by sourceURL so you can identify which scripts contribute
      // the most total time, even if each individual invocation is short.
      const totals = totalsBySource.get(script.sourceURL) ?? { count: 0, totalDuration: 0 };
      totals.count += 1;
      totals.totalDuration += script.duration;
      totalsBySource.set(script.sourceURL, totals);
    }
  }
});

// Use buffered: true to capture any long frames that occurred before
// this observer was registered.
observer.observe({type: 'long-animation-frame', buffered: true});

function getHeavyScripts() {
  return [...totalsBySource]
    .map(([sourceURL, totals]) => ({ sourceURL, ...totals }))
    // Only include scripts above a certain threshold (100ms is an example
    // value) to reduce noise.
    .filter(script => script.totalDuration > 100)
    // Sort by total duration so the worst offenders appear first,
    // making it easier to prioritize optimization efforts.
    .sort((a, b) => b.totalDuration - a.totalDuration);
}

// Report when the page is hidden instead of on every callback. The totals
// are cumulative, so each report replaces the previous one: send them with
// fetchLater() and abort the pending request when you send a newer one, or
// keep only the latest report per page view on the server.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    // Log to the console for local debugging. In production, send the
    // data to your analytics service (for example with fetchLater()).
    console.table(getHeavyScripts());
  }
});
```

## Best Practices

- **DO** prefer the Long Animation Frames API over alternatives like the JS Self-Profiling API, which carries higher runtime overhead.
- **DO** summarize the key information as the Long Animation Frames API contains a lot of detail.
- **DO** send the required information to an analytics service in production.

## Browser support and fallback strategies

{{ BASELINE_STATUS("long-animation-frames") }}.

The Long Animation Frames API is ignored by browsers that do not support it, so it can be safely used without fallbacks. In most cases the performance opportunities it identifies will apply to other browsers as well.
