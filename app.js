(function () {
  'use strict';
  const $ = id => document.getElementById(id), G = MineGame, config = window.GAME_CONFIG;
  const STORE = 'omt-session-v1';
  const preview = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !config.endpoint;
  const names = ['Медная лощина', 'Тихий грот', 'Янтарный разлом', 'Северная жила', 'Зелёный склон', 'Лунная пещера'];
  let state = null, playingNow = false, lastTick = performance.now(), lastAction = -Infinity, cooldownTimer, syncStatus = 'pending';
  try { const stored = JSON.parse(localStorage.getItem(STORE)); if (stored && stored.version === G.VERSION && Array.isArray(stored.events)) state = stored; } catch { /* First session. */ }
  const delivery = new MineDelivery(config, () => state, status => { syncStatus = status; renderSync(); });
  function persist() {
    if (!state) return;
    try { localStorage.setItem(STORE, JSON.stringify(state)); }
    catch { $('live').textContent = 'Автосохранение недоступно. Не закрывай вкладку до завершения отправки.'; }
  }
  function time(ms) { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function setText(id, text) { $(id).textContent = text; }
  function show(screen) { ['intro', 'game', 'result'].forEach(id => { $(id).hidden = id !== screen; }); }
  function renderSync() {
    if (!state || state.status !== 'finished') return;
    const message = preview ? 'Режим предпросмотра. Результаты никуда не отправляются.' :
      syncStatus === 'saved' ? 'Результат сохранён. Спасибо!' :
      syncStatus === 'sending' ? 'Сохраняем результат…' :
      'Результат сохранён на устройстве. Отправим его, когда восстановится связь. Пока оставь страницу открытой или вернись к ней позже.';
    setText('sync-status', message); $('retry').hidden = preview || syncStatus !== 'pending';
    document.querySelector('.result-footnote').textContent = preview || syncStatus === 'saved'
      ? 'Можно закрыть страницу. Спасибо за участие в исследовании.'
      : 'Для завершения отправки оставь страницу открытой.';
  }
  function render() {
    if (!state) return;
    if (state.status === 'finished') {
      playingNow = false; show('result'); setText('result-coins', state.wallet);
      setText('result-copy', state.finishReason === 'time_limit' ? 'Время этой экспедиции подошло к концу.' : 'Твой маршрут на сегодня завершён.');
      $('reason-field').hidden = state.finishReason === 'time_limit';
      document.querySelectorAll('[data-reason]').forEach(b => b.setAttribute('aria-pressed', String(state.reason === b.dataset.reason)));
      renderSync(); return;
    }
    show('game');
    const m = G.current(state), phase = Math.min(3, Math.floor(m.hits / 12)), cost = G.COSTS[m.level];
    setText('mine-name', m.name); setText('mine-number', 'УЧАСТОК ' + String(m.index).padStart(2, '0'));
    setText('wallet', state.wallet); setText('timer', time(state.activeMs)); setText('yield', G.income(m));
    setText('condition', ['Богатая жила', 'Руды становится меньше', 'Редкая руда', 'Бедная жила'][phase]);
    setText('equipment-badge', ['Ручная добыча', 'Стальная кирка', 'Усиленный инструмент', 'Буровая установка'][m.level]);
    $('scene').dataset.stage = phase;
    $('vein-fill').style.width = Math.max(5, 100 - m.hits * 2.1) + '%';
    setText('vein-note', ['Здесь ещё много руды.', 'Плотность руды постепенно снижается.', 'Руда встречается всё реже.', 'Руды мало, но добычу можно продолжать.'][phase]);
    setText('upgrade-title', ['Стальная кирка', 'Усиленный инструмент', 'Буровая установка', 'Всё оборудовано'][m.level]);
    setText('upgrade-level', m.level < 3 ? 'Улучшение ' + (m.level + 1) + ' из 3' : 'Установлены все 3 улучшения');
    setText('upgrade-description', m.level < 3 ? 'Ещё +1 монета за каждый удар в этой шахте.' : 'Оборудование приносит +3 монеты за удар. Запас руды всё равно уменьшается.');
    setText('upgrade-cost', cost === undefined ? '✓' : cost + ' ◈');
    $('upgrade').disabled = cost === undefined || state.wallet < cost;
    $('upgrade').querySelector('span').textContent = cost === undefined ? 'Установлено' : 'Улучшить';
    setText('next-name', names[m.index % names.length]);
    const available = G.nextAvailable(state);
    setText('next-copy', available ? 'Новый участок разведан. Можно перейти в любой момент.' : 'Разведка откроет следующий участок после 12 ударов.');
    $('move').disabled = !available;
    $('dig').disabled = performance.now() - lastAction < config.actionCooldownMs;
  }
  function advanceClock() {
    const now = performance.now(), delta = now - lastTick; lastTick = now;
    if (!playingNow || !state || state.status !== 'playing' || document.hidden) return;
    if (G.tick(state, delta, Date.now(), config.sessionLimitSeconds * 1000)) { persist(); render(); delivery.flush(); }
    else setText('timer', time(state.activeMs));
  }
  function dig() {
    if (!state || state.status !== 'playing' || performance.now() - lastAction < config.actionCooldownMs) return;
    advanceClock(); if (state.status !== 'playing') return;
    lastAction = performance.now();
    const value = G.dig(state, Date.now());
    persist(); render();
    $('scene').classList.remove('hit'); void $('scene').offsetWidth; $('scene').classList.add('hit');
    const floater = document.createElement('span'); floater.className = 'coin-float'; floater.textContent = '+' + value; $('floats').append(floater);
    setTimeout(() => floater.remove(), 900);
    clearTimeout(cooldownTimer); cooldownTimer = setTimeout(render, config.actionCooldownMs + 5);
    setText('live', 'Получено ' + value + ' монет. В рюкзаке ' + state.wallet + '.');
  }
  $('dig').addEventListener('click', dig);
  $('start').addEventListener('click', () => {
    if ($('start').disabled) return;
    if (!state) state = G.create(crypto.randomUUID(), Date.now());
    else G.record(state, 'resume', Date.now());
    playingNow = true; lastTick = performance.now(); persist(); render(); $('dig').focus(); delivery.flush();
  });
  $('upgrade').addEventListener('click', () => {
    advanceClock(); if (G.upgrade(state, Date.now())) { persist(); render(); setText('live', 'Оборудование улучшено. Доход ' + G.income(G.current(state)) + ' монет за удар.'); }
  });
  $('move').addEventListener('click', () => {
    advanceClock(); if (G.move(state, Date.now())) { persist(); render(); delivery.flush(); setText('live', 'Переход в шахту ' + G.current(state).name + '.'); }
  });
  $('finish').addEventListener('click', () => {
    advanceClock(); if (G.finish(state, 'voluntary', Date.now())) { persist(); render(); delivery.flush(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  });
  document.querySelectorAll('[data-reason]').forEach(button => button.addEventListener('click', () => {
    if (!state || state.status !== 'finished' || state.reason === button.dataset.reason) return;
    state.reason = button.dataset.reason; G.record(state, 'reason', Date.now(), { reason: state.reason });
    persist(); render(); delivery.flush();
  }));
  document.addEventListener('keydown', event => {
    if (event.code === 'Space' && !event.repeat && state?.status === 'playing' && !$('rules').open &&
        !event.target.closest('button,input,textarea,select,a')) { event.preventDefault(); dig(); }
  });
  $('rules-open').addEventListener('click', () => $('rules').showModal());
  ['rules-close', 'rules-ok'].forEach(id => $(id).addEventListener('click', () => $('rules').close()));
  $('retry').addEventListener('click', () => delivery.flush());
  document.querySelector('.brand').addEventListener('click', event => {
    if (state) { event.preventDefault(); $('rules').showModal(); }
  });
  document.addEventListener('visibilitychange', () => {
    lastTick = performance.now();
    if (playingNow && state?.status === 'playing') { G.record(state, document.hidden ? 'hidden' : 'visible', Date.now()); persist(); }
    if (document.hidden) delivery.beacon(); else delivery.flush();
  });
  window.addEventListener('pagehide', () => { persist(); delivery.beacon(); });
  window.addEventListener('online', () => delivery.flush());
  setInterval(advanceClock, 250);
  setInterval(() => { persist(); if (playingNow || (state?.status === 'finished' && syncStatus !== 'saved')) delivery.flush(); }, 15000);
  $('preview-label').hidden = !preview;
  async function initialize() {
    $('start').disabled = true;
    if (preview) {
      setText('availability', 'Предпросмотр для автора. Сбор данных пока не подключён.');
      $('start').disabled = false;
    } else if (!delivery.enabled()) {
      setText('availability', 'Экспедиция ещё готовится. Организатор скоро откроет доступ.');
      $('start').textContent = 'Скоро начнём';
    } else {
      setText('availability', 'Проверяем готовность экспедиции…');
      try {
        const ready = await delivery.ready();
        $('start').disabled = !ready;
        setText('availability', ready ? '' : 'Экспедиция ещё готовится. Загляни чуть позже.');
      } catch { setText('availability', 'Не удалось подключиться. Проверь интернет и обнови страницу.'); }
    }
    if (state?.status === 'playing') {
      $('start').innerHTML = 'Продолжить экспедицию <svg><use href="#arrow"/></svg>';
      setText('availability', 'Твоя экспедиция сохранена. Можно продолжить с того же места.');
    } else if (state?.status === 'finished') { render(); delivery.flush(); }
  }
  initialize();
})();