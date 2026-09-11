/* RH Habits native Camera/Photos bridge — Capacitor Camera 8.2.x API. */
(function(){
  'use strict';
  let camera=null;
  const isNative=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  function getCamera(){
    if(!isNative()) return null;
    if(camera)return camera;
    try{
      if(window.Capacitor.Plugins?.Camera) camera=window.Capacitor.Plugins.Camera;
      else if(window.Capacitor.registerPlugin) camera=window.Capacitor.registerPlugin('Camera');
    }catch(e){ console.warn('[RHNativeMedia] register failed',e); }
    return camera;
  }
  async function pick(source){
    const Camera=getCamera();
    if(!Camera) throw new Error('Camera native belum tersedia. Jalankan npx cap sync setelah plugin Camera terpasang.');
    let result;
    if(source==='camera'){
      if(typeof Camera.takePhoto!=='function') throw new Error('Camera API takePhoto tidak tersedia pada build ini.');
      result=await Camera.takePhoto({quality:88,targetWidth:1600,targetHeight:1600,includeMetadata:true});
    }else{
      if(typeof Camera.chooseFromGallery!=='function') throw new Error('Camera API chooseFromGallery tidak tersedia pada build ini.');
      const picked=await Camera.chooseFromGallery({quality:88,includeMetadata:true});
      result=picked?.results?.[0];
    }
    if(!result)throw new Error('Foto tidak dipilih.');
    const base64=String(result.thumbnail||'');
    if(!base64)throw new Error('Camera tidak mengembalikan thumbnail/base64 untuk OCR.');
    const format=String(result.metadata?.format||'jpeg').toLowerCase();
    return {base64,format,dataUrl:`data:image/${format};base64,${base64}`};
  }
  window.RHNativeMedia={isNative,pick};
})();
