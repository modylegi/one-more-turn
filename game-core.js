(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MineGame = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const VERSION = '1.0.0';
  const NAMES = ['Медная лощина', 'Тихий грот', 'Янтарный разлом', 'Северная жила', 'Зелёный склон', 'Лунная пещера'];
  const COSTS = [18, 36, 60], PHASES = [6, 5, 3, 1];
  function mine(index, activeMs) {
    return { index, name: NAMES[(index - 1) % NAMES.length], hits: 0, level: 0, invested: 0, earned: 0,
      enteredMs: activeMs, leftMs: null, betterAtMs: null, extraHits: 0, missedCoins: 0 };
  }
  function create(id, now) {
    const state = { version: VERSION, id, startedAt: now, endedAt: null, status: 'playing', finishReason: '',
      activeMs: 0, wallet: 0, earned: 0, hits: 0, switches: 0, mines: [mine(1, 0)], events: [] };
    record(state, 'start', now); return state;
  }
  function current(s) { return s.mines[s.mines.length - 1]; }
  function income(m) { return PHASES[Math.min(3, Math.floor(m.hits / 12))] + m.level; }
  function nextAvailable(s) { return current(s).hits >= 12; }
  function better(s) { return nextAvailable(s) && income(current(s)) < 6; }
  function observe(s) { const m = current(s); if (better(s) && m.betterAtMs === null) m.betterAtMs = s.activeMs; }
  function record(s, type, now, details) {
    const m = current(s);
    s.events.push({ seq: s.events.length + 1, type, at: now, activeMs: Math.round(s.activeMs),
      mine: m.index, wallet: s.wallet, income: income(m), ...details });
  }
  function tick(s, delta, now, limitMs) {
    if (s.status !== 'playing') return false;
    s.activeMs += Math.max(0, Math.min(delta, 2000));
    if (s.activeMs >= limitMs) { s.activeMs = limitMs; finish(s, 'time_limit', now); return true; }
    return false;
  }
  function dig(s, now) {
    if (s.status !== 'playing') return null;
    const m = current(s), value = income(m), alternativeBetter = better(s);
    if (alternativeBetter) { m.extraHits++; m.missedCoins += 6 - value; }
    m.hits++; m.earned += value; s.hits++; s.wallet += value; s.earned += value;
    observe(s); record(s, 'dig', now, { value, alternativeBetter }); return value;
  }
  function upgrade(s, now) {
    const m = current(s), cost = COSTS[m.level];
    if (s.status !== 'playing' || cost === undefined || s.wallet < cost) return false;
    s.wallet -= cost; m.invested += cost; m.level++;
    record(s, 'upgrade', now, { cost, level: m.level }); return true;
  }
  function move(s, now) {
    if (s.status !== 'playing' || !nextAvailable(s)) return false;
    const old = current(s); old.leftMs = s.activeMs; const from = old.index;
    s.mines.push(mine(from + 1, s.activeMs)); s.switches++; record(s, 'switch', now, { from }); return true;
  }
  function finish(s, reason, now) {
    if (s.status !== 'playing') return false;
    s.status = 'finished'; s.finishReason = reason; s.endedAt = now; current(s).leftMs = s.activeMs;
    record(s, 'finish', now, { reason }); return true;
  }
  function snapshot(s) {
    return { id: s.id, version: s.version, startedAt: s.startedAt, endedAt: s.endedAt,
      status: s.status, finishReason: s.finishReason, activeMs: Math.round(s.activeMs),
      wallet: s.wallet, earned: s.earned, hits: s.hits, switches: s.switches,
      extraHits: s.mines.reduce((n, m) => n + m.extraHits, 0),
      missedCoins: s.mines.reduce((n, m) => n + m.missedCoins, 0),
      mines: JSON.parse(JSON.stringify(s.mines)) };
  }
  return { VERSION, COSTS, create, current, income, nextAvailable, better, record, tick, dig, upgrade, move, finish, snapshot };
});