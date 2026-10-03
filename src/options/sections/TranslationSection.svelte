<script>
  import { settings, updateSetting } from '../../lib/settings.svelte.js';
  import { t, resolveLanguage } from '../../lib/i18n.svelte.js';
  import {
    prepareTranslator,
    prepareGoogleTranslationCache,
    appLangToBcp47,
    getAvailability,
    isTranslatorApiSupported,
  } from '../../lib/translate.js';
  import SettingsCard from './SettingsCard.svelte';

  const targetLang = $derived(
    appLangToBcp47(resolveLanguage(settings.userLanguage)),
  );

  let translationStatus = $state('checking');
  let downloadProgress = $state(0);
  const isFirefox = !isTranslatorApiSupported(); // Simplified detection

  $effect(() => {
    translationStatus = 'checking';
    downloadProgress = 0;
    getAvailability(targetLang).then((s) => {
      translationStatus = s;
    });
  });

  function onDownloadModel() {
    translationStatus = 'downloading';
    downloadProgress = 0;
    const lang = targetLang;

    if (isTranslatorApiSupported()) {
      // Chrome: use native API
      const promise = prepareTranslator(lang, (pct) => {
        downloadProgress = pct;
      });
      if (!promise) {
        translationStatus = 'unavailable';
        return;
      }
      promise.then((instance) => {
        if (!instance) {
          translationStatus = 'unavailable';
          return;
        }
        getAvailability(lang).then((s) => (translationStatus = s));
      });
    } else {
      // Firefox: use Google Translate with IndexedDB cache
      prepareGoogleTranslationCache(lang, (current, total) => {
        downloadProgress = Math.round((current / total) * 100);
      }).then(() => {
        getAvailability(lang).then((s) => (translationStatus = s));
      }).catch(() => {
        translationStatus = 'unavailable';
      });
    }
  }

  function onTranslateMottoToggle(event) {
    const enabled = event.currentTarget.checked;
    if (enabled && targetLang !== 'en') {
      // For Firefox: start background download on enable
      if (isFirefox && translationStatus === 'google-available') {
        // Background download (don't await, just start)
        prepareGoogleTranslationCache(targetLang).catch(() => {});
      } else if (isTranslatorApiSupported() && (translationStatus === 'downloadable' || translationStatus === 'unavailable')) {
        // Chrome: explicit download
        onDownloadModel();
      } else if (isTranslatorApiSupported()) {
        prepareTranslator(targetLang);
      }
    }
    updateSetting('translateMotto', enabled);
  }
</script>

<SettingsCard
  emoji="🌐"
  title={t('options_translation_section')}
  description={t('options_translation_description')}
>
  <label class="mb-4 flex items-center justify-between gap-4">
    <span class="text-sm text-slate-700">
      {t('options_translate_motto')}
    </span>
    <input
      type="checkbox"
      class="h-4 w-4 cursor-pointer accent-blue-600"
      checked={settings.translateMotto}
      onchange={onTranslateMottoToggle}
    />
  </label>

  <div class="rounded-md bg-slate-50 p-3 text-xs ring-1 ring-slate-200">
    <div class="flex items-center justify-between gap-2">
      <span class="text-slate-500">
        {t('options_translation_model_label')}
      </span>
      <span class="font-mono text-slate-700">
        en → {targetLang}
        {#if isFirefox}
          <span class="text-slate-400">(Google Translate)</span>
        {/if}
      </span>
    </div>
    <div class="mt-1.5 flex items-center justify-between gap-2">
      <span class="text-slate-500">
        {t('options_translation_status_label')}
      </span>
      <span
        class="font-medium"
        class:text-emerald-600={translationStatus === 'available' || translationStatus === 'google-cached'}
        class:text-amber-600={translationStatus === 'downloadable' || translationStatus === 'google-available'}
        class:text-blue-600={translationStatus === 'downloading' || translationStatus === 'checking'}
        class:text-red-600={translationStatus === 'unavailable' || translationStatus === 'no-api'}
      >
        {#if translationStatus === 'available'}
          ✓ {t('options_translation_status_available')}
        {:else if translationStatus === 'google-cached'}
          ✓ {t('options_translation_status_available')} (cached)
        {:else if translationStatus === 'downloadable' || translationStatus === 'google-available'}
          ⬇ {t('options_translation_status_downloadable')}
        {:else if translationStatus === 'downloading'}
          ⏳ {t('options_translation_status_downloading')}
          {downloadProgress}%
        {:else if translationStatus === 'unavailable'}
          ⚠ {t('options_translation_status_unavailable')}
        {:else if translationStatus === 'no-api'}
          ⚠ {t('options_translation_status_no_api')}
        {:else}
          🔍 {t('options_translation_status_checking')}
        {/if}
      </span>
    </div>

    {#if translationStatus === 'downloadable' || translationStatus === 'google-available'}
      <button
        type="button"
        onclick={onDownloadModel}
        disabled={translationStatus === 'downloading'}
        class="mt-3 w-full cursor-pointer rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm transition hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/40 focus:outline-none disabled:bg-slate-400 disabled:cursor-not-allowed"
      >
        {t('options_translation_download_button')}
      </button>
    {/if}
  </div>
</SettingsCard>
