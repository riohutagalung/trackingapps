import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

const file=path.resolve(process.argv[2]||'index.html');
if(!fs.existsSync(file))throw new Error('[RH] index.html not found: '+file);
let html=fs.readFileSync(file,'utf8');

// Only repair known source corruption. No business/GPS calculations are changed here.
html=html.replace(/\},\,/g,'},');
html=html.replace(/\n  \}\n  renderPublicTransport\(/g,'\n  },\n  renderPublicTransport(');
html=html.replace(/\n  \}\n  renderFuelPrediction\(/g,'\n  },\n  renderFuelPrediction(');
html=html.replace(/\n  \}\,\,\n/g,'\n  },\n');
html=html.replace(/<link\s+rel=["']manifest["']\s+href=["']\?manifest=1["']\s*\/?>/i,'<link rel="manifest" href="/manifest.json">');
// Ensure browsers/WebViews do not keep the pre-fix RPC bridge in cache.
html=html.replace(/gas-bridge\.js(?:\?v=\d+)?/g,'gas-bridge.js?v=20260921');
// Avoid the harmless browser warning about a password field outside a form.
if(/id=["']traffic-key["']/.test(html) && !/id=["']traffic-settings-form["']/.test(html)){
  html=html.replace(
    /(<div class="traffic-note">Masukkan API key Google Routes API[\\s\\S]*?<\/div>)([\\s\\S]*?)(<\/div>\\s*<div class="card">\\s*<div class="card-head"><div><div class="eyebrow">Komparasi)/i,
    '$1<form id="traffic-settings-form" onsubmit="return false;">$2</form>$3'
  );
}

// App.init() uses Weather.refresh(). Keep a real client module in the Vercel/native app.
// It calls the existing Apps Script RPC; it does not fabricate weather data.
if(!/\bconst\s+Weather\s*=/.test(html)){
  const weatherCode=[
    'const Weather = {',
    '  refresh(force) {',
    "    const box=document.getElementById('weather-banner');",
    "    const content=document.getElementById('weather-content');",
    '    if(!box||!content)return;',
    "    box.classList.add('show');",
    "    content.textContent='Memeriksa prakiraan hujan...';",
    '    google.script.run.withSuccessHandler(r=>{',
    '      const s=r&&r.summary;',
    "      if(!s){content.textContent='Prakiraan belum tersedia.';return;}",
    "      const text=x=>String(Number(x?.probability||0))+'% kemungkinan hujan'+(x?.precipitation?' • '+Num(x.precipitation,1)+' mm/jam':'');",
    "      content.innerHTML='<div class=\"route-list\">'+['morning','evening'].map((k,i)=>{const x=s[k]||{};const label=i===0?'Pagi 07:00':'Sore 18:00';return '<div class=\"route-row\"><div><div class=\"route-name\">'+Icon(x.caution?'rain':'sun',15)+' '+label+'</div><div class=\"route-sub\">'+text(x)+'</div></div></div>';}).join('')+'</div>';",
    '      if((s.morning&&s.morning.caution)||(s.evening&&s.evening.caution))App.toast(\'Ada potensi hujan di jam commute.\');',
    '    }).withFailureHandler(()=>{content.textContent=\'Cuaca tidak tersedia.\';}).getCommuteWeather();',
    '  }',
    '};',
    ''
  ].join('\n');
  const marker=/<script[^>]*>\s*const\s+Icon\s*=/i;
  if(marker.test(html))html=html.replace(marker,'<script>'+weatherCode+'const Icon=');
  else html=html.replace(/<\/body>/i,'<script>'+weatherCode+'</script>\n</body>');
}

const scriptRe=/<script(?:[^>]*)>([\s\S]*?)<\/script>/gi;
let match,count=0;
while((match=scriptRe.exec(html))){
  const code=match[1];
  if(!code.trim()){count++;continue;}
  const tmp=path.join(os.tmpdir(),'rh-index-'+process.pid+'-'+count+'.js');
  fs.writeFileSync(tmp,code);
  const result=spawnSync(process.execPath,['--check',tmp],{encoding:'utf8'});
  try{fs.unlinkSync(tmp);}catch(_){ }
  if(result.status!==0)throw new Error('[RH] inline script #'+count+' invalid:\n'+(result.stderr||result.stdout));
  count++;
}
if(!/\bconst\s+App\s*=/.test(html))throw new Error('[RH] App module missing from index.html.');
if(!/\bconst\s+GPS\s*=/.test(html))throw new Error('[RH] GPS module missing from index.html.');
if(!/\bconst\s+Weather\s*=/.test(html))throw new Error('[RH] Weather module missing from index.html.');

fs.writeFileSync(file,html);
console.log('[RH] index.html validated: '+count+' script blocks.');
