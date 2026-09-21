const GAS_URL='https://script.google.com/macros/s/AKfycbyi6yqLiKwjpoy9TclZycH6KOPi0GXlPHc7iHGAA5srKCV6TVWOlSyTr-1V-JOiwlr2MQ/exec';

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
async function forwardGet(fn,args){
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
module.exports=async function handler(req,res){
  try{
    cors(res);
    if(req.method==='OPTIONS'){res.statusCode=204;return res.end();}
    let body;
    if(req.method==='POST') body=await readBody(req);
    else if(req.method==='GET') body={fn:req.query?.fn,args:req.query?.args?JSON.parse(req.query.args):[]};
    else return json(res,405,{ok:false,error:'Method GET/POST only'});
    if(!body||!body.fn) return json(res,400,{ok:false,error:'fn wajib diisi'});
    return json(res,200,await forwardGet(body.fn,body.args));
  }catch(e){
    console.error('[RH rpc]',e);
    return json(res,502,{ok:false,error:e?.message||String(e)});
  }
};
