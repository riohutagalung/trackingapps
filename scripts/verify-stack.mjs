import process from 'node:process';

const VERCEL='https://rhhabits.vercel.app';
const GAS='https://script.google.com/macros/s/AKfycbyHREf-8F0Dd8G7hXtw_cyQskLkCzmkATDmOeBBovQWe9SeRw49ZIGxIzdSNTvScfn5qg/exec';

async function request(label,url,options={}){
  try{
    const r=await fetch(url,{redirect:'follow',cache:'no-store',...options});
    const text=await r.text();
    let json=null; try{json=text?JSON.parse(text):null;}catch{}
    console.log('\n['+label+'] HTTP '+r.status+' '+r.url);
    console.log(json?JSON.stringify(json,null,2):text.slice(0,500));
    return {r,text,json};
  }catch(e){
    console.error('\n['+label+'] ERROR',e?.message||String(e));
    return null;
  }
}

await request('Vercel health',VERCEL+'/api/health');
await request('Vercel GAS health',VERCEL+'/api/health?probe=gas');
await request('Manifest',VERCEL+'/manifest.json');
await request('Apps Script GET ping',GAS+'?fn=ping&args='+encodeURIComponent('[]'));
await request('Vercel RPC POST ping',VERCEL+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify({fn:'ping',args:[]})});
await request('Vercel native-location GET',VERCEL+'/api/native-location');
console.log('\n[RH] verify-stack finished');
