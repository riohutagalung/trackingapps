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

async function readBody(req){
  const chunks=[];
  for await(const c of req) chunks.push(Buffer.from(c));
  const text=Buffer.concat(chunks).toString('utf8');
  if(!text) return {};
  try { return JSON.parse(text); }
  catch(e){ throw new Error('Invalid JSON body'); }
}

async function forward(body){
  const r=await fetch(GAS_URL,{
    method:'POST',
    redirect:'follow',
    headers:{'Content-Type':'application/json; charset=utf-8','Accept':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const text=await r.text();
  let payload=null;
  try { payload=text?JSON.parse(text):null; } catch(e) {}
  if(!r.ok) throw new Error('Apps Script HTTP '+r.status+': '+(payload?.error||text?.slice(0,800)||('HTTP '+r.status)));
  if(!payload) throw new Error('Apps Script response bukan JSON: '+text.slice(0,300));
  return payload;
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
