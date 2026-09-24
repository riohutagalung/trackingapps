const GAS_URL='https://script.google.com/macros/s/AKfycbyHREf-8F0Dd8G7hXtw_cyQskLkCzmkATDmOeBBovQWe9SeRw49ZIGxIzdSNTvScfn5qg/exec';

function cors(res){
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type, Accept');
  res.setHeader('Vary','Origin');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
}
function json(res,status,data){
  cors(res);
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.end(JSON.stringify(data));
}
function encodedRpcUrl(fn,args){
  return GAS_URL+'?fn='+encodeURIComponent(String(fn))+'&args='+encodeURIComponent(JSON.stringify(Array.isArray(args)?args:[]));
}
async function readBody(req){
  const chunks=[];
  for await(const c of req) chunks.push(Buffer.from(c));
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text) return {};
  try{return JSON.parse(text);}catch(e){throw new Error('Invalid JSON body');}
}
async function readJsonResponse(res){
  const text=await res.text();
  let parsed=null;
  try{parsed=text?JSON.parse(text):null;}catch(e){}
  if(!res.ok){
    const detail=parsed?.error||text?.slice(0,500)||('HTTP '+res.status);
    throw new Error('Apps Script HTTP '+res.status+': '+detail);
  }
  if(!parsed||typeof parsed!=='object') throw new Error('Apps Script mengembalikan respons bukan JSON.');
  return parsed;
}
async function postRpc(fn,args){
  const payload=JSON.stringify({fn:String(fn),args:Array.isArray(args)?args:[]});
  let target=GAS_URL;
  for(let i=0;i<7;i++){
    const r=await fetch(target,{method:'POST',redirect:'manual',headers:{'Accept':'application/json','Content-Type':'application/json'},body:payload,cache:'no-store'});
    if([301,302,303].includes(r.status)){
      const loc=r.headers.get('location');
      if(!loc) throw new Error('Apps Script redirect tanpa Location.');
      target=new URL(loc,target).toString();
      const next=await fetch(target,{method:'GET',redirect:'manual',headers:{'Accept':'application/json'},cache:'no-store'});
      if([301,302,303,307,308].includes(next.status)){
        const nextLoc=next.headers.get('location');
        if(!nextLoc) throw new Error('Apps Script redirect lanjutan tanpa Location.');
        target=new URL(nextLoc,target).toString();
        continue;
      }
      return readJsonResponse(next);
    }
    if([307,308].includes(r.status)){
      const loc=r.headers.get('location');
      if(!loc) throw new Error('Apps Script redirect tanpa Location.');
      target=new URL(loc,target).toString();
      continue;
    }
    return readJsonResponse(r);
  }
  throw new Error('Terlalu banyak redirect Apps Script.');
}

function normalizePoint(body,p){
  const source=p&&typeof p==='object'?p:body;
  const lat=Number(source.latitude!==undefined?source.latitude:source.lat);
  const lng=Number(source.longitude!==undefined?source.longitude:source.lng);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)) return null;
  return {
    tripId:String(source.tripId||body.tripId||'').trim(),
    lat,
    lng,
    accuracy:Number.isFinite(Number(source.accuracy))?Number(source.accuracy):0,
    speedKmh:Number.isFinite(Number(source.speedKmh))
      ?Number(source.speedKmh)
      :(Number.isFinite(Number(source.speed))?Math.max(0,Number(source.speed)*3.6):0),
    bearing:Number.isFinite(Number(source.bearing))?Number(source.bearing):'',
    altitude:Number.isFinite(Number(source.altitude))?Number(source.altitude):'',
    time:Number.isFinite(Number(source.time))&&Number(source.time)>0?Number(source.time):Date.now(),
    simulated:source.simulated===true,
    vehicle:String(source.vehicle||body.vehicle||'Motor'),
    source:String(source.source||'native')
  };
}

module.exports=async function handler(req,res){
  try{
    cors(res);
    if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
    if(req.method==='GET') return json(res,200,{ok:true,service:'rh-native-location',status:'ready',mode:'batch-idempotent'});
    if(req.method!=='POST') return json(res,405,{ok:false,error:'Method GET/POST only'});

    const body=await readBody(req);
    const queryTripId=String(req.query?.tripId||body.tripId||'').trim();
    let rawPoints=Array.isArray(body.points)?body.points:[body];
    const points=rawPoints.map(p=>normalizePoint({...body,tripId:queryTripId||body.tripId},p)).filter(Boolean);
    if(!queryTripId && points.length===0) return json(res,400,{ok:false,error:'tripId dan/atau koordinat GPS wajib diisi'});
    const tripIds=[...new Set(points.map(p=>p.tripId).filter(Boolean))];
    if(!tripIds.length) return json(res,400,{ok:false,error:'tripId wajib diisi'});
    if(tripIds.length>1) return json(res,400,{ok:false,error:'Satu request hanya boleh berisi satu TripID'});

    const tripId=tripIds[0];
    const cleanPoints=points.map(p=>({...p,tripId}));
    const result=await postRpc('saveTripPointsBatch',[tripId,cleanPoints]);
    return json(res,200,result);
  }catch(e){
    console.error('[RH native-location]',e);
    return json(res,502,{ok:false,error:e?.message||String(e)});
  }
};
