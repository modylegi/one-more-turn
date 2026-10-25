const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path'),{webcrypto}=require('node:crypto');
const G=require('../game-core.js');
function fixture(){
  const store=new Map(),statuses=[],sent=[],server={revision:0};
  const state=G.create('a1212121-1212-4121-a121-121212121212',1700000000000);
  const ctx={console,crypto:webcrypto,URL,URLSearchParams,MineGame:G,navigator:{},localStorage:{
    getItem:key=>store.get(key)||null,setItem:(key,value)=>store.set(key,value)
  },setTimeout:(fn,ms)=>setTimeout(fn,ms===1500?1:ms),clearTimeout};
  ctx.window=ctx;
  ctx.document={createElement:()=>({remove(){}}),head:{append(script){
    const callback=new URL(script.src).searchParams.get('callback');
    queueMicrotask(()=>ctx[callback]?.({revision:server.revision,ready:true}));
  }}};
  ctx.fetch=async(url,opts)=>{sent.push(JSON.parse(opts.body.get('payload')));return {type:'opaque',status:0};};
  vm.createContext(ctx);vm.runInContext(fs.readFileSync(path.join(__dirname,'../transport.js'),'utf8'),ctx);
  const delivery=new ctx.MineDelivery({endpoint:'https://script.google.com/macros/s/test/exec',studyId:'one-more-turn-v1'},()=>state,s=>statuses.push(s));
  return {delivery,ctx,state,server,statuses,sent,store};
}
test('opaque POST success is not a saved receipt; failed ack keeps the exact packet',async()=>{
  const {delivery,statuses,sent}=fixture();
  await delivery.flush();
  assert.equal(statuses.at(-1),'pending');assert.ok(delivery.data.pending);
  assert.equal(delivery.data.cursor,0);assert.equal(sent.length,1);
});
test('a confirmed retry clears the pending packet and advances the event cursor',async()=>{
  const {delivery,statuses,server,sent}=fixture();
  await delivery.flush();server.revision=1;
  await delivery.flush();
  assert.equal(statuses.at(-1),'saved');assert.equal(delivery.data.pending,null);
  assert.equal(delivery.data.cursor,1);assert.equal(JSON.stringify(sent[0]),JSON.stringify(sent[1]));
});
test('reload retains unacknowledged request and idempotency identifiers',async()=>{
  const {delivery,ctx,state,server,sent}=fixture();
  await delivery.flush();
  const restored=new ctx.MineDelivery({endpoint:'https://script.google.com/macros/s/test/exec',studyId:'one-more-turn-v1'},()=>state,()=>{});
  assert.equal(JSON.stringify(restored.data.pending),JSON.stringify(sent[0]));
  server.revision=1;await restored.flush();assert.equal(restored.data.cursor,1);
});