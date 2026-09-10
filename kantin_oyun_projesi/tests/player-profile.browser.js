// Run with agent-browser eval --stdin on a loaded local game page.
(() => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const { install, updateTimer } = window.KANTIN_PLAYER_PROFILE;
  const fixtures = [
    ['batak-profile-card', 'batak-turn-timer', '<em>15</em>'],
    ['pisti-player-me', 'pisti-turn-timer', '<em>15</em>'],
    ['okey-player', 'okey-turn-clock', '<b>20</b><small>sn</small>'],
    ['player-profile-button', 'turn-clock', '<strong>20</strong>'],
    ['university-profile-card active', 'university-profile-timer', '20'],
    ['word-rack-profile', 'word-profile-timer', '<em>20</em>']
  ];
  const container = document.createElement('section');
  for (const [profileClass, timerClass, number] of fixtures) {
    const profile = document.createElement('button');
    profile.className = profileClass;
    profile.dataset.playerProfile = 'self';
    profile.innerHTML = `<span><img src="./assets/avatars/panter.webp" alt=""></span><b>Old name</b><small>Game detail</small><i class="${timerClass}">${number}</i>`;
    container.append(profile);
  }
  const originalTimers = [...container.querySelectorAll('i')];
  install(container, () => 31300, 'Name <test>');
  install(container, () => 31300, 'Name <test>');
  assert(container.querySelectorAll('.game-player-nameplate').length === fixtures.length, 'Repeated installation must not duplicate profiles');
  [...container.children].forEach((profile, index) => {
    assert(profile.querySelector('.game-player-nameplate b').textContent === 'Name <test>', 'Names use text, not HTML');
    assert(profile.querySelector('.game-player-balance strong').textContent === '31,3K', 'Balance follows approved compact format');
    assert(profile.querySelector('.game-player-detail').textContent === 'Game detail', 'Game details are preserved');
    assert(profile.querySelector('.game-player-avatar .player-profile-timer') === originalTimers[index], 'Original timer hooks must survive');
    updateTimer(originalTimers[index], 5, 20);
    assert(originalTimers[index].style.getPropertyValue('--profile-progress') === '0.25', 'Timer progress follows game duration');
    updateTimer(originalTimers[index], -1, 20);
    assert(originalTimers[index].style.getPropertyValue('--profile-progress') === '0', 'Expired timer clamps at zero');
  });
  const unknown = document.createElement('div');
  unknown.innerHTML = '<button class="okey-player"><span><img src="./assets/avatars/kedi.webp"></span><b>Opponent</b></button>';
  install(unknown, () => null);
  assert(unknown.querySelector('.game-player-balance strong').textContent === '—', 'Unknown balances are not invented');
  return 'PASS: six game families, original timer hooks, compact balance, safe names, idempotent installation and progress';
})();
