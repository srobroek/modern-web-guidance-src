---
name: sequence-distributed-events
description: Log and sequence operations in distributed microservices or high-throughput tracing environments by recording nanosecond-precision Temporal.Instant timestamps and ordering events with logical clocks.
web-feature-ids:
    - temporal
---


# Sequencing Distributed Events

High-frequency tracing and event logging in distributed systems need two separate things: a wall-clock timestamp for each event, and a reliable order between events. Standard JavaScript `Date.now()` returns whole milliseconds, so events in the same millisecond share a timestamp.

`Temporal.Instant` stores an exact point in time with nanosecond precision (`epochNanoseconds`) and serializes it as an ISO 8601 string, which makes it the right type for event timestamps. It does **not** make timestamps unique or give a reliable order:

- **Clock readings are coarsened**: `Temporal.Now.instant()` returns the current time at the precision the engine allows. Chrome rounds it to 0.1 ms (0.005 ms when cross-origin isolated) and Firefox to 1 ms, so back-to-back events often get the same instant even though the type can hold nanoseconds.
- **Wall clocks can move backwards**: the system clock can be adjusted (for example by NTP), so a later event can receive an earlier instant.
- **Clocks on different nodes disagree**: instants recorded on different machines are skewed against each other, so comparing them cannot prove which event happened first or which event caused another.

Order events with a logical clock, and use `Temporal.Instant` for the wall-clock time of each event.

## How to Implement

To sequence high-frequency events:

1. **Keep a logical clock per node**: Each node (process, worker, or tab) keeps a Lamport counter. Increment it for every local event, attach it to every message the node sends, and when a message arrives, set the counter to the larger of the local and received values before recording the receive event.
2. **Capture wall-clock timestamps**: Record `Temporal.Now.instant()` with each event, for display, serialization, and approximate latency.
3. **Sort by logical clock, then node ID**: This gives every node the same total order, and it respects causality: an event that caused another always sorts first. Use the timestamp only as a display value, never as the ordering key.
4. **Calculate approximate delays**: Use `Temporal.Instant.prototype.since(other)` for the wall-clock time between events. Across nodes, the result includes clock skew. For precise durations within one process, use `performance.now()`, which is monotonic.
5. **Serialize for transmission**: Use `Temporal.Instant.prototype.toString()` to convert the timestamp to a standard ISO 8601 string for logging or network transmission.

## Example Code: High-Frequency Event Sequencing

```javascript
// One logical clock per node (process, worker, or tab).
let lamportClock = 0;

// 1. Record a local event: tick the logical clock and capture the wall-clock time.
function recordEvent(eventType, nodeId) {
  lamportClock += 1;
  return {
    nodeId,
    eventType,
    lamport: lamportClock,             // Ordering key
    timestamp: Temporal.Now.instant()  // Wall-clock time; may repeat or go backwards
  };
}

// 2. Attach the clock to outgoing messages, and advance past it on receipt.
function sendMessage(payload, nodeId) {
  const event = recordEvent('send', nodeId);
  return { payload, lamport: event.lamport, timestamp: event.timestamp.toString() };
}

function receiveMessage(message, nodeId) {
  lamportClock = Math.max(lamportClock, message.lamport);
  return recordEvent('receive', nodeId);
}

// 3. Sort by logical clock, then node ID, for a total order that is the same on every node.
function compareNodeIds(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function sequenceEvents(events) {
  return [...events].sort((a, b) => a.lamport - b.lamport || compareNodeIds(a.nodeId, b.nodeId));
}

// 4. Report approximate wall-clock delays between consecutive events.
function analyzeTelemetry(sortedEvents) {
  for (let i = 1; i < sortedEvents.length; i++) {
    const prev = sortedEvents[i - 1];
    const curr = sortedEvents[i];

    // Includes clock coarsening and, across nodes, clock skew; can be zero or negative.
    const nsDiff = curr.timestamp.since(prev.timestamp).total('nanoseconds');

    console.log(`Delay between Event ${prev.eventType} and Event ${curr.eventType}: ~${nsDiff}ns`);
  }
}
```

## Strategic Implementation & Best Practices

- **DO** use `Temporal.Now.instant()` to timestamp events for logs and traces, and `toString()` to serialize them.
- **DO** order events with a logical clock (a Lamport counter, or a per-node sequence number when events never cross nodes), with the node ID as the tiebreaker.
- **DO NOT** rely on `Temporal.Now.instant()` or `Date.now()` to give unique values or a reliable order. Both can repeat for back-to-back events and can go backwards when the system clock is adjusted.
- **DO NOT** compare instants from different nodes to decide which event happened first; clock skew between machines makes that order unreliable.
- **DO** use `performance.now()` to measure precise durations within one process; it is monotonic, unlike the wall clock.
- **DO NOT** blame out-of-order traces on sort stability: `Array.prototype.sort()` is stable, so events with equal keys keep their input order. The problem is that equal timestamps carry no order information; the logical clock gives each event on a node a distinct key that respects causality.
- **DO NOT** use `Temporal.Instant` for wall-clock time display unless you pair it with a time zone (use `Temporal.ZonedDateTime` for localized display).
- **DO** verify that the environment supports `Temporal` before using it natively or providing a fallback.

## Fallback strategies

{{ FEATURE_FALLBACKS("temporal") }}
