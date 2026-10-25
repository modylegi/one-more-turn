const test=require('node:test'), assert=require('node:assert/strict'), vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const G=require('../game-core.js');
const code=fs.readFileSync(path.join(__dirname,'../apps-script/Code.gs'),'utf8');
function context(){const c={console,SpreadsheetApp:{flush(){}}};vm.createContext(c);vm.runInContext(code,c);return c;}
class Sheet{
  constructor(header){this.rows=[header];}
  getLastRow(){return this.rows.length;}
  getLastColumn(){return this.rows[0].length;}
  getRange(r,c,n=1,m=1){const self=this;return{
    getValues(){return Array.from({length:n},(_,i)=>Array.from({length:m},(_,j)=>self.rows[r+i-1]?.[c+j-1]??''));},
    setValues(values){for(let i=0;i<values.length;i++){self.rows[r+i-1] ||= []; for(let j=0;j<values[i].length;j++)self.rows[r+i-1][c+j-1]=values[i][j];}return this;}
  };}
}
function fixture(){
  const ctx=context(), headers=vm.runInContext('HEADERS',ctx), sheets={};
  for(const name of Object.keys(headers))sheets[name]=new Sheet(Array.from(headers[name]));
  const ss={getSheetByName:n=>sheets[n]};
  const state=G.create('a1212121-1212-4121-a121-121212121212',1700000000000);
  const packet={study:'one-more-turn-v1',receipt:'a'.repeat(64),revision:1,session:G.snapshot(state),events:state.events.slice()};
  return {ctx,ss,sheets,state,packet};
}
test('collector validates real snapshots and rejects arbitrary cell formula input',()=>{
  const {ctx,packet}=fixture();assert.doesNotThrow(()=>ctx.validate_(packet));
  const bad=structuredClone(packet);bad.session.mines[0].name='=IMPORTXML(\"https://bad\", \"x\")';
  assert.throws(()=>ctx.validate_(bad));
  const invalid=structuredClone(packet);invalid.session.wallet=-1;assert.throws(()=>ctx.validate_(invalid));
});
test('retries and overlapping event batches never duplicate rows',()=>{
  const {ctx,ss,sheets,state,packet}=fixture();ctx.ingest_(packet,ss);ctx.ingest_(packet,ss);
  assert.equal(sheets.Sessions.rows.length,2);assert.equal(sheets.Events.rows.length,2);
  G.dig(state,1700000001000);G.finish(state,'voluntary',1700000002000);
  const p2={...packet,revision:2,session:G.snapshot(state),events:state.events.slice()};
  ctx.ingest_(p2,ss);ctx.ingest_(p2,ss);
  assert.equal(sheets.Events.rows.length,4);
  assert.equal(sheets.Sessions.rows[1][5],'finished');
  assert.equal(sheets.Sessions.rows[1][6],'voluntary');
  assert.equal(sheets.Sessions.rows[1][8],6);
  assert.equal(ctx.ingest_(packet,ss),2);
  assert.equal(sheets.Sessions.rows[1][5],'finished');
});
test('partial write can be retried without duplicate events',()=>{
  const {ctx,ss,sheets,packet}=fixture();
  ctx.appendEvents_(sheets.Events,packet.events.map(e=>ctx.eventRow_(packet.session,e)));
  assert.equal(sheets.Events.rows.length,2);
  ctx.ingest_(packet,ss);assert.equal(sheets.Events.rows.length,2);assert.equal(sheets.Sessions.rows.length,2);
});
test('missing events are rejected, not silently acknowledged',()=>{
  const {ctx,ss,packet,state}=fixture();
  G.dig(state,1700000001000);
  const p={...packet,events:[state.events[1]],session:G.snapshot(state)};
  assert.throws(()=>ctx.ingest_(p,ss),/event gap/);
});