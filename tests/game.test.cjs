const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../game-core.js');
const id = 'a1212121-1212-4121-a121-121212121212';
test('income, upgrade cost, and transitions preserve actual earned balance', () => {
  const s = G.create(id, 1000);
  assert.equal(G.move(s, 1001), false);
  assert.equal(G.upgrade(s, 1001), false);
  for (let i=0;i<3;i++) G.dig(s, 1002+i);
  assert.equal(s.wallet, 18);
  assert.equal(G.upgrade(s, 1006), true);
  assert.equal(s.wallet, 0); assert.equal(G.income(G.current(s)), 7);
  for (let i=0;i<9;i++) G.dig(s, 1010+i);
  const balance=s.wallet, earned=s.earned;
  assert.equal(G.move(s, 1100), true);
  assert.equal(s.wallet, balance); assert.equal(s.earned, earned);
  assert.equal(G.current(s).level, 0); assert.equal(G.income(G.current(s)), 6);
  assert.equal(s.mines[0].invested, 18); assert.equal(s.switches, 1);
});
test('extra actions count only when the alternative was actually better before the action', () => {
  const s=G.create(id, 1000);
  for(let i=0;i<12;i++){G.tick(s,650,2000+i,900000);G.dig(s,2000+i);}
  assert.equal(G.current(s).extraHits,0);
  assert.equal(G.income(G.current(s)),5);
  G.dig(s,3000); assert.equal(G.current(s).extraHits,1);
  assert.equal(G.current(s).missedCoins,1);
  G.upgrade(s,3001); // 5 + 1 = 6, equal to the alternative again.
  G.dig(s,3002); assert.equal(G.current(s).extraHits,1);
  for(let i=0;i<60;i++) G.dig(s,4000+i);
  assert.ok(G.income(G.current(s)) < 6);
  assert.ok(G.snapshot(s).extraHits > 1);
});
test('voluntary finish and time limit are distinct and freeze gameplay', () => {
  const s=G.create(id,1000);G.dig(s,1001);G.finish(s,'voluntary',2000);
  const saved=JSON.stringify(s);
  assert.equal(G.dig(s,3000),null);assert.equal(G.upgrade(s,3000),false);assert.equal(G.move(s,3000),false);
  G.tick(s,2000,4000,900000);assert.equal(JSON.stringify(s),saved);
  const t=G.create(id,1000);t.activeMs=899900;
  assert.equal(G.tick(t,500,2000,900000),true);
  assert.equal(t.activeMs,900000);assert.equal(t.finishReason,'time_limit');
});
test('snapshots do not share mutable mine state',()=>{
  const s=G.create(id,1000), snapshot=G.snapshot(s);
  G.dig(s,1001);assert.equal(snapshot.mines[0].hits,0);
});
test('snapshot timestamps cannot produce a negative duration immediately after a transition',()=>{
  const s=G.create(id,1000);for(let i=0;i<12;i++)G.dig(s,1001+i);
  s.activeMs=100.2;G.move(s,1100);
  const snapshot=G.snapshot(s);
  assert.ok(snapshot.activeMs>=snapshot.mines[1].enteredMs);
});
