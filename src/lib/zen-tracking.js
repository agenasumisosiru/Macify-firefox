// Active-work-time tracker for the Zen break reminder.
//
// Older versions used wall-clock elapsed time since the last reminder.
// That over-counts: a locked screen overnight or a long meeting in
// another app would still tick up the timer, so the pill could greet
// the user with "you've been at the screen for 456 min" the moment
// Chrome regained focus.
//
// New model: accumulate time only while chrome.idle reports `active`.
// A long enough idle/locked stretch is treated as a *natural break* and
// fully resets the accumulator — the user already took the break we
// would have nudged them toward.
//
// Chrome-specific: Firefox doesn't have the idle API.
// In Firefox, we assume the user is always "active" and never idle.
// This means:
// - The reminder counts wall-clock time
// - Idle detection is skipped
// - Users can still manually enter Zen mode to reset the timer
//
// All state lives in chrome.storage.session so it wipes on Chrome cold
// start; opening a fresh browser shouldn't surface a stale pill.
//
// Storage shape:
//   zenActiveStartedAt    — ms; current active period began here.
//                           Cleared while away.
//   zenAccumulatedActiveMs — ms; active time banked since last reset.
//   zenAwayAt             — ms; idle/locked period began here.
//                           Cleared on return.
//   zenSnoozedUntil       — ms; reminder is suppressed until this time.

import { cache } from './storage.js';

// Treat away periods of at least this long as a real break.
// Shorter than this: pause and resume so a quick coffee run doesn't
// reset a real working session. Longer: assume the body got what the
// pill would have suggested anyway.
const NATURAL_BREAK_MS = 5 * 60_000;

// iOS-alarm-style snooze duration applied when the user dismisses the
// pill. Fixed (not user-configurable) for the same reason iOS picked
// 9 minutes: a single, predictable number means users learn the
// behavior instead of fiddling with it.
export const SNOOZE_MS = 9 * 60_000;

// Brief auto-suppress after the pill is shown. Without this, opening
// several new tabs in quick succession would re-render the same pill
// in each one. 30s is enough to read the message and decide.
export const SHOW_DEBOUNCE_MS = 30_000;

// Check if idle API is available (Chrome only)
function hasIdleAPI() {
  return typeof chrome !== 'undefined' && chrome?.idle?.setDetectionInterval;
}

const KEYS = [
  'zenActiveStartedAt',
  'zenAccumulatedActiveMs',
  'zenAwayAt',
  'zenSnoozedUntil',
];

async function read() {
  try {
    if (hasIdleAPI()) {
      return await chrome.storage.session.get(KEYS);
    } else {
      // Firefox: use local storage fallback
      const result = {};
      for (const key of KEYS) {
        result[key] = await cache.get(key);
      }
      return result;
    }
  } catch (e) {
    console.warn('[zen-tracking] read failed:', e);
    return {};
  }
}

async function write(updates) {
  try {
    if (hasIdleAPI()) {
      return await chrome.storage.session.set(updates);
    } else {
      // Firefox: use local storage fallback
      for (const [key, value] of Object.entries(updates)) {
        await cache.set(key, value);
      }
    }
  } catch (e) {
    console.warn('[zen-tracking] write failed:', e);
  }
}

async function remove(keys) {
  try {
    if (hasIdleAPI()) {
      return await chrome.storage.session.remove(keys);
    } else {
      // Firefox: use local storage fallback
      for (const key of keys) {
        await cache.remove(key);
      }
    }
  } catch (e) {
    console.warn('[zen-tracking] remove failed:', e);
  }
}

/**
 * Called when chrome.idle transitions to `idle` or `locked` (Chrome only).
 * Flushes any in-progress active duration into the accumulator and stamps
 * the away timestamp so the eventual return can decide whether it was a real break.
 *
 * In Firefox, this is never called (no idle API), so wall-clock time is used.
 */
export async function beginAway(now = Date.now()) {
  const s = await read();
  const set = { zenAwayAt: now };
  if (s.zenActiveStartedAt) {
    const delta = Math.max(0, now - s.zenActiveStartedAt);
    set.zenAccumulatedActiveMs = (s.zenAccumulatedActiveMs || 0) + delta;
  }
  await write(set);
  await remove(['zenActiveStartedAt']);
}

/**
 * Called when chrome.idle transitions back to `active` (Chrome only).
 * If the away period was long enough, treats it as a natural break (full reset);
 * otherwise resumes the previous accumulator. Idempotent: also called
 * from the reminder check to handle the race where a new tab opens
 * before the idle event lands.
 *
 * In Firefox, this is essentially a no-op since there's no idle state.
 */
export async function endAway(now = Date.now()) {
  const s = await read();
  if (s.zenAwayAt == null) {
    if (s.zenActiveStartedAt == null) {
      await write({ zenActiveStartedAt: now });
    }
    return;
  }
  const breakMs = now - s.zenAwayAt;
  if (breakMs >= NATURAL_BREAK_MS) {
    await write({
      zenActiveStartedAt: now,
      zenAccumulatedActiveMs: 0,
    });
    // The user already broke; clear any pending snooze too — they
    // shouldn't come back to a silenced reminder from before the break.
    await remove(['zenAwayAt', 'zenSnoozedUntil']);
  } else {
    await write({ zenActiveStartedAt: now });
    await remove(['zenAwayAt']);
  }
}

/**
 * Total active milliseconds since the last natural break or Zen
 * session — banked accumulator plus the in-progress active period.
 *
 * Side-effects: calls endAway() to handle the new-tab-immediately-
 * after-unlock race. The reminder check is the only caller, so this
 * stays consistent.
 */
export async function getEffectiveActiveMs(now = Date.now()) {
  await endAway(now);
  const s = await read();
  const ongoing = s.zenActiveStartedAt
    ? Math.max(0, now - s.zenActiveStartedAt)
    : 0;
  return (s.zenAccumulatedActiveMs || 0) + ongoing;
}

/** Called by enterZen(): the user is taking a break, restart the cycle. */
export async function resetTracking(now = Date.now()) {
  await write({
    zenAccumulatedActiveMs: 0,
    zenActiveStartedAt: now,
  });
  await remove(['zenAwayAt', 'zenSnoozedUntil']);
}

export async function snoozeReminder(durationMs, now = Date.now()) {
  await write({ zenSnoozedUntil: now + durationMs });
}

export async function isSnoozed(now = Date.now()) {
  const s = await read();
  return !!s.zenSnoozedUntil && now < s.zenSnoozedUntil;
}
