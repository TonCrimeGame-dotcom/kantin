(() => {
  'use strict';

  const manifest = window.KANTIN_ASSET_MANIFEST || { version: 'dev', assets: [] };
  const overlay = document.querySelector('#assetLoader');
  const bar = document.querySelector('#assetLoaderBar');
  const percent = document.querySelector('#assetLoaderPercent');
  const status = document.querySelector('#assetLoaderStatus');
  const detail = document.querySelector('#assetLoaderDetail');
  const loaded = new Set();
  const versionKey = 'kantin:asset-version';
  let previousVersion = '';
  try { previousVersion = localStorage.getItem(versionKey) || ''; } catch {}
  const requestCache = previousVersion === manifest.version ? 'force-cache' : 'reload';
  const locale = (navigator.language || 'tr').slice(0, 2).toLowerCase();
  const copy = {
    tr: ['Oyun hazırlanıyor', 'Görseller indiriliyor', 'Hazır'],
    en: ['Preparing the game', 'Downloading visuals', 'Ready'],
    de: ['Spiel wird vorbereitet', 'Grafiken werden geladen', 'Bereit'],
    es: ['Preparando el juego', 'Descargando imágenes', 'Listo'],
    ru: ['Подготовка игры', 'Загрузка изображений', 'Готово'],
    ar: ['جارٍ تجهيز اللعبة', 'جارٍ تنزيل الصور', 'جاهز'],
    hi: ['गेम तैयार हो रहा है', 'चित्र डाउनलोड हो रहे हैं', 'तैयार']
  }[locale] || ['Preparing the game', 'Downloading visuals', 'Ready'];

  const formatBytes = bytes => {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  function renderProgress(downloaded, total, completed, count) {
    const value = total ? Math.min(100, Math.round(downloaded / total * 100)) : Math.round(completed / Math.max(1, count) * 100);
    if (bar) bar.style.width = `${value}%`;
    if (percent) percent.textContent = `${value}%`;
    overlay?.setAttribute('aria-valuenow', String(value));
    if (status) status.textContent = copy[1];
    if (detail) detail.textContent = `${formatBytes(downloaded)} / ${formatBytes(total)} · ${completed}/${count}`;
  }

  async function downloadAsset(asset, onChunk) {
    const response = await fetch(asset.url, { cache: requestCache, credentials: 'same-origin' });
    if (!response.ok) throw new Error(`${asset.url}: ${response.status}`);
    if (!response.body) {
      await response.blob();
      onChunk(asset.bytes);
      return;
    }
    const reader = response.body.getReader();
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      onChunk(value.byteLength);
    }
    if (received < asset.bytes) onChunk(asset.bytes - received);
  }

  async function preloadAll() {
    const assets = manifest.assets.filter(asset => !loaded.has(asset.url));
    const total = assets.reduce((sum, asset) => sum + asset.bytes, 0);
    let downloaded = 0;
    let completed = 0;
    let cursor = 0;
    renderProgress(0, total, 0, assets.length);

    async function worker() {
      while (cursor < assets.length) {
        const asset = assets[cursor++];
        try {
          await downloadAsset(asset, bytes => {
            downloaded += bytes;
            renderProgress(downloaded, total, completed, assets.length);
          });
          loaded.add(asset.url);
        } catch (error) {
          console.warn('Kantin asset preload skipped:', error);
          downloaded += asset.bytes;
        }
        completed += 1;
        renderProgress(downloaded, total, completed, assets.length);
      }
    }

    await Promise.all(Array.from({ length: Math.min(6, assets.length || 1) }, worker));
  }

  const startedAt = performance.now();
  document.documentElement.classList.add('asset-loading');
  document.body.setAttribute('aria-busy', 'true');
  if (status) status.textContent = copy[0];

  const ready = preloadAll().finally(async () => {
    const remaining = Math.max(0, 900 - (performance.now() - startedAt));
    if (remaining) await new Promise(resolve => setTimeout(resolve, remaining));
    if (status) status.textContent = copy[2];
    if (bar) bar.style.width = '100%';
    if (percent) percent.textContent = '100%';
    overlay?.classList.add('is-complete');
    await new Promise(resolve => setTimeout(resolve, 360));
    document.documentElement.classList.remove('asset-loading');
    document.body.removeAttribute('aria-busy');
    overlay?.setAttribute('hidden', '');
    try { localStorage.setItem(versionKey, manifest.version); } catch {}
    window.dispatchEvent(new CustomEvent('kantin:assets-ready', { detail: { version: manifest.version } }));
  });

  window.KANTIN_ASSETS = Object.freeze({ ready, version: manifest.version });
})();
