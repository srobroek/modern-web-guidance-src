---
name: schedule-tasks-by-priority
description: Schedule tasks with different priorities to ensure critical work runs first while background work is deferred.
web-feature-ids:
  - scheduler
---

# Schedule Tasks By Priority

When building complex web applications, tasks have different levels of urgency. Completing tasks for the current view is more important than sending analytics or prefetching assets. The Prioritized Task Scheduling API allows you to schedule work with specific priorities, ensuring the browser remains responsive to user input.

### Scheduling tasks by priority

Use `scheduler.postTask()` to schedule tasks with one of three priorities:
- `user-blocking`: Tasks that block user interaction (e.g., input handling, critical rendering).
- `user-visible`: Tasks visible to the user but not blocking (default).
- `background`: Tasks that are not time-critical (e.g., analytics, prefetching).

```javascript
// Schedule a high-priority task that blocks user interaction
scheduler.postTask(() => {
  // DO: Handle critical updates that impact user interaction
  handleCriticalUpdate();
}, { priority: 'user-blocking' });

// Schedule a default priority task
scheduler.postTask(() => {
  // DO: Render non-critical content that is visible to the user
  renderSecondaryContent();
}); // Defaults to 'user-visible'

// Schedule a low-priority background task
scheduler.postTask(() => {
  // DO: Perform heavy background work that is not time-critical
  sendAnalytics();
}, { priority: 'background' });
```

### Fallback strategies

{{ BASELINE_STATUS("scheduler") }}

To support browsers that do not have the Prioritized Task Scheduling API, use the `scheduler-polyfill` package to maintain task prioritization:

- **Preferred**: install it as a project dependency (`npm install scheduler-polyfill`) and import it through your bundler (`import 'scheduler-polyfill';`), so the version is pinned and no third-party request is needed.
- **CDN**: if you load it from a CDN, pin the exact version, add Subresource Integrity, and handle load errors.
- **MANDATORY**: Never drop work when the polyfill fails to load. Run the tasks without prioritization instead, and use `scheduler.postTask()` only after checking that it exists.

```javascript
// Resolves once scheduler.postTask() is available, or once loading the polyfill has failed.
function ensureScheduler() {
  if ('scheduler' in globalThis && 'postTask' in globalThis.scheduler) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const script = document.createElement('script');
    // Pin the exact version and its integrity hash.
    script.src = 'https://unpkg.com/scheduler-polyfill@1.3.0/dist/scheduler-polyfill.js';
    script.integrity = 'sha384-2o6/LgF6skPeuH44UdAD21w9Uvex6hvXLK1JnQYYTLzmrxFMm9brLMsHB7WHgu37';
    script.crossOrigin = 'anonymous';
    script.onload = resolve;
    script.onerror = () => {
      console.warn('scheduler-polyfill failed to load; tasks will run without priorities.');
      resolve();
    };
    document.head.append(script);
  });
}

// Uses the native or polyfilled scheduler. Without one, the task still runs, in FIFO order.
function postTask(callback, options) {
  if ('scheduler' in globalThis && 'postTask' in globalThis.scheduler) {
    return globalThis.scheduler.postTask(callback, options);
  }
  return new Promise((resolve) => setTimeout(resolve, 0)).then(callback);
}

ensureScheduler().then(runScheduledTasks);

function runScheduledTasks() {
  postTask(() => {
    console.log('Task with priority support');
  }, { priority: 'background' });
}
```
