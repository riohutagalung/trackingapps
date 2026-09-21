const GAS_URL='https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec';

async function callGas(fn,args){
  const url=GAS_URL+'?fn='+encodeURIComponent(fn)+'&args='+encodeURIComponent(JSON.stringify(args||[]));
  const r=await fetch(url,{method:'GET',redirect:'follow',cache:'no-store',headers:{'Accept':'application/json'}});
  const text=await r.text();
  let body=null; try{body=text?JSON.parse(text):null;}catch(e){}
  if(!r.ok) throw new Error('Apps Script HTTP '+r.status);
  if(!body||body.ok!==true) throw new Error(body?.error||('Apps Script '+fn+' gagal'));
  return body.result;
}

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  const base={service:'rh-habits-vercel',version:'2026-09-21-r6',build:'public-static',rpc:'redirect-safe'};
  if(req.query?.probe==='gas'){
    try{
      const ping=await callGas('ping',[]);
      const maps=await callGas('getGoogleMapsUrlForTrip',[{origin:'A',destination:'B'}]);
      const mapsOk=typeof maps==='string' && maps.indexOf('https://www.google.com/maps/dir/')===0;
      if(!mapsOk) throw new Error('getGoogleMapsUrlForTrip tidak mengembalikan URL Maps yang valid');
      const tripMaps=await callGas('getTripMapsUrl',[[], 'A', 'B']);
      const tripMapsOk=typeof tripMaps==='string' && tripMaps.indexOf('https://www.google.com/maps/dir/')===0;
      if(!tripMapsOk) throw new Error('getTripMapsUrl tidak tersedia atau tidak mengembalikan URL Maps yang valid');
      res.statusCode=200;
      return res.end(JSON.stringify({...base,ok:true,gas:true,gasPing:true,gasMaps:true}));
    }catch(e){
      res.statusCode=502;
      return res.end(JSON.stringify({...base,ok:false,gas:false,error:e?.message||String(e)}));
    }
  }
  res.statusCode=200;
  res.end(JSON.stringify({...base,ok:true}));
};
