/* RH Habits native Camera/Photos bridge — Capacitor Camera 8.x compatible. */
(function(){
  'use strict';
  let camera=null;
  const isNative=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  function getCamera(){
    if(!isNative()) return null;
    if(camera)return camera;
    try{
      camera=window.Capacitor.Plugins?.Camera||null;
      if(!camera && window.Capacitor.registerPlugin) camera=window.Capacitor.registerPlugin('Camera');
    }catch(e){ console.warn('[RHNativeMedia] Camera bridge resolution failed',e); }
    return camera;
  }
  async function requestPermissionIfNeeded(Camera, type){
    try{
      if(typeof Camera.checkPermissions!=='function'||typeof Camera.requestPermissions!=='function')return;
      const p=await Camera.checkPermissions();
      const state=type==='camera'?p?.camera:p?.photos;
      if(state==='denied'||state==='prompt'){
        try{await Camera.requestPermissions({permissions:[type]});}catch(e){
          try{await Camera.requestPermissions();}catch(e2){}
        }
      }
    }catch(e){}
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
    if(thumb)return thumb;
    const candidates=[result?.webPath,result?.uri].filter(Boolean).map(String);
    for(const url of candidates){
      try{
        const response=await fetch(url,{cache:'no-store'});
        if(!response.ok)continue;
        const b64=await blobToBase64(await response.blob());
        if(b64)return b64;
      }catch(e){}
    }
    throw new Error('Camera tidak mengembalikan data gambar yang bisa dibaca.');
  }
  async function legacyPick(Camera,source){
    if(typeof Camera.getPhoto!=='function')throw new Error('Camera legacy API tidak tersedia.');
    const photo=await Camera.getPhoto({
      quality:90,
      source:source==='camera'?'CAMERA':'PHOTOS',
      resultType:'base64',
      correctOrientation:true,
      width:1400,
      height:1400,
      allowEditing:false
    });
    if(!photo)throw new Error('Foto tidak dipilih.');
    const base64=String(photo.base64String||'');
    if(!base64)throw new Error('Camera legacy tidak mengembalikan base64.');
    return {
      base64,
      format:String(photo.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg',
      dataUrl:String(photo.dataUrl||''),
      webPath:String(photo.webPath||''),
      uri:String(photo.path||'')
    };
  }
  async function modernPick(Camera,source){
    if(source==='camera'){
      if(typeof Camera.takePhoto!=='function')throw new Error('Camera API takePhoto tidak tersedia.');
      const result=await Camera.takePhoto({
        quality:90,
        targetWidth:1400,
        targetHeight:1400,
        correctOrientation:true,
        encodingType:0,
        saveToGallery:false,
        cameraDirection:'REAR',
        includeMetadata:true
      });
      if(!result)throw new Error('Foto tidak dipilih.');
      const base64=await resultToBase64(result);
      return {
        base64,
        format:String(result.metadata?.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg',
        dataUrl:'data:image/jpeg;base64,'+base64,
        webPath:String(result.webPath||''),
        uri:String(result.uri||'')
      };
    }
    if(typeof Camera.chooseFromGallery!=='function')throw new Error('Camera API chooseFromGallery tidak tersedia.');
    const picked=await Camera.chooseFromGallery({
      mediaType:0,
      allowMultipleSelection:false,
      quality:90,
      targetWidth:1400,
      targetHeight:1400,
      includeMetadata:true
    });
    const result=picked?.results?.[0];
    if(!result)throw new Error('Foto tidak dipilih.');
    const base64=await resultToBase64(result);
    return {
      base64,
      format:String(result.metadata?.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg',
      dataUrl:'data:image/jpeg;base64,'+base64,
      webPath:String(result.webPath||''),
      uri:String(result.uri||'')
    };
  }
  async function pick(source){
    const Camera=getCamera();
    if(!Camera)throw new Error('Camera native belum tersedia.');
    await requestPermissionIfNeeded(Camera,source==='camera'?'camera':'photos');

    // Primary path: deprecated but still supported in Camera 8.2.x, and unlike the
    // new API it can return full base64 directly — exactly what RH OCR needs.
    try{
      return await legacyPick(Camera,source);
    }catch(legacyError){
      console.warn('[RHNativeMedia] legacy Camera API failed',legacyError);
      try{
        return await modernPick(Camera,source);
      }catch(modernError){
        const code=String(modernError?.code||legacyError?.code||'');
        const msg=String(modernError?.message||legacyError?.message||'Gagal memilih foto.');
        throw new Error((code?'['+code+'] ':'')+msg);
      }
    }
  }
  window.RHNativeMedia={isNative,pick};
})();