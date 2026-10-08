---
name: calculate-total-foreground-time
description: Calculate the total time a user actually spent viewing a page, excluding periods when the tab was in the background.
web-feature-ids:
    - page-visibility-state
---

# Calculate total foreground time

This guide details how to accurately calculate the total time a user spends actively viewing a page. Traditional metrics like time-on-page often incorrectly include time spent with the page in the background. By using the `VisibilityStateEntry` API, you can measure only the "foreground time," providing a better metric of user engagement.

## Implementing foreground time calculation

The `PerformanceTimeline` API exposes visibility state changes as performance entries. Rather than reacting to `visibilitychange` events and manually accumulating time throughout a session, you can query the entire visibility history at any time.

MANDATORY: You must query the `visibility-state` performance entries to calculate the true foreground time.

```javascript
/**
 * Calculates total time the page was in the visible state.
 *
 * @returns {number|null} Total foreground time in milliseconds, or null when
 *   the browser has no visibility-state entries.
 */
function getTotalForegroundTime() {
  // MANDATORY: Query the visibility-state entries from the performance timeline.
  const entries = performance.getEntriesByType('visibility-state');

  // Unsupported browsers return an empty array. Feature-detect up front
  // (see "Fallbacks & browser support") instead of treating that as data.
  if (entries.length === 0) {
    return null;
  }

  let totalForegroundTime = 0;

  for (let i = 0; i < entries.length; i++) {
    // Only calculate duration for periods where the state was 'visible'
    if (entries[i].name === 'visible') {
      const start = entries[i].startTime;

      // The end time is the start time of the next state change,
      // or the current time if this is the final entry.
      const end = i + 1 < entries.length
          ? entries[i + 1].startTime
          : performance.now();

      totalForegroundTime += (end - start);
    }
  }

  return totalForegroundTime;
}
```

## Fallbacks & browser support

{{ FEATURE_FALLBACKS("page-visibility-state") }}

The `VisibilityStateEntry` API is a modern addition to the Performance Timeline and may not be supported in all browsers.

Feature-detect it with `PerformanceObserver.supportedEntryTypes`. **DO NOT** fall back to `performance.now()`: it is total time since navigation, including background time, so reporting it as foreground time inflates engagement in unsupported browsers and mixes two different metrics under one name.

In unsupported browsers, accumulate visible time from `visibilitychange` events instead, and report it under a separate label (for example `foreground_time_estimate`). Load this code as early as possible: it cannot see visibility changes that happened before it ran.

```javascript
const supportsVisibilityStateEntry =
  PerformanceObserver.supportedEntryTypes?.includes('visibility-state') ?? false;

let estimatedForegroundTime = 0;
// Assume the page was visible from navigation start if it is visible now;
// earlier background periods are unknown in this fallback.
let visibleSince = document.visibilityState === 'visible' ? 0 : null;

if (!supportsVisibilityStateEntry) {
  document.addEventListener('visibilitychange', () => {
    const now = performance.now();
    if (document.visibilityState === 'hidden' && visibleSince !== null) {
      estimatedForegroundTime += now - visibleSince;
      visibleSince = null;
    } else if (document.visibilityState === 'visible') {
      visibleSince = now;
    }
  });
}

function getForegroundTimeMetric() {
  if (supportsVisibilityStateEntry) {
    return { name: 'foreground_time', value: getTotalForegroundTime() };
  }
  const openPeriod = visibleSince !== null ? performance.now() - visibleSince : 0;
  return { name: 'foreground_time_estimate', value: estimatedForegroundTime + openPeriod };
}
```
