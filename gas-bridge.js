/** RH Habits RPC bridge — browser + Capacitor use the same Vercel endpoint. */
(function(){
  'use strict';
  var RPC_URL='/api/rpc';
  var NATIVE_RPC_URL='https://rhhabits.vercel.app/api/rpc';
  function endpoint(){try{return window.Capacitor?.isNativePlatform?.()?NATIVE_RPC_URL:RPC_URL;}catch(e){return RPC_URL;}}
  function callRpc(fn,args,handlers){
    var controller=typeof AbortController!=='undefined'?new AbortController():null;
    var timeout=setTimeout(function(){if(controller)controller.abort();},30000);
    fetch(endpoint(),{method:'POST',credentials:'omit',cache:'no-store',signal:controller?controller.signal:undefined,headers:{'Accept':'application/json','Content-Type':'application/json'},body:JSON.stringify({fn:fn,args:Array.isArray(args)?args:[]})})
      .then(function(res){return res.text().then(function(text){var payload=null;try{payload=text?JSON.parse(text):null;}catch(e){} if(!res.ok)throw new Error(payload?.error||('HTTP '+res.status+' dari /api/rpc')); if(!payload)throw new Error('Respons RPC bukan JSON yang valid.'); return payload;});})
      .then(function(payload){if(payload?.ok){if(handlers.success)handlers.success(payload.result,handlers.userObject);}else{var e=new Error(payload?.error||'RPC gagal.');if(handlers.failure)handlers.failure(e,handlers.userObject);}})
      .catch(function(err){var msg=err?.name==='AbortError'?'Request timeout (30 detik).':(err?.message||String(err));if(handlers.failure)handlers.failure(new Error(msg),handlers.userObject);else console.error('[RH RPC] '+fn+': '+msg);})
      .finally(function(){clearTimeout(timeout);});
  }
  function makeRunner(handlers){return new Proxy(function(){},{get:function(_t,prop){if(prop==='withSuccessHandler')return function(cb){return makeRunner(Object.assign({},handlers,{success:cb}));};if(prop==='withFailureHandler')return function(cb){return makeRunner(Object.assign({},handlers,{failure:cb}));};if(prop==='withUserObject')return function(obj){return makeRunner(Object.assign({},handlers,{userObject:obj}));};return function(){callRpc(String(prop),Array.prototype.slice.call(arguments),handlers);};}});}
  window.google=window.google||{};window.google.script=window.google.script||{};window.google.script.run=makeRunner({});

  // Runtime fallback for pages that were built before the Weather module
  // was injected by scripts/repair-vercel.mjs. This is additive only.
  if(!window.Weather){
    window.Weather={
      refresh:function(force){
        var box=document.getElementById('weather-banner');
        var content=document.getElementById('weather-content');
        if(!box||!content)return;
        box.classList.add('show');
        content.textContent='Memeriksa prakiraan hujan...';
        window.google.script.run
          .withSuccessHandler(function(r){
            var s=r&&r.summary;
            if(!s){content.textContent='Prakiraan belum tersedia.';return;}
            var text=function(x){
              return String(Number(x&&x.probability||0))+'% kemungkinan hujan'+
                (x&&x.precipitation?' • '+Number(x.precipitation||0).toFixed(1)+' mm/jam':'');
            };
            content.textContent=[
              'Pagi 07:00 — '+text(s.morning||{}),
              'Sore 18:00 — '+text(s.evening||{})
            ].join('  |  ');
          })
          .withFailureHandler(function(){
            content.textContent='Cuaca tidak tersedia.';
          })
          .getCommuteWeather();
      }
    };
  }

  window.RHBridge={rpc:callRpc,endpoint:endpoint};
})();
