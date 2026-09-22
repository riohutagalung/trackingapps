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
async function invokePost(fn,args){
  const payload=JSON.stringify({fn:String(fn),args:Array.isArray(args)?args:[]});
  let target=GAS_URL;
  for(let i=0;i<7;i++){
    const r=await fetch(target,{method:'POST',redirect:'manual',headers:{'Accept':'application/json','Content-Type':'application/json'},body:payload,cache:'no-store'});
    if([301,302,303].includes(r.status)){
      const loc=r.headers.get('location');
      if(!loc) throw new Error('Apps Script redirect tanpa Location.');
      // Apps Script ContentService uses 302 for its post-redirect-get response.
      // Re-issue the generated endpoint as GET; keeping POST here causes Google's
      // script.googleusercontent.com endpoint to return HTTP 405.
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
async function invokeGet(fn,args){
  let target=encodedRpcUrl(fn,args);
  for(let i=0;i<7;i++){
    const r=await fetch(target,{method:'GET',redirect:'manual',headers:{'Accept':'application/json'},cache:'no-store'});
    if([301,302,303,307,308].includes(r.status)){
      const loc=r.headers.get('location');
      if(!loc) throw new Error('Apps Script redirect tanpa Location.');
      target=new URL(loc,target).toString();
      continue;
    }
    return readJsonResponse(r);
  }
  throw new Error('Terlalu banyak redirect Apps Script.');
}
async function savePointBatches(tripId,points){
  const list=Array.isArray(points)?points:[];
  if(!list.length) return;
  const chunkSize=25;
  for(let i=0;i<list.length;i+=chunkSize){
    const chunk=list.slice(i,i+chunkSize);
    const result=await invokeGet('saveTripPointsBatch',[tripId,chunk]);
    if(result && result.ok===false) throw new Error(result.error||'Gagal menyimpan titik GPS.');
  }
}
async function forward(body){
  const fn=String(body.fn);
  const args=Array.isArray(body.args)?body.args:[];
  if(fn==='addTrip' && args[0] && typeof args[0]==='object' && Array.isArray(args[0].gpsPoints) && args[0].gpsPoints.length){
    const data={...args[0]};
    const points=data.gpsPoints.slice();
    const tripId=String(data.id||'').trim();
    if(tripId){
      await savePointBatches(tripId,points);
      data.gpsPoints=[];
      const nextArgs=args.slice();
      nextArgs[0]=data;
      return invokeGet(fn,nextArgs);
    }
  }
  if(fn==='saveTripPointsBatch' && args.length>=2){
    const tripId=String(args[0]||'').trim();
    const points=Array.isArray(args[1])?args[1]:[];
    if(tripId && points.length){
      await savePointBatches(tripId,points);
      return {ok:true,result:{ok:true,saved:points.length}};
    }
  }
  if(fn==='analyzeReceipt') return invokePost(fn,args);
  return invokeGet(fn,args);
}
module.exports=async function handler(req,res){
  try{
    cors(res);
    if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
    let body;
    if(req.method==='POST') body=await readBody(req);
    else if(req.method==='GET') body={fn:req.query?.fn,args:req.query?.args?JSON.parse(req.query.args):[]};
    else return json(res,405,{ok:false,error:'Method GET/POST only'});
    if(!body||!body.fn) return json(res,400,{ok:false,error:'fn wajib diisi'});
    return json(res,200,await forward(body));
  }catch(e){
    console.error('[RH rpc]',e);
    return json(res,502,{ok:false,error:e?.message||String(e)});
  }
};
