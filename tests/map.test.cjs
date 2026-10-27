const test = require('node:test'), assert = require('node:assert/strict');
const vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const G = require('../map-core.js');
const id = '02000000-1212-4121-a121-121212121212';
const make = () => G.create(id, 1700000000000);
function bestCell(s) {
  const m = G.current(s);
  return m.cells.map((_, i) => i).filter(i => G.canDig(m, i)).sort((a, b) => G.value(m, b) - G.value(m, a))[0];
}
function digBest(s) { return G.digCell(s, bestCell(s), 1700000001000 + s.hits); }
test('map routes enforce adjacency, tool gates and single extraction', () => {
  const s = make(), m = G.current(s), untouched = JSON.stringify(s);
  assert.equal(G.digCell(s, 0, 1), null);
  assert.equal(G.digCell(s, -1, 1), null);
  assert.equal(G.digCell(s, 45, 1), null);
  assert.equal(JSON.stringify(s), untouched);
  assert.equal(G.digCell(s, 38, 2).value, 6);
  const after = JSON.stringify(s);
  assert.equal(G.digCell(s, 38, 3), null);
  assert.equal(JSON.stringify(s), after);
  // Reach the level-one obstacle above the starting corridor.
  assert.ok(G.digCell(s, 37, 4));
  assert.equal(m.cells[30].type, 'r');
  assert.equal(G.touchesPath(m, 30), true);
  const beforeRock = JSON.stringify(s);
  assert.equal(G.digCell(s, 30, 5), null);
  assert.equal(JSON.stringify(s), beforeRock);
  assert.ok(G.digCell(s, 44, 6));
  assert.equal(G.upgrade(s, 7), true);
  assert.equal(G.digCell(s, 30, 8).value, 0);
  assert.equal(m.cells[30].cleared, true);
});
test('all layouts offer twelve excavations without buying tools', () => {
  const layouts = new Set();
  for (let mine = 1; mine <= 24; mine++) {
    const s = make(), m = G.current(s); m.index = mine; m.cells = G.board(mine);
    layouts.add(m.cells.map(t => t.type).join(''));
    assert.equal(m.cells.length, 49);
    assert.equal(m.cells[G.ENTRY].type, 'E');
    for (let i = 0; i < 12; i++) assert.ok(digBest(s));
    assert.equal(G.nextAvailable(s), true);
  }
  assert.ok(layouts.size >= 3);
});
test('equipment, routes and map layouts reset on a free transition; wallet survives', () => {
  const s = make(); for (let i = 0; i < 3; i++) digBest(s);
  assert.equal(G.upgrade(s, 100), true);
  for (let i = 0; i < 9; i++) digBest(s);
  const old = G.current(s), wallet = s.wallet;
  assert.equal(G.move(s, 200), true);
  const next = G.current(s);
  assert.equal(s.wallet, wallet); assert.equal(next.level, 0);
  assert.equal(next.cells.filter(t => t.cleared).length, 1);
  assert.equal(old.cells.filter(t => t.cleared).length, 13);
  assert.notDeepEqual(next.cells.map(t => t.type), old.cells.map(t => t.type));
  assert.equal(G.value(next, 38), 6);
});
test('extra actions compare the remaining best reward before excavation', () => {
  const s = make(); for (let i = 0; i < 12; i++) digBest(s);
  assert.equal(G.current(s).extraHits, 0);
  assert.equal(G.better(s), true);
  const amount = G.value(G.current(s), bestCell(s));
  digBest(s);
  assert.equal(G.current(s).extraHits, 1);
  assert.equal(G.current(s).missedCoins, 6 - amount);
  assert.ok(G.upgrade(s, 400));
  assert.equal(G.better(s), false);
  digBest(s); assert.equal(G.current(s).extraHits, 1);
});
test('reload preserves exact paths and finish freezes all map actions', () => {
  const s = make(); digBest(s); digBest(s);
  const restored = JSON.parse(JSON.stringify(s));
  assert.equal(G.validSave(restored), true);
  assert.deepEqual(restored.mines[0].cells, s.mines[0].cells);
  assert.equal(G.validSave({ ...restored, mode: undefined }), false);
  G.finish(restored, 'voluntary', 300); const frozen = JSON.stringify(restored);
  assert.equal(G.digCell(restored, bestCell(restored), 400), null);
  assert.equal(G.upgrade(restored, 500), false);
  assert.equal(G.move(restored, 600), false);
  G.tick(restored, 500, 700, 900000);
  assert.equal(JSON.stringify(restored), frozen);
  const timed = make(); timed.activeMs = 899900;
  G.tick(timed, 500, 2000, 900000);
  assert.equal(timed.finishReason, 'time_limit');
});
test('new map payloads remain accepted by the already deployed v1 collector', () => {
  const ctx = { console }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../apps-script/Code.gs'), 'utf8'), ctx);
  const s = make();
  for (let mine = 0; mine < 80; mine++) {
    for (let i = 0; i < 12; i++) { digBest(s); if (i === 4) G.upgrade(s, 1700000001000 + s.hits); }
    G.move(s, 1700000002000 + s.hits);
  }
  G.finish(s, 'voluntary', 1700000010000);
  const snapshot = G.snapshot(s);
  assert.equal(snapshot.mines.some(m => m.cells), false);
  for (let cursor = 0; cursor < s.events.length; cursor += 100) {
    const packet = { study:'one-more-turn-v1', receipt:'a'.repeat(64), revision:cursor+1,
      session:snapshot, events:s.events.slice(cursor, cursor+100) };
    assert.ok(JSON.stringify(packet).length < 180000);
    assert.doesNotThrow(() => ctx.validate_(packet));
  }
  const copy = G.snapshot(s); copy.mines[0].hits = 999;
  assert.notEqual(s.mines[0].hits, 999);
});
test('a complete route can clear every tile with earned upgrades', () => {
  for (let index = 1; index <= 6; index++) {
    const s = make(), m = G.current(s); m.index = index; m.cells = G.board(index);
    for (let step = 0; step < 48; step++) {
      G.upgrade(s, step);
      assert.ok(digBest(s), 'Route stuck in layout ' + index + ' at ' + step);
    }
    assert.equal(m.hits, 48); assert.equal(G.bestRemaining(m), 0);
    assert.equal(bestCell(s), undefined);
    assert.equal(G.move(s, 200), true);
  }
});
