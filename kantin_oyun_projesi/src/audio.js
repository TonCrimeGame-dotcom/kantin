(() => {
  'use strict';

  const STORAGE_KEY = 'kantin:sound-enabled:v1';
  const BASE = './assets/audio/';
  const library = Object.freeze({
    cardDraw: ['card_draw_1.wav', 'card_draw_2.wav', 'card_draw_3.wav'],
    cardFan: ['card_fan.wav', 'card_fan_2.wav'],
    chipDrop: ['chips_drop.wav'],
    chipGather: ['chips_gather.wav', 'chips_gather_2.wav', 'chips_gather_3.wav'],
    bagShake: ['chips_in_sack_shake.wav', 'chips_in_sack_short.wav'],
    chipPlace: ['chips_place_1.wav', 'chips_place_2.wav', 'chips_place_3.wav'],
    chipStack: ['chips_stack.wav', 'chips_stack_2.wav'],
    diceGrab: ['dice_grab.wav'],
    diceRoll: ['dice_roll_1.wav', 'dice_roll_2.wav', 'dice_roll_3.wav', 'dice_roll_4.wav'],
    diceShake: ['dice_shake_2.wav', 'dice_shake_3.wav', 'dice_shake_4.wav']
  });
  const defaultVolume = Object.freeze({
    cardDraw: .52,
    cardFan: .62,
    chipDrop: .52,
    chipGather: .58,
    bagShake: .48,
    chipPlace: .46,
    chipStack: .52,
    diceGrab: .46,
    diceRoll: .62,
    diceShake: .52
  });
  const channels = new Map();
  const lastIndex = new Map();
  const lastPlayedAt = new Map();
  let enabled = true;

  try { enabled = localStorage.getItem(STORAGE_KEY) !== 'false'; } catch {}

  function choose(name) {
    const choices = library[name];
    if (!choices?.length) return null;
    if (choices.length === 1) return choices[0];
    const previous = lastIndex.get(name) ?? -1;
    let index = Math.floor(Math.random() * choices.length);
    if (index === previous) index = (index + 1) % choices.length;
    lastIndex.set(name, index);
    return choices[index];
  }

  function channelFor(file) {
    const pool = channels.get(file) || [];
    let audio = pool.find(item => item.paused || item.ended);
    if (!audio) {
      audio = new Audio(`${BASE}${file}`);
      audio.preload = 'auto';
      audio.playsInline = true;
      pool.push(audio);
      channels.set(file, pool);
    }
    return audio;
  }

  function play(name, options = {}) {
    if (!enabled) return Promise.resolve(false);
    const now = performance.now();
    const cooldown = Number.isFinite(options.cooldown) ? options.cooldown : 55;
    if (now - (lastPlayedAt.get(name) || 0) < cooldown) return Promise.resolve(false);
    const file = choose(name);
    if (!file) return Promise.resolve(false);
    lastPlayedAt.set(name, now);
    const audio = channelFor(file);
    audio.currentTime = 0;
    audio.volume = Math.max(0, Math.min(1, (defaultVolume[name] ?? .5) * (options.volume ?? 1)));
    audio.playbackRate = Math.max(.72, Math.min(1.3, options.rate ?? 1));
    return audio.play().then(() => true).catch(() => false);
  }

  function setEnabled(value) {
    enabled = Boolean(value);
    try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch {}
    if (!enabled) channels.forEach(pool => pool.forEach(audio => { audio.pause(); audio.currentTime = 0; }));
    window.dispatchEvent(new CustomEvent('kantin:sound-change', { detail: { enabled } }));
    return enabled;
  }

  window.KANTIN_AUDIO = Object.freeze({
    play,
    toggle: () => setEnabled(!enabled),
    setEnabled,
    isEnabled: () => enabled,
    sounds: Object.freeze(Object.keys(library))
  });
})();
