import process from 'node:process';
const VERCEL='https://rhhabits.vercel.app';
const GAS='https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec';

async function request(label,url,options={}){
  const r=await fetch(url,{redirect:'follow',cache:'no-store',...options});
  const text=await r.text();
  let json=null; try{json=text?JSON.parse(text):null;}catch{}
  console.log('\n['+label+'] HTTP '+r.status+' '+r.url);
  console.log(json?JSON.stringify(json,null,2):text.slice(0,500));
  if(!r.ok) throw new Error(label+' failed: HTTP '+r.status);
  return {r,text,json};
}

const page=await request('Vercel HTML',VERCEL+'/?verify=20260921');
if(!page.text.includes('<link rel="manifest" href="/manifest.json">')) throw new Error('Live index masih memakai manifest URL lama.');
if(!page.text.includes('gas-bridge.js?v=20260921-r7')) throw new Error('Live index belum memakai RPC bridge r7.');
if(!page.text.includes('renderPublicTransport(p)')) throw new Error('Live index belum memuat App.renderPublicTransport.');

await request('Vercel health',VERCEL+'/api/health');
await request('Vercel GAS health',VERCEL+'/api/health?probe=gas');
await request('Manifest',VERCEL+'/manifest.json');
await request('Apps Script GET ping',GAS+'?fn=ping&args='+encodeURIComponent('[]'));
await request('Apps Script GET getTripMapsUrl',GAS+'?fn=getTripMapsUrl&args='+encodeURIComponent(JSON.stringify([[],'A','B'])));
await request('Vercel RPC GET ping',VERCEL+'/api/rpc?fn=ping&args='+encodeURIComponent('[]'));
await request('Vercel RPC POST ping',VERCEL+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({fn:'ping',args:[]})});
await request('Vercel RPC POST getTripMapsUrl',VERCEL+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({fn:'getTripMapsUrl',args:[[],'A','B']})});
await request('Vercel RPC POST getBootstrap',VERCEL+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({fn:'getBootstrap',args:[]})});
await request('Vercel native-location GET',VERCEL+'/api/native-location');

console.log('\n[RH] verify-stack finished OK');
