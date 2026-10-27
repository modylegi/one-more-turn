(function () {
  'use strict';
  const $ = id => document.getElementById(id), G = MineGame, config = window.GAME_CONFIG;
  const STORE = 'omt-map-session-v2', DELIVERY_STORE = 'omt-map-delivery-v2';
  const preview = ['localhost', '127.0.0.1', ''].includes(location.hostname) && !config.endpoint;
  const names = ['Медная лощина', 'Тихий грот', 'Янтарный разлом', 'Северная жила', 'Зелёный склон', 'Лунная пещера'];
  const equipment = ['Ручной инструмент', 'Стальная кирка', 'Усиленный инструмент', 'Буровая установка'];
  let state = null, playingNow = false, lastTick = performance.now(), lastAction = -Infinity;
  let cooldownTimer, syncStatus = 'pending', boardMine = 0, cursor = 38, lastCell = -1;
  try {
    const stored = JSON.parse(localStorage.getItem(STORE));
    if (G.validSave(stored)) state = stored;
  } catch { /* No saved map expedition. Old clicker saves remain untouched. */ }
  const delivery = new MineDelivery({ ...config, storageKey: DELIVERY_STORE }, () => state, status => {
    syncStatus = status; renderSync();
  });
  const icon = name => '<svg aria-hidden="true"><use href="#' + name + '"/></svg>';
  function persist() {
    if (!state) return;
    try { localStorage.setItem(STORE, JSON.stringify(state)); }
    catch { $('live').textContent = 'Автосохранение недоступно. Не закрывай вкладку до отправки результата.'; }
  }
  function time(ms) { const s = Math.floor(ms / 1000); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }
  function setText(id, text) { $(id).textContent = text; }
  function show(screen) { ['intro', 'game', 'result'].forEach(id => { $(id).hidden = id !== screen; }); }
  function feedback(message) { setText('map-feedback', message); }
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
  function pathIcon(m, id) {
    let d = '';
    G.neighbors(id).forEach(n => {
      if (!m.cells[n].cleared) return;
      d += 'M12 12L' + (n === id - 7 ? '12 0' : n === id + 7 ? '12 24' : n === id - 1 ? '0 12' : '24 12');
    });
    return '<svg class="path-lines" viewBox="0 0 24 24" aria-hidden="true"><path d="' + d + '"/></svg>';
  }
  function tileContent(m, id, miniature = false) {
    const t = m.cells[id], info = G.TILES[t.type];
    if (t.cleared) return pathIcon(m, id) + (t.type === 'E' ? icon('cart') : '<span class="path-dot"></span>');
    const badge = info.level ? '<span class="tile-level">' + info.level + '</span>' : '';
    return icon(info.icon) + (miniature ? '' : '<span class="tile-value">' + G.value(m, id) + '</span>') + badge;
  }
  function renderBoard(m) {
    if (boardMine !== m.index) {
      boardMine = m.index; cursor = 38; lastCell = -1;
      $('board').replaceChildren();
      m.cells.forEach((_, id) => {
        const button = document.createElement('button');
        button.type = 'button'; button.dataset.cell = id;
        $('board').append(button);
      });
    }
    const cooling = performance.now() - lastAction < config.actionCooldownMs;
    Array.from($('board').children).forEach((button, id) => {
      const tile = m.cells[id], info = G.TILES[tile.type], reachable = G.touchesPath(m, id), available = G.canDig(m, id);
      button.className = 'tile tile-' + tile.type + (tile.cleared ? ' cleared' : '') +
        (available ? ' frontier' : '') + (reachable && !available ? ' blocked' : '') +
        (id === lastCell ? ' last-dug' : '');
      button.innerHTML = tileContent(m, id);
      button.tabIndex = id === cursor ? 0 : -1;
      button.setAttribute('aria-disabled', String(!available || cooling));
      const detail = tile.cleared ? (tile.type === 'E' ? 'Вход' : 'Проход открыт') :
        info.name + ', ' + G.value(m, id) + ' монет. ' +
        (m.level < info.level ? 'Нужен инструмент уровня ' + info.level + '. ' : '') +
        (reachable ? (available ? 'Можно добывать.' : 'Завал.') : 'Сначала проложи соседний проход.');
      button.setAttribute('aria-label', 'Ряд ' + (Math.floor(id / 7) + 1) + ', клетка ' + (id % 7 + 1) + '. ' + detail);
      button.title = detail;
    });
    $('board').classList.toggle('cooling', cooling);
    setText('map-progress', 'Открыто ' + m.hits + ' / 48');
    setText('crystal-value', G.income(m));
    setText('ore-value', Math.max(1, G.income(m) - 1));
    setText('camp-name', equipment[m.level]);
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
    setText('wallet', state.wallet); setText('timer', time(state.activeMs));
    setText('condition', m.hits === 48 ? 'Участок расчищен' : ['Богатая жила', 'Руды становится меньше', 'Редкая руда', 'Бедная жила'][phase]);
    setText('upgrade-title', m.level < 3 ? equipment[m.level + 1] : 'Шахта оборудована');
    setText('upgrade-level', m.level < 3 ? 'Улучшение ' + (m.level + 1) + ' из 3' : 'Установлены все 3 улучшения');
    setText('upgrade-description', [
      'Открывает каменные завалы ①. +1 монета за руду и кристаллы.',
      'Открывает плотную породу ②. Ещё +1 монета за руду и кристаллы.',
      'Разбирает монолиты ③. Ещё +1 монета за руду и кристаллы.',
      'Любые завалы доступны. Руда и кристаллы дают на 3 монеты больше.'
    ][m.level]);
    setText('upgrade-cost', cost === undefined ? '✓' : cost + ' ◈');
    $('upgrade').disabled = cost === undefined || state.wallet < cost;
    $('upgrade').querySelector('span').textContent = cost === undefined ? 'Установлено' : 'Улучшить';
    document.querySelectorAll('[data-camp]').forEach((el, i) => {
      el.classList.toggle('built', m.level > i);
      el.setAttribute('aria-label', equipment[i + 1] + (m.level > i ? ': установлено' : ': пока нет'));
    });
    setText('next-name', names[m.index % names.length]);
    setText('current-best', G.bestRemaining(m));
    setText('next-copy', G.nextAvailable(state) ? 'Новый участок разведан. Переход в любой момент.' : 'До нового участка: ещё ' + (12 - m.hits) + ' клеток.');
    $('move').disabled = !G.nextAvailable(state);
    renderBoard(m);
  }
  function advanceClock() {
    const now = performance.now(), delta = now - lastTick; lastTick = now;
    if (!playingNow || !state || state.status !== 'playing' || document.hidden) return;
    if (G.tick(state, delta, Date.now(), config.sessionLimitSeconds * 1000)) {
      persist(); render(); delivery.flush();
    } else setText('timer', time(state.activeMs));
  }
  function focusCell(id) {
    cursor = id;
    Array.from($('board').children).forEach((el, n) => { el.tabIndex = n === id ? 0 : -1; });
    $('board').children[id].focus({ preventScroll: true });
  }
  function excavate(id) {
    if (!playingNow || state?.status !== 'playing') return;
    const m = G.current(state), tile = m.cells[id];
    if (!tile || tile.cleared) return;
    cursor = id;
    if (!G.touchesPath(m, id)) { feedback('Сначала проложи проход к этой клетке. Копать можно рядом с уже открытым путём.'); return; }
    if (!G.canDig(m, id)) { feedback('Этот завал откроет ' + equipment[G.TILES[tile.type].level].toLowerCase() + '. Улучшение можно купить справа.'); return; }
    if (performance.now() - lastAction < config.actionCooldownMs) return;
    advanceClock(); if (state.status !== 'playing') return;
    const found = G.digCell(state, id, Date.now()); if (!found) return;
    lastAction = performance.now(); lastCell = id;
    persist(); render();
    let message = found.value ? '+' + found.value + ' монет. ' + G.TILES[found.type].name + ' добыта, проход открыт.' : 'Завал разобран. Открыт новый проход.';
    if (found.type === 'g') message = '+' + found.value + ' монет. Кристалл найден — выбирай следующий путь.';
    if (m.hits === 12) message += ' Теперь доступна новая шахта.';
    if (m.hits === 24 || m.hits === 36) message += ' Жила истощается: ценность находок снизилась.';
    if (m.hits === 48) message = 'Все проходы открыты. Можно перейти в новую шахту или завершить экспедицию.';
    feedback(message);
    const pop = document.createElement('span');
    pop.className = 'map-pop'; pop.textContent = found.value ? '+' + found.value : '✓';
    pop.style.left = ((id % 7 + 0.5) / 7 * 100) + '%';
    pop.style.top = ((Math.floor(id / 7) + 0.5) / 7 * 100) + '%';
    $('map-effects').append(pop); setTimeout(() => pop.remove(), 850);
    clearTimeout(cooldownTimer); cooldownTimer = setTimeout(render, config.actionCooldownMs + 5);
  }
  $('board').addEventListener('click', event => {
    const button = event.target.closest('[data-cell]');
    if (button) { focusCell(Number(button.dataset.cell)); excavate(Number(button.dataset.cell)); }
  });
  $('board').addEventListener('keydown', event => {
    const button = event.target.closest('[data-cell]'); if (!button) return;
    const id = Number(button.dataset.cell), row = Math.floor(id / 7), col = id % 7;
    const next = { ArrowUp: row ? id - 7 : id, ArrowDown: row < 6 ? id + 7 : id,
      ArrowLeft: col ? id - 1 : id, ArrowRight: col < 6 ? id + 1 : id }[event.key];
    if (next !== undefined) { event.preventDefault(); focusCell(next); }
    else if (event.code === 'Space' || event.key === 'Enter') {
      event.preventDefault(); if (!event.repeat) excavate(id);
    }
  });
  $('start').addEventListener('click', () => {
    if ($('start').disabled) return;
    if (!state) state = G.create(G.SESSION_PREFIX + crypto.randomUUID().slice(9), Date.now());
    else G.record(state, 'resume', Date.now());
    playingNow = true; lastTick = performance.now(); persist(); render();
    feedback('Начни с подсвеченных клеток у вагонетки. Число на клетке — твоя добыча.');
    const first = G.current(state).cells.findIndex((_, id) => G.canDig(G.current(state), id));
    focusCell(first >= 0 ? first : G.ENTRY);
    delivery.flush();
  });
  $('upgrade').addEventListener('click', () => {
    advanceClock();
    if (G.upgrade(state, Date.now())) {
      persist(); render();
      feedback('Улучшение готово: ' + equipment[G.current(state).level].toLowerCase() + '. Новые завалы доступны, ценность руды и кристаллов выросла.');
    }
  });
  $('move').addEventListener('click', () => {
    advanceClock();
    if (G.move(state, Date.now())) {
      lastAction = -Infinity; persist(); render(); delivery.flush();
      feedback('Новая карта: ' + G.current(state).name + '. Монеты с тобой, инструменты остались на старом участке.');
      focusCell(38);
    }
  });
  $('finish').addEventListener('click', () => {
    advanceClock();
    if (G.finish(state, 'voluntary', Date.now())) {
      persist(); render(); delivery.flush(); window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  });
  document.querySelectorAll('[data-reason]').forEach(button => button.addEventListener('click', () => {
    if (!state || state.status !== 'finished' || state.reason === button.dataset.reason) return;
    state.reason = button.dataset.reason; G.record(state, 'reason', Date.now(), { reason: state.reason });
    persist(); render(); delivery.flush();
  }));
  $('retry').addEventListener('click', () => delivery.flush());
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
  // Decorative sample shows a possible route; no participant session is created.
  const sample = G.create('preview', 0).mines[0];
  [44, 38, 37, 30, 23, 24, 25].forEach(id => { sample.cells[id].cleared = true; });
  sample.level = 1;
  sample.cells.forEach((tile, id) => {
    const span = document.createElement('span');
    span.className = 'tile tile-' + tile.type + (tile.cleared ? ' cleared' : '') + (G.canDig(sample, id) ? ' frontier' : '');
    span.innerHTML = tileContent(sample, id, true); $('intro-map').append(span);
  });
  async function initialize() {
    $('start').disabled = true;
    if (preview) {
      setText('availability', 'Предпросмотр для автора. Результаты не отправляются.');
      $('start').disabled = false;
    } else if (!delivery.enabled()) {
      setText('availability', 'Экспедиция ещё готовится. Организатор скоро откроет доступ.');
      $('start').textContent = 'Скоро начнём';
    } else {
      setText('availability', 'Проверяем готовность экспедиции…');
      try {
        const ready = await delivery.ready(); $('start').disabled = !ready;
        setText('availability', ready ? '' : 'Экспедиция ещё готовится. Загляни чуть позже.');
      } catch { setText('availability', 'Не удалось подключиться. Проверь интернет и обнови страницу.'); }
    }
    if (state?.status === 'playing') {
      $('start').innerHTML = 'Продолжить экспедицию ' + icon('arrow');
      if (!$('start').disabled) setText('availability', 'Твоя карта сохранена. Можно продолжить с того же места.');
    } else if (state?.status === 'finished') { render(); delivery.flush(); }
  }
  initialize();
})();
