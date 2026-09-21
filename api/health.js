const GAS_URL='https://script.google.com/macros/s/AKfycbyHREf-8F0Dd8G7hXtw_cyQskLkCzmkATDmOeBBovQWe9SeRw49ZIGxIzdSNTvScfn5qg/exec';

async function probeGas(){
  const url=GAS_URL+'?fn=ping&args='+encodeURIComponent('[]');
  const r=await fetch(url,{method:'GET',redirect:'follow',cache:'no-store',headers:{'Accept':'application/json'}});
  const text=await r.text();
  let body=null; try{body=text?JSON.parse(text):null;}catch(e){}
  if(!r.ok) throw new Error('Apps Script HTTP '+r.status);
  if(!body||body.ok!==true) throw new Error(body?.error||'Apps Script ping gagal');
  return true;
}

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  if(req.query?.probe==='gas'){
    try{return res.end(JSON.stringify({ok:true,service:'rh-habits-vercel',version:'2026-09-21-r3',build:'public-static',rpc:'redirect-safe',gas:true}));}
    catch(e){res.statusCode=502;return res.end(JSON.stringify({ok:false,service:'rh-habits-vercel',version:'2026-09-21-r3',build:'public-static',rpc:'redirect-safe',gas:false,error:e?.message||String(e)}));}
  }
  res.statusCode=200;
  res.end(JSON.stringify({ok:true,service:'rh-habits-vercel',version:'2026-09-21-r3',build:'public-static',rpc:'redirect-safe'}));
};
