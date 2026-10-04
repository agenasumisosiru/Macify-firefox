# Macify — Firefox Edition

This is a Firefox-compatible fork of [Macify](https://github.com/jason5ng32/Macify), bringing macOS aerial screensaver videos to Firefox's new tab page with full feature parity (minus browser-specific APIs).

## Quick Start

### Load for Testing

```bash
git clone https://github.com/agenasumisosiru/Macify.git
cd Macify
git checkout main
cp .env.example .env
# Edit .env — set VITE_MACIFY_BASE (required)
pnpm install
pnpm run build
```

Then in Firefox:
1. Open `about:debugging#/runtime/this-firefox`
2. Click "Load Temporary Add-on"
3. Select any file in `dist/`

## Differences from Chrome Version

### Translation
- **Chrome**: Uses Chrome's native on-device Translator API (138+)
  - No network requests (model cached locally)
  - Fast, instant translation
- **Firefox**: Uses Google Translate API (free, no auth)
  - Remote API call (~100ms)
  - Preloads top 100 quotes on first language selection (rate-limited to avoid 429)
  - Caches results in IndexedDB

### Permissions

| Permission | Chrome | Firefox | Fallback |
|---|---|---|---|
| `storage` | ✅ sync/local | ✅ sync/local | Same |
| `topSites` | ✅ List top sites | ❌ Not available | Empty list |
| `favicon` | ✅ Chrome's cache | ⚠️ Manual URLs | Standard web API |
| `idle` | ✅ Idle detection | ❌ Not available | Wall-clock time |

### Feature Availability

| Feature | Chrome | Firefox | Notes |
|---|---|---|---|
| Aerial videos | ✅ | ✅ | Identical |
| Weather | ✅ | ✅ | Identical |
| Top Sites widget | ✅ | ❌ | Shows empty gracefully |
| Quote translation | ✅ | ✅ | Different backend (gtx) |
| Zen mode | ✅ | ✅ | Firefox counts wall-clock, no idle |
| Donate pill | ✅ | ✅ | Identical |
| Proxy advisory | ✅ | ✅ | Identical |

## APIs

All Chrome APIs are guarded with feature detection:

```javascript
// Example: chrome.topSites (Chrome-only)
if (!chrome?.topSites?.get) return []; // Firefox: returns empty

// Example: chrome.idle (Chrome-only)
function hasIdleAPI() {
  return typeof chrome !== 'undefined' && chrome?.idle?.setDetectionInterval;
}
// Firefox: idle detection skipped, uses wall-clock time

// Example: chrome.runtime.getManifest()
try {
  version = chrome.runtime.getManifest().version;
} catch (e) {
  version = "2.2.0"; // Fallback
}
```

## Translation Workflow (Firefox)

### First time user enables translation:
1. User selects language (e.g., Japanese)
2. Background job starts: `prepareGoogleTranslationCache()`
3. Top 100 quotes are fetched from Google Translate API
   - Rate limited: 100ms between requests
   - Cached in IndexedDB
   - Progress shown in settings
4. User sees status: "✓ Ready (cached)"

### Runtime (new quote appears):
1. `translate(quote, 'ja')` is called
2. Check IndexedDB first → if hit, return instantly
3. If miss → fetch from Google API (50ms delay for rate limiting)
4. Save result to IndexedDB
5. Return translated text

### Offline:
- Cached quotes: available
- New quotes: fallback to original English

## Troubleshooting

### Translation not working
- Check internet connection (Google Translate is remote)
- Check browser console (F12 → Console) for errors
- Try re-downloading the model in settings
- Fallback: quotes will show in English

### Top Sites widget shows empty
- Expected: Firefox doesn't have the topSites API
- Workaround: manually add bookmarks to your home screen

### Zen break reminder fires too often
- Expected: Firefox counts wall-clock time, not idle time
- Chrome: pauses when system is locked/idle
- Firefox: always counts, so reminder seems more frequent
- Workaround: increase the interval in settings

### Favicon loading slowly
- Firefox: uses direct URL fetches instead of Chrome's cache
- Expected: slightly slower than Chrome version
- Workaround: disable Top Sites widget if it impacts performance

## Publishing to Firefox Add-ons

### Prerequisites
- Create account on [AMO Dev Hub](https://addons.mozilla.org/developers/)
- Generate API credentials

### Steps

1. **Build the extension:**
   ```bash
   pnpm run build
   ```

2. **Sign the extension (if submitting):**
   ```bash
   web-ext sign --api-key=YOUR_KEY --api-secret=YOUR_SECRET --source-dir=dist/
   ```

3. **Submit to AMO:**
   - Go to AMO Dev Hub → "Submit a New Add-on"
   - Upload the signed `.xpi` file
   - Fill in metadata (screenshots, description, etc.)
   - Submit for review (typically 3–5 days)

4. **Alternative (self-hosted unsigned):**
   - Users can manually load `dist/` via `about:debugging`
   - No review needed, but less discoverable

## Development

### Hot reload
```bash
pnpm run dev
# Then load from dist/ in about:debugging
```

### Build for production
```bash
VITE_MACIFY_BASE=https://your-domain.com pnpm run build
```

### Translation cache testing
Edit `VITE_DONATE_INTERVAL_MS` in `.env` for faster testing:
```bash
VITE_DONATE_INTERVAL_MS=10000 pnpm run dev  # 10 seconds (default 7 days)
```

## Contributing

Pull requests welcome! Firefox-specific issues:

1. Always include Firefox version (press F1 in browser)
2. Check console for errors (F12 → Console)
3. Test with both Temporary and signed installations
4. If API unavailable, ensure graceful fallback (don't crash)

## License

MIT. See [LICENSE](LICENSE).

## Credits

- **Original**: Jason Ng, Dofy, Setilis
- **Firefox port**: agenasumisosiru
- **Aerial videos**: © Apple Inc.
