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
    if(typeof Camera.getPhoto!=='function')throw new Error('Legacy Camera API tidak tersedia.');
    const photo=await Camera.getPhoto({
      quality:82,
      source:source==='camera'?'CAMERA':'PHOTOS',
      resultType:'base64',
      correctOrientation:true,
      width:1400,
      height:1400
    });
    if(!photo)throw new Error('Foto tidak dipilih.');
    const base64=String(photo.base64String||'');
    if(!base64)throw new Error('Legacy Camera tidak mengembalikan base64.');
    return {
      base64,
      format:String(photo.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg',
      dataUrl:String(photo.dataUrl||''),
      webPath:String(photo.webPath||''),
      uri:String(photo.path||'')
    };
  }
  async function pick(source){
    const Camera=getCamera();
    if(!Camera)throw new Error('Camera native belum tersedia.');
    if(source==='camera')await requestPermissionIfNeeded(Camera,'camera');
    else if(source==='gallery')await requestPermissionIfNeeded(Camera,'photos');

    try{
      if(source==='camera'){
        if(typeof Camera.takePhoto!=='function')throw new Error('Camera API takePhoto tidak tersedia.');
        const result=await Camera.takePhoto({
          quality:82,targetWidth:1400,targetHeight:1400,
          encodingType:'JPEG',correctOrientation:true,includeMetadata:true
        });
        if(!result)throw new Error('Foto tidak dipilih.');
        const base64=await resultToBase64(result);
        return {
          base64,
          format:String(result.metadata?.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg',
          dataUrl:`data:image/jpeg;base64,${base64}`,
          webPath:String(result.webPath||''),
          uri:String(result.uri||'')
        };
      }
      if(typeof Camera.chooseFromGallery!=='function')throw new Error('Camera API chooseFromGallery tidak tersedia.');
      const picked=await Camera.chooseFromGallery({
        mediaType:0,allowMultipleSelection:false,quality:82,
        targetWidth:1400,targetHeight:1400,includeMetadata:true,
        encodingType:'JPEG',correctOrientation:true
      });
      const result=picked?.results?.[0];
      if(!result)throw new Error('Foto tidak dipilih.');
      const base64=await resultToBase64(result);
      return {
        base64,
        format:String(result.metadata?.format||'jpeg').toLowerCase().replace(/[^a-z]/g,'')||'jpeg',
        dataUrl:`data:image/jpeg;base64,${base64}`,
        webPath:String(result.webPath||''),
        uri:String(result.uri||'')
      };
    }catch(e){
      const code=String(e?.code||'');
      console.warn('[RHNativeMedia] new API failed',code,e);
      if(source==='gallery' && /OS-PLUG-CAMR-0003|OS-PLUG-CAMR-0005|OS-PLUG-CAMR-0018|OS-PLUG-CAMR-0020|OS-PLUG-CAMR-0028/.test(code)){
        await requestPermissionIfNeeded(Camera,'photos');
      }
      try{return await legacyPick(Camera,source);}
      catch(legacyError){
        const detail=legacyError?.code?('['+legacyError.code+'] '):'';
        throw new Error(detail+String(legacyError?.message||e?.message||e||'Gagal memilih foto.'));
      }
    }
  }
  window.RHNativeMedia={isNative,pick};
})();