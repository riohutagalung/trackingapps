/* RH Habits native GPS bridge.
 * Web/PWA mode keeps the existing navigator.geolocation fallback.
 * Native Android/iOS builds use @capgo/background-geolocation so tracking
 * continues while the WebView is backgrounded/locked.
 */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v1';
  const pluginReady=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  let plugin=null;
  let sessionId=null;

  function getPlugin(){
    if(!pluginReady()) return null;
    if(!plugin && window.Capacitor.registerPlugin) plugin=window.Capacitor.registerPlugin('BackgroundGeolocation');
    return plugin;
  }

  function dispatch(location){
    if(!location)return;
    window.dispatchEvent(new CustomEvent('rh-native-location',{detail:location}));
  }

  async function start(id){
    const bg=getPlugin();
    if(!bg)return false;
    sessionId=id;
    const url='https://rhhabits.vercel.app/api/native-location?tripId='+encodeURIComponent(id);
    await bg.start({
      backgroundMessage:'RH Habits sedang merekam perjalanan. Ketuk untuk kembali ke aplikasi.',
      backgroundTitle:'RH Habits • Tracking aktif',
      requestPermissions:true,
      stale:false,
      distanceFilter:10,
      minIntervalMs:5000,
      url:url,
      headers:{'Content-Type':'application/json'}
    },(location,error)=>{
      if(error){console.warn('[RHNativeGPS]',error);return;}
      dispatch(location);
    });
    return true;
  }

  async function stop(){
    const bg=getPlugin();
    if(!bg)return;
    try{await bg.stop();}finally{sessionId=null;}
  }

  function isNative(){return pluginReady();}
  function hasDisclosure(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function markDisclosure(){try{localStorage.setItem(KEY,'1');}catch(e){}}

  window.RHNativeGPS={start,stop,isNative,hasDisclosure,markDisclosure,getSession:()=>sessionId};
  console.log('[RH] Native GPS bridge loaded. Native:',pluginReady());
})();
