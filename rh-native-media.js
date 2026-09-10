/* RH Habits native camera/gallery bridge. */
(function(){
  'use strict';
  let camera=null;
  const isNative=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  function getCamera(){
    if(!isNative()) return null;
    if(!camera&&window.Capacitor.registerPlugin) camera=window.Capacitor.registerPlugin('Camera');
    return camera;
  }
  function dataUrlToBase64(v){const s=String(v||''),i=s.indexOf(',');return i>=0?s.slice(i+1):s;}
  async function pick(source){
    const Camera=getCamera(); if(!Camera) throw new Error('Camera native belum tersedia.');
    const result=await Camera.getPhoto({source:source==='camera'?'CAMERA':'PHOTOS',resultType:'dataUrl',quality:86,width:1600,height:1600,correctOrientation:true,allowEditing:false,saveToGallery:false,presentationStyle:'fullscreen'});
    const dataUrl=result&&result.dataUrl||'';
    return {dataUrl,base64:dataUrlToBase64(dataUrl),format:String(result&&result.format||'jpeg').toLowerCase()};
  }
  window.RHNativeMedia={isNative,pick};
})();
