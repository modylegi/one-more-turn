(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./game-core.js') : root.MineGame);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MineGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Base) {
  'use strict';
  const MODE = 'map-2.0.0', SIZE = 7, ENTRY = 45, SESSION_PREFIX = '02000000-';
  const TILES = Object.freeze({
    d: { name: 'Порода', icon: 'stone', level: 0 },
    o: { name: 'Медная руда', icon: 'ore', level: 0 },
    g: { name: 'Кристалл', icon: 'crystal', level: 0 },
    r: { name: 'Каменный завал', icon: 'rock', level: 1 },
    b: { name: 'Плотная порода', icon: 'rock', level: 2 },
    h: { name: 'Монолит', icon: 'rock', level: 3 },
    E: { name: 'Вход в шахту', icon: 'cart', level: 0 }
  });
  const LAYOUTS = [
    ['gorhrog', 'dbogobd', 'gordrog', 'odgogdo', 'rordror', 'ogggggo', 'ddgEgdd'],
    ['ogbhbgo', 'gdooodg', 'orgrgro', 'dogogod', 'rdododr', 'ogggggo', 'ddgEgdd'],
    ['grdhdrg', 'obogobo', 'gordrog', 'dogoogd', 'rododor', 'ogggggo', 'ddgEgdd']
  ];
  function board(index) {
    const rows = LAYOUTS[(index - 1) % LAYOUTS.length];
    return rows.flatMap((row, r) => Array.from(index % 2 ? row : Array.from(row).reverse().join(''),
      (type, c) => ({ type, cleared: r * SIZE + c === ENTRY })));
  }
  function neighbors(id) {
    if (!Number.isInteger(id) || id < 0 || id >= SIZE * SIZE) return [];
    const row = Math.floor(id / SIZE), col = id % SIZE;
    return [row > 0 ? id - SIZE : -1, col < SIZE - 1 ? id + 1 : -1,
      row < SIZE - 1 ? id + SIZE : -1, col > 0 ? id - 1 : -1].filter(n => n >= 0);
  }
  function attachBoard(m) { m.cells = board(m.index); return m; }
  function create(id, now) {
    const s = Base.create(id, now);
    s.mode = MODE; attachBoard(Base.current(s)); return s;
  }
  function touchesPath(m, id) {
    return !!m.cells[id] && !m.cells[id].cleared && neighbors(id).some(n => m.cells[n].cleared);
  }
  function canDig(m, id) { return touchesPath(m, id) && m.level >= TILES[m.cells[id].type].level; }
  function value(m, id) {
    const t = m.cells[id]; if (!t || t.cleared) return 0;
    if (t.type === 'g') return Base.income(m);
    if (t.type === 'o') return Math.max(1, Base.income(m) - 1);
    return t.type === 'd' ? 1 : 0;
  }
  function bestRemaining(m) { return Math.max(0, ...m.cells.map((_, id) => value(m, id))); }
  function better(s) { return Base.nextAvailable(s) && bestRemaining(Base.current(s)) < 6; }
  function observe(s) {
    const m = Base.current(s);
    if (better(s) && m.betterAtMs === null) m.betterAtMs = s.activeMs;
  }
  function digCell(s, id, now) {
    const m = Base.current(s);
    if (s.status !== 'playing' || !canDig(m, id)) return null;
    const amount = value(m, id), alternativeBetter = better(s), type = m.cells[id].type;
    if (alternativeBetter) { m.extraHits++; m.missedCoins += 6 - amount; }
    m.cells[id].cleared = true;
    m.hits++; m.earned += amount; s.hits++; s.wallet += amount; s.earned += amount;
    observe(s);
    Base.record(s, 'dig', now, { value: amount, alternativeBetter, cell: id, tile: type });
    return { value: amount, type, cell: id };
  }
  function upgrade(s, now) {
    if (!Base.upgrade(s, now)) return false;
    observe(s); return true;
  }
  function move(s, now) {
    if (!Base.move(s, now)) return false;
    attachBoard(Base.current(s)); return true;
  }
  function snapshot(s) {
    const result = Base.snapshot(s);
    // Keep the deployed v1 collector contract; tile state is only for local resume.
    result.mines = result.mines.map(({ cells, ...metrics }) => metrics);
    return result;
  }
  function validSave(s) {
    return !!s && s.version === Base.VERSION && s.mode === MODE &&
      ['playing', 'finished'].includes(s.status) && Array.isArray(s.events) &&
      Array.isArray(s.mines) && s.mines.length > 0 &&
      s.mines.every(m => Array.isArray(m.cells) && m.cells.length === SIZE * SIZE &&
        m.cells.every(t => t && TILES[t.type] && typeof t.cleared === 'boolean') &&
        m.cells[ENTRY].cleared);
  }
  return { ...Base, MODE, SIZE, ENTRY, SESSION_PREFIX, TILES, board, neighbors, create,
    touchesPath, canDig, value, bestRemaining, better, digCell, upgrade, move, snapshot, validSave };
});
