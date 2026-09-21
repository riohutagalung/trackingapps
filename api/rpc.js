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
    let detail='';
    if(parsed&&parsed.error) detail=': '+String(parsed.error).slice(0,500);
    else if(res.status===404) detail=': deployment Web App /exec tidak ditemukan atau URL deployment tidak sesuai';
    else if(res.status===401||res.status===403) detail=': akses Web App ditolak, cek Execute as / Who has access';
    else if(res.status===405) detail=': endpoint Apps Script menolak method/URL. Pastikan deployment URL yang dipakai adalah URL deployment terbaru.';
    else if(text) detail=': '+text.slice(0,500);
    throw new Error('Apps Script HTTP '+res.status+detail);
  }
  if(!parsed||typeof parsed!=='object') throw new Error('Apps Script mengembalikan respons bukan JSON.');
  return parsed;
}
async function forward(body){
  let target=GAS_URL;
  let method='POST';
  const payload=JSON.stringify(body);
  for(let i=0;i<7;i++){
    const r=await fetch(target,{
      method,
      redirect:'manual',
      headers:{'Accept':'application/json','Content-Type':'application/json; charset=utf-8'},
      body:method==='GET'?undefined:payload,
      cache:'no-store'
    });
    if([301,302,303].includes(r.status)){
      const loc=r.headers.get('location');
      if(!loc) throw new Error('Apps Script redirect tanpa Location.');
      target=new URL(loc,target).toString();
      method='GET';
      continue;
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