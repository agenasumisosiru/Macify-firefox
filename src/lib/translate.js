// Dual-mode translation support with smart caching:
// - Chrome 138+: uses native on-device Translator API (no network)
// - Firefox & other browsers: uses Google Translate API (gtx) with IndexedDB cache
//
// Firefox caching strategy:
// - On first language selection: preload top ~100 quotes to IndexedDB (rate-limited)
// - Subsequent requests: check cache first, then network
// - User can manually download full set via settings (rate-limited)
// - No server spam: 429 errors avoided via request throttling

const SOURCE = 'en';

// Chrome native: `${SOURCE}→${target}` → Promise<Translator | null>
const chromeCache = new Map();

// IndexedDB for Firefox translation cache
let dbPromise = null;

/**
 * Initialize IndexedDB for translation cache (Firefox only).
 */
function getDB() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('MacifyTranslation', 1);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => resolve(req.result);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('translations')) {
          db.createObjectStore('translations', { keyPath: 'key' });
        }
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata', { keyPath: 'lang' });
        }
      };
    });
  }
  return dbPromise;
}

/**
 * Get cached translation from IndexedDB.
 */
async function getCachedTranslation(text, targetLang) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('translations', 'readonly');
      const store = tx.objectStore('translations');
      const key = `${SOURCE}→${targetLang}:${text}`;
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result?.value || null);
      req.onerror = () => resolve(null);
    });
  } catch (e) {
    console.warn('[cache] getCachedTranslation failed:', e.message);
    return null;
  }
}

/**
 * Save translation to IndexedDB.
 */
async function saveCachedTranslation(text, targetLang, translation) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('translations', 'readwrite');
      const store = tx.objectStore('translations');
      const key = `${SOURCE}→${targetLang}:${text}`;
      store.put({ key, value: translation, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('[cache] saveCachedTranslation failed:', e.message);
    return false;
  }
}

/**
 * Get download metadata (last download time for a language).
 */
async function getDownloadMetadata(targetLang) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('metadata', 'readonly');
      const store = tx.objectStore('metadata');
      const req = store.get(targetLang);
      req.onsuccess = () => resolve(req.result || {});
      req.onerror = () => resolve({});
    });
  } catch (e) {
    console.warn('[cache] getDownloadMetadata failed:', e.message);
    return {};
  }
}

/**
 * Save download metadata.
 */
async function saveDownloadMetadata(targetLang, status, progress = 0) {
  try {
    const db = await getDB();
    return new Promise((resolve) => {
      const tx = db.transaction('metadata', 'readwrite');
      const store = tx.objectStore('metadata');
      store.put({ lang: targetLang, status, progress, timestamp: Date.now() });
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    console.warn('[cache] saveDownloadMetadata failed:', e.message);
    return false;
  }
}

export function appLangToBcp47(appLang) {
  if (appLang === 'zh_CN') return 'zh-Hans';
  if (appLang === 'zh_TW') return 'zh-Hant';
  if (appLang === 'ja') return 'ja';
  if (appLang === 'es') return 'es';
  return 'en';
}

/**
 * Detect if we're in Firefox or Chromium-based browser.
 * Returns 'chrome' | 'firefox' | 'unknown'
 */
function detectBrowser() {
  if (typeof browser !== 'undefined' && browser.runtime && !chrome.runtime.getURL.toString().includes('getURL')) {
    return 'firefox';
  }
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    return 'chrome';
  }
  return 'unknown';
}

/**
 * Check if Chrome's native Translator API is available.
 */
export function isTranslatorApiSupported() {
  return typeof Translator !== 'undefined';
}

/**
 * Check if we should use Google Translate API with caching (Firefox).
 */
function shouldUseGoogleTranslate() {
  return detectBrowser() === 'firefox' || !isTranslatorApiSupported();
}

/**
 * Fetch translation from Google Translate API (gtx) with rate limiting.
 * @param {string} text
 * @param {string} sourceLang
 * @param {string} targetLang
 * @param {number} delayMs - Delay before request (default 100ms for rate limiting)
 * @returns {Promise<string>}
 */
async function googleTranslate(text, sourceLang, targetLang, delayMs = 100) {
  if (!text) return text;
  if (sourceLang === targetLang) return text;

  // Check cache first
  const cached = await getCachedTranslation(text, targetLang);
  if (cached) return cached;

  // Rate limiting: wait before fetching
  await new Promise((r) => setTimeout(r, delayMs));

  try {
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang,
      tl: targetLang,
      dt: 't',
      q: text,
    });

    const url = `https://translate.googleapis.com/translate_a/single?${params}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    if (response.status === 429) {
      console.warn('[translate] Rate limited (429). Returning original text.');
      return text;
    }

    if (!response.ok) {
      console.warn(`[translate] Google API returned ${response.status}`);
      return text;
    }

    const data = await response.json();
    const translated = data?.[0]?.[0]?.[0];
    if (!translated) {
      console.warn('[translate] Unexpected response structure');
      return text;
    }

    // Cache the result
    await saveCachedTranslation(text, targetLang, translated);
    return translated;
  } catch (e) {
    console.warn('[translate] Google Translate API failed:', e.message);
    return text;
  }
}

/**
 * Returns availability status.
 */
export async function getAvailability(targetLang) {
  if (targetLang === SOURCE) return 'na-english';

  if (isTranslatorApiSupported()) {
    // Chrome path
    try {
      return await Translator.availability({
        sourceLanguage: SOURCE,
        targetLanguage: targetLang,
      });
    } catch (e) {
      console.warn('Translator.availability failed:', e);
      return 'unavailable';
    }
  } else if (shouldUseGoogleTranslate()) {
    // Firefox path: check if we have cached quotes
    try {
      const metadata = await getDownloadMetadata(targetLang);
      if (metadata.status === 'complete') {
        return 'google-cached';
      } else if (metadata.status === 'downloading') {
        return 'downloading';
      } else {
        return 'google-available';
      }
    } catch (e) {
      return 'google-available';
    }
  }

  return 'no-api';
}

/**
 * Chrome path: prepare native translator.
 */
export function prepareTranslator(targetLang, onProgress) {
  if (!isTranslatorApiSupported()) return null;
  if (targetLang === SOURCE) return null;

  const key = `${SOURCE}→${targetLang}`;
  if (chromeCache.has(key)) return chromeCache.get(key);

  const opts = {
    sourceLanguage: SOURCE,
    targetLanguage: targetLang,
  };
  if (onProgress) {
    opts.monitor = (m) => {
      m.addEventListener('downloadprogress', (e) => {
        onProgress(Math.round((e.loaded ?? 0) * 100));
      });
    };
  }

  const promise = Translator.create(opts).catch((e) => {
    console.warn('Translator init failed:', e);
    chromeCache.delete(key);
    return null;
  });
  chromeCache.set(key, promise);
  return promise;
}

/**
 * Firefox path: preload quote translations to IndexedDB.
 * Loads top ~100 quotes with rate limiting (100ms between requests).
 * @param {string} targetLang - Target language in BCP47 format
 * @param {Function} onProgress - Callback: (current, total) => void
 * @returns {Promise<void>}
 */
export async function prepareGoogleTranslationCache(targetLang, onProgress = () => {}) {
  if (isTranslatorApiSupported()) return; // Chrome: no need
  if (targetLang === SOURCE) return;

  const langMap = {
    'zh-Hans': 'zh-CN',
    'zh-Hant': 'zh-TW',
    ja: 'ja',
    es: 'es',
  };
  const googleLang = langMap[targetLang] || targetLang;

  try {
    await saveDownloadMetadata(targetLang, 'downloading', 0);

    // Dynamically import quotes (assuming they exist in src/data/quotes.json)
    // For now, use a hardcoded sample. In production, import { quotes } from '../data/quotes.json'
    let quotes = [];
    try {
      // Attempt to fetch quotes dynamically
      const quotesModule = await import('../data/quotes.json', { assert: { type: 'json' } });
      quotes = quotesModule.default || [];
    } catch (e) {
      console.warn('[cache] Could not load quotes.json:', e.message);
      quotes = []; // Fallback: empty
    }

    // Only translate top 100 to avoid 429 errors
    const topQuotes = quotes.slice(0, 100);
    const total = topQuotes.length;

    for (let i = 0; i < topQuotes.length; i++) {
      const quote = topQuotes[i];
      const text = typeof quote === 'string' ? quote : quote.content || '';
      if (!text) continue;

      // Rate limiting: 100ms between requests
      const delay = i === 0 ? 0 : 100;
      await googleTranslate(text, SOURCE, googleLang, delay);

      const progress = Math.round(((i + 1) / total) * 100);
      onProgress(progress, total);
      await saveDownloadMetadata(targetLang, 'downloading', progress);
    }

    await saveDownloadMetadata(targetLang, 'complete', 100);
    console.log(`[cache] Downloaded ${topQuotes.length} quote translations for ${targetLang}`);
  } catch (e) {
    console.error('[cache] prepareGoogleTranslationCache failed:', e);
    await saveDownloadMetadata(targetLang, 'error', 0);
  }
}

/**
 * Main translation function. Routes to Chrome or Google Translate based on availability.
 */
export async function translate(text, targetLang) {
  if (!text) return text;
  if (targetLang === SOURCE) return text;

  // Firefox or Chrome without native Translator API: use Google Translate + cache
  if (shouldUseGoogleTranslate()) {
    const langMap = {
      'zh-Hans': 'zh-CN',
      'zh-Hant': 'zh-TW',
      ja: 'ja',
      es: 'es',
    };
    const googleLang = langMap[targetLang] || targetLang;
    return googleTranslate(text, SOURCE, googleLang, 50); // 50ms delay for on-demand requests
  }

  // Chrome with native Translator API
  if (isTranslatorApiSupported()) {
    const key = `${SOURCE}→${targetLang}`;
    const instance = await (chromeCache.get(key) ?? prepareTranslator(targetLang));
    if (!instance) return text;

    try {
      return await instance.translate(text);
    } catch (e) {
      console.warn('Chrome translation failed:', e);
      return text;
    }
  }

  // Fallback
  return text;
}
