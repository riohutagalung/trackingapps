(function(){
  'use strict';
  let camera=null;
  const isNative=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  function getCamera(){
    if(!isNative()) return null;
    if(!camera){
      try{
        if(window.Capacitor.Plugins && window.Capacitor.Plugins.Camera) camera=window.Capacitor.Plugins.Camera;
        else if(window.Capacitor.registerPlugin) camera=window.Capacitor.registerPlugin('Camera');
      }catch(e){ console.warn('[RHNativeMedia] register failed',e); }
    }
    return camera;
  }
  function dataUrlToBase64(v){const s=String(v||''),i=s.indexOf(',');return i>=0?s.slice(i+1):s;}
  async function pick(source){
    const Camera=getCamera(); if(!Camera) throw new Error('Camera native belum tersedia.');
    const CameraSource=window.Capacitor?.Plugins?.Camera?.CameraSource || {CAMERA:'CAMERA',PHOTOS:'PHOTOS'};
    const result=await Camera.getPhoto({
      source:source==='camera'?(CameraSource.CAMERA||'CAMERA'):(CameraSource.PHOTOS||'PHOTOS'),
      resultType:'dataUrl',quality:86,width:1600,height:1600,correctOrientation:true,allowEditing:false,saveToGallery:false,presentationStyle:'fullscreen'
    });
    const dataUrl=result&&result.dataUrl||'';
    return {dataUrl,base64:dataUrlToBase64(dataUrl),format:String(result&&result.format||'jpeg').toLowerCase()};
  }
  window.RHNativeMedia={isNative,pick};
})();
