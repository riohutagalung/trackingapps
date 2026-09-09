/* RH Habits native media bridge.
 * Native Android/iOS: use Capacitor Camera for both Camera + Photos.
 * Web/PWA: index.html keeps the normal <input type=file> fallback.
 */
(function(){
  'use strict';
  let camera = null;
  function isNative(){
    return !!(window.Capacitor && typeof window.Capacitor.isNativePlatform === 'function' && window.Capacitor.isNativePlatform());
  }
  function getCamera(){
    if(!isNative()) return null;
    if(!camera && window.Capacitor && typeof window.Capacitor.registerPlugin === 'function') camera=window.Capacitor.registerPlugin('Camera');
    return camera;
  }
  function dataUrlToBase64(dataUrl){const s=String(dataUrl||''),i=s.indexOf(',');return i>=0?s.slice(i+1):s;}
  async function pick(source){
    const Camera=getCamera(); if(!Camera) return null;
    const result=await Camera.getPhoto({source:source==='camera'?'CAMERA':'PHOTOS',resultType:'dataUrl',quality:88,width:1600,height:1600,correctOrientation:true,allowEditing:false,saveToGallery:false});
    return {dataUrl:result&&result.dataUrl?result.dataUrl:'',base64:dataUrlToBase64(result&&result.dataUrl?result.dataUrl:''),format:String(result&&result.format||'jpeg').toLowerCase()};
  }
  window.RHNativeMedia={isNative,pick};
})();
