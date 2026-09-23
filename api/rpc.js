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
function jakartaDateString(date){
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).format(date||new Date());
}
function previousMonthStart(today){
  const [y,m]=String(today).split('-').map(Number);
  const d=new Date(Date.UTC(y||1970,(m||1)-2,1));
  return d.getUTCFullYear()+'-'+String(d.getUTCMonth()+1).padStart(2,'0')+'-01';
}
function overlayAuthoritativeExpenseTotals(bootstrapPayload, historyPayload){
  if(!bootstrapPayload || bootstrapPayload.ok!==true || !bootstrapPayload.result?.dashboard) return bootstrapPayload;
  if(!historyPayload || historyPayload.ok!==true || !Array.isArray(historyPayload.result)) return bootstrapPayload;
  const today=jakartaDateString(new Date());
  const from=previousMonthStart(today);
  const month=today.slice(0,7), prev=from.slice(0,7);
  const startWeek=new Date(Date.UTC(...today.split('-').map((v,i)=>i===1?Number(v)-1:Number(v))));
  startWeek.setUTCDate(startWeek.getUTCDate()-7);
  const week=startWeek.getUTCFullYear()+'-'+String(startWeek.getUTCMonth()+1).padStart(2,'0')+'-'+String(startWeek.getUTCDate()).padStart(2,'0');

  const totals={today:0,week:0,month:0,prevMonth:0};
  const cats={}, trend={[prev]:0,[month]:0};
  const rows=historyPayload.result.filter(e=>e && e.date);
  rows.forEach(e=>{
    const d=String(e.date).slice(0,10), amount=Number(e.amount||0);
    if(!Number.isFinite(amount))return;
    if(d===today)totals.today+=amount;
    if(d>=week&&d<=today)totals.week+=amount;
    if(d.slice(0,7)===month){
      totals.month+=amount;
      const cat=String(e.category||'Lainnya')||'Lainnya';
      cats[cat]=(cats[cat]||0)+amount;
      trend[month]=(trend[month]||0)+amount;
    }
    if(d.slice(0,7)===prev){
      totals.prevMonth+=amount;
      trend[prev]=(trend[prev]||0)+amount;
    }
  });

  const d=bootstrapPayload.result.dashboard;
  d.today=totals.today;
  d.week=totals.week;
  d.month=totals.month;
  d.prevMonth=totals.prevMonth;
  d.cats=cats;
  d.monthTrend=[{month:prev,total:trend[prev]||0},{month:month,total:trend[month]||0}];
  d.monthChangePct=totals.prevMonth?((totals.month-totals.prevMonth)/totals.prevMonth)*100:null;
  d.monthFuel=rows.filter(e=>String(e.date||'').slice(0,7)===month&&String(e.category||'')==='Bensin')
    .reduce((sum,e)=>sum+Number(e.amount||0),0);
  d.monthFuelLiters=rows.filter(e=>String(e.date||'').slice(0,7)===month&&String(e.category||'')==='Bensin')
    .reduce((sum,e)=>sum+Number(e.liters||0),0);
  d.recent=rows.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))).slice(0,5);
  d._expenseAggregateAuthoritative=true;
  d._expenseAggregateFrom=from;
  d._expenseAggregateTo=today;
  return bootstrapPayload;
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
  if(fn==='getBootstrap'){
    const bootstrap=await invokeGet(fn,args);
    if(bootstrap && bootstrap.ok!==false){
      try{
        const today=jakartaDateString(new Date());
        const from=previousMonthStart(today);
        const history=await invokeGet('getExpenseHistory',[{from:from,to:today}]);
        return overlayAuthoritativeExpenseTotals(bootstrap,history);
      }catch(e){
        // Keep the fast bootstrap response if the authoritative aggregation
        // cannot be fetched; the UI has its own compatibility fallback.
        console.warn('[RH rpc] authoritative expense overlay:',e);
      }
    }
    return bootstrap;
  }
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
