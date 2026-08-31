(() => {
  'use strict';

  const STORAGE_KEY = 'kantin:locale:v1';
  const locales = window.KANTIN_LOCALES || {};
  const supported = Object.freeze({
    tr: { name: 'Türkçe', direction: 'ltr', intl: 'tr-TR' },
    en: { name: 'English', direction: 'ltr', intl: 'en-US' },
    de: { name: 'Deutsch', direction: 'ltr', intl: 'de-DE' },
    ru: { name: 'Русский', direction: 'ltr', intl: 'ru-RU' },
    es: { name: 'Español', direction: 'ltr', intl: 'es-ES' },
    hi: { name: 'हिन्दी', direction: 'ltr', intl: 'hi-IN' },
    ar: { name: 'العربية', direction: 'rtl', intl: 'ar' }
  });
  const events = new EventTarget();

  function normalize(value) {
    const code = String(value || '').trim().replace('_', '-').toLowerCase().split('-')[0];
    return Object.prototype.hasOwnProperty.call(supported, code) && locales[code] ? code : null;
  }

  function storedLocale() {
    try { return normalize(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
  }

  function telegramLocale() {
    return normalize(window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code);
  }

  function queryLocale() {
    try { return normalize(new URLSearchParams(location.search).get('lang')); } catch { return null; }
  }

  function browserLocale() {
    const candidates = Array.isArray(navigator.languages) && navigator.languages.length
      ? navigator.languages
      : [navigator.language];
    return candidates.map(normalize).find(Boolean) || null;
  }

  let locale = queryLocale() || storedLocale() || telegramLocale() || browserLocale() || 'en';

  function interpolate(value, variables = {}) {
    return String(value).replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => (
      Object.prototype.hasOwnProperty.call(variables, key) ? String(variables[key]) : match
    ));
  }

  function t(key, variables) {
    const value = locales[locale]?.[key] ?? locales.en?.[key] ?? key;
    return interpolate(value, variables);
  }

  function number(value, options) {
    return new Intl.NumberFormat(supported[locale]?.intl || 'en-US', options).format(Number(value) || 0);
  }

  function date(value, options = { dateStyle: 'short' }) {
    return new Intl.DateTimeFormat(supported[locale]?.intl || 'en-US', options).format(new Date(value));
  }

  function populateSelector(select) {
    if (!select || select.dataset.languageReady === 'true') return;
    select.innerHTML = Object.entries(supported)
      .map(([code, meta]) => `<option value="${code}">${meta.name}</option>`)
      .join('');
    select.dataset.languageReady = 'true';
  }

  function syncSelectors(root = document) {
    root.querySelectorAll?.('[data-language-selector]').forEach(select => {
      populateSelector(select);
      select.value = locale;
      select.setAttribute('aria-label', t('language.label'));
      select.title = t('language.label');
    });
  }

  function translateDocument(root = document) {
    if (root === document || root === document.documentElement) document.title = t('app.title');
    root.querySelectorAll?.('[data-i18n]').forEach(node => {
      node.textContent = t(node.dataset.i18n);
    });
    root.querySelectorAll?.('[data-i18n-placeholder]').forEach(node => {
      node.placeholder = t(node.dataset.i18nPlaceholder);
    });
    root.querySelectorAll?.('[data-i18n-title]').forEach(node => {
      node.title = t(node.dataset.i18nTitle);
    });
    root.querySelectorAll?.('[data-i18n-aria-label]').forEach(node => {
      node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel));
    });
    syncSelectors(root);
  }

  function applyDocumentLocale() {
    const meta = supported[locale] || supported.en;
    document.documentElement.lang = locale;
    document.documentElement.dir = meta.direction;
    document.documentElement.dataset.locale = locale;
    translateDocument(document);
  }

  function setLocale(nextLocale, options = {}) {
    const normalized = normalize(nextLocale) || 'en';
    const changed = normalized !== locale;
    locale = normalized;
    if (options.persist !== false) {
      try { localStorage.setItem(STORAGE_KEY, locale); } catch {}
    }
    applyDocumentLocale();
    if (changed && options.emit !== false) {
      events.dispatchEvent(new CustomEvent('change', { detail: { locale, direction: supported[locale].direction } }));
    }
    return locale;
  }

  document.addEventListener('change', event => {
    const select = event.target.closest?.('[data-language-selector]');
    if (select) setLocale(select.value);
  });

  const api = {
    get locale() { return locale; },
    get direction() { return supported[locale]?.direction || 'ltr'; },
    get supported() { return Object.fromEntries(Object.entries(supported).map(([key, value]) => [key, { ...value }])); },
    normalize,
    t,
    number,
    date,
    setLocale,
    translateDocument,
    syncSelectors,
    addEventListener(...args) { return events.addEventListener(...args); },
    removeEventListener(...args) { return events.removeEventListener(...args); }
  };

  window.KANTIN_I18N = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyDocumentLocale, { once: true });
  else applyDocumentLocale();
})();
