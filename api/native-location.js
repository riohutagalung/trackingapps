const GAS_URL = 'https://script.google.com/macros/s/AKfycbw8WedGItXJ7OjDyetD2BbgnA88BWSK2YZ7se7jvivjJ5V6UZfNy6fOrJxLOXZCSeE3gg/exec';

function json(res, status, data){
  res.statusCode=status;
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','no-store, no-cache, must-revalidate, max-age=0');
  res.end(JSON.stringify(data));
}

async function readBody(req){
  const chunks=[];
  for await(const c of req) chunks.push(Buffer.from(c));
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text)return {};
  try{return JSON.parse(text);}catch(e){throw new Error('Invalid JSON body');}
}

async function postToGas(body){
  let target=GAS_URL;
  for(let i=0;i<3;i++){
    const r=await fetch(target,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/json; charset=utf-8','Accept':'application/json'},body:JSON.stringify(body)});
    if([301,302,303,307,308].includes(r.status)){
      const loc=r.headers.get('location');
      if(!loc)throw new Error('Apps Script redirect tidak memiliki Location header.');
      target=new URL(loc,target).toString();
      continue;
    }
    const text=await r.text();
    let payload=null;try{payload=text?JSON.parse(text):null;}catch(e){}
    if(!r.ok)throw new Error(payload?.error||('Apps Script HTTP '+r.status));
    return payload||{ok:true};
  }
  throw new Error('Terlalu banyak redirect dari Apps Script.');
}

module.exports=async function handler(req,res){
  try{
    if(req.method!=='POST')return json(res,405,{ok:false,error:'Method POST only'});
    const body=await readBody(req);
    const tripId=String(req.query?.tripId||body.tripId||'').trim();
    if(!tripId)return json(res,400,{ok:false,error:'tripId wajib diisi'});
    const lat=Number(body.latitude),lng=Number(body.longitude);
    if(!Number.isFinite(lat)||!Number.isFinite(lng)||lat<-90||lat>90||lng<-180||lng>180){
      return json(res,400,{ok:false,error:'Koordinat GPS tidak valid'});
    }
    const payload={...body,tripId,source:'native'};
    const result=await postToGas(payload);
    return json(res,200,{ok:true,result});
  }catch(err){
    console.error('[RH native-location]',err);
    return json(res,502,{ok:false,error:err?.message||String(err)});
  }
};
