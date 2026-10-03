import { DEFAULTS, KNOWN_KEYS } from './defaults.js';

/**
 * Feature detection for storage API.
 * Both Chrome and Firefox support chrome.storage.
 */
function getStorageAPI() {
  // Firefox supports chrome.storage too
  if (typeof chrome !== 'undefined' && chrome.storage) {
    return chrome.storage;
  }
  // Fallback (should not happen in modern browsers)
  throw new Error('[storage] chrome.storage API not available');
}

// Convert legacy stored keys to their replacements before defaults are
// filled in. Each migration is one-shot: it runs only if the legacy
// key is still present, then deletes it. Adding a new entry here is
// the safe way to evolve the settings shape across releases.
export async function migrateLegacyKeys() {
  try {
    const storage = getStorageAPI();
    // showTime (boolean) → timeDisplay (enum). Existing users who had
    // the clock disabled keep it disabled; everyone else gets 'clock',
    // which matches the behavior they had before.
    const data = await storage.sync.get(['showTime', 'timeDisplay']);
    if (data.showTime !== undefined && data.timeDisplay === undefined) {
      await storage.sync.set({
        timeDisplay: data.showTime ? 'clock' : 'off',
      });
      await storage.sync.remove('showTime');
    }
  } catch (e) {
    console.warn('[storage] migrateLegacyKeys failed:', e);
  }
}

export async function getKnown() {
  const storage = getStorageAPI();
  const data = await storage.sync.get(KNOWN_KEYS);
  const result = {};
  for (const key of KNOWN_KEYS) {
    result[key] = data[key] !== undefined ? data[key] : DEFAULTS[key];
  }
  return result;
}

export async function ensureDefaults() {
  const storage = getStorageAPI();
  const data = await storage.sync.get(KNOWN_KEYS);
  const missing = {};
  for (const key of KNOWN_KEYS) {
    if (data[key] === undefined) missing[key] = DEFAULTS[key];
  }
  if (Object.keys(missing).length > 0) {
    await storage.sync.set(missing);
  }
}

export async function setSetting(key, value) {
  if (!KNOWN_KEYS.includes(key)) return;
  const storage = getStorageAPI();
  await storage.sync.set({ [key]: value });
}

export const cache = {
  async get(key) {
    const storage = getStorageAPI();
    const data = await storage.local.get(key);
    return data[key];
  },
  async set(key, value) {
    const storage = getStorageAPI();
    await storage.local.set({ [key]: value });
  },
  async remove(key) {
    const storage = getStorageAPI();
    await storage.local.remove(key);
  },
};
