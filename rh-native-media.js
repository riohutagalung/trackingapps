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
  async function blobToBase64(blob){
    return await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onerror=()=>reject(new Error('Gagal membaca hasil foto native.'));
      reader.onload=()=>resolve(String(reader.result||'').split(',')[1]||'');
      reader.readAsDataURL(blob);
    });
  }
  async function resultToBase64(result){
    const thumb=String(result?.thumbnail||'');
    if(thumb) return thumb;
    const candidates=[result?.webPath,result?.uri].filter(Boolean).map(String);
    for(const url of candidates){
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(!response.ok) continue;
        const b64=await blobToBase64(await response.blob());
        if(b64) return b64;
      }catch(e){}
    }
    throw new Error('Camera tidak mengembalikan data gambar yang bisa dibaca.');
  }
  async function pick(source){
    const Camera=getCamera();
    if(!Camera) throw new Error('Camera native belum tersedia. Jalankan npx cap sync setelah plugin Camera terpasang.');
    let result;
    if(source==='camera'){
      if(typeof Camera.takePhoto!=='function') throw new Error('Camera API takePhoto tidak tersedia pada build ini.');
      result=await Camera.takePhoto({quality:82,targetWidth:1400,targetHeight:1400,includeMetadata:true});
    }else{
      if(typeof Camera.chooseFromGallery!=='function') throw new Error('Camera API chooseFromGallery tidak tersedia pada build ini.');
      const picked=await Camera.chooseFromGallery({quality:82,targetWidth:1400,targetHeight:1400,includeMetadata:true});
      result=picked?.results?.[0];
    }
    if(!result)throw new Error('Foto tidak dipilih.');
    const base64=await resultToBase64(result);
    const format=String(result.metadata?.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg';
    return {base64,format,dataUrl:`data:image/${format};base64,${base64}`,webPath:String(result.webPath||''),uri:String(result.uri||'')};
  }
  window.RHNativeMedia={isNative,pick};
})();