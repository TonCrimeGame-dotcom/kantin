(function (root) {
  'use strict';
  const profiles = '.batak-profile-card,.pisti-opponent>button,.pisti-player-me,.okey-player,.okey-me,.player-profile-button,.university-profile-card,.word-rack-profile';
  const timers = '.batak-turn-timer,.pisti-turn-timer,.okey-turn-clock,.turn-clock,.university-profile-timer,.word-profile-timer';

  function updateTimer(timer, remaining, total) {
    if (!timer) return;
    timer.classList.add('player-profile-timer');
    timer.style.setProperty('--profile-progress', Math.max(0, Math.min(1, remaining / total)));
    timer.setAttribute('role', 'timer');
    timer.setAttribute('aria-label', `${remaining} saniye`);
  }

  // Keep each game's original elements and event hooks; share only presentation.
  function install(container, balanceFor, ownName) {
    container.querySelectorAll(profiles).forEach(profile => {
      const image = profile.querySelector('img');
      if (!image) return;
      const avatar = image.parentElement;
      profile.classList.add('game-player-profile');
      avatar.classList.add('game-player-avatar');
      if (!profile.querySelector('.game-player-nameplate')) {
        if (profile.tagName !== 'BUTTON') {
          profile.setAttribute('role', 'button');
          profile.tabIndex = 0;
          profile.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              profile.click();
            }
          });
        }
        const name = (profile.dataset.playerProfile === 'self' && ownName) || profile.dataset.playerName || profile.querySelector('b,strong')?.textContent || 'Oyuncu';
        profile.dataset.playerName = name;
        const details = [...profile.querySelectorAll('small,.university-profile-score')]
          .filter(node => !node.closest(timers)).map(node => node.textContent.trim()).filter(Boolean).join(' · ');
        const plate = document.createElement('span');
        plate.className = 'game-player-nameplate';
        const label = document.createElement('b');
        label.textContent = name;
        const coins = document.createElement('span');
        coins.className = 'game-player-balance';
        const icon = document.createElement('img');
        icon.src = './assets/brand/coin.webp';
        icon.alt = '';
        const value = document.createElement('strong');
        const balance = balanceFor(profile);
        const divisor = balance >= 1e6 ? 1e6 : balance >= 1e3 ? 1e3 : 1;
        value.textContent = balance == null ? '—' : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 1 }).format(balance / divisor) + (divisor === 1e6 ? 'M' : divisor === 1e3 ? 'K' : '');
        coins.setAttribute('aria-label', balance == null ? 'Bakiye bilgisi yok' : `${balance} coin`);
        coins.append(icon, value);
        plate.append(label, coins);
        profile.append(plate);
        if (details) {
          const detail = document.createElement('small');
          detail.className = 'game-player-detail';
          detail.textContent = details;
          profile.append(detail);
        }
        profile.setAttribute('aria-label', [name, details].filter(Boolean).join(' · '));
        profile.title = [name, details].filter(Boolean).join(' · ');
      }
      profile.querySelectorAll(timers).forEach(timer => {
        timer.classList.add('player-profile-timer');
        if (timer.parentElement !== avatar) avatar.append(timer);
      });
    });
    const clock = container.querySelector('.turn-clock');
    if (clock) {
      const owner = clock.classList.contains('clock-mine') ? '.tavla-player-me' : '.tavla-player-opponent';
      container.querySelector(`${owner} .game-player-avatar`)?.append(clock);
    }
  }
  root.KANTIN_PLAYER_PROFILE = { install, updateTimer };
})(typeof window === 'undefined' ? globalThis : window);
