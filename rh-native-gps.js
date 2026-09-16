/* RH Habits native GPS bridge — Android + iOS. */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v4';
  const APP_ORIGIN='https://rhhabits.vercel.app';
  const isNativePlatform=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  let plugin=null,sessionId=null,webWatch=null;

  function getPlugin(){
    if(!isNativePlatform()) return null;
    if(plugin) return plugin;
    try{
      if(window.Capacitor.Plugins?.BackgroundGeolocation) plugin=window.Capacitor.Plugins.BackgroundGeolocation;
      else if(window.Capacitor.registerPlugin) plugin=window.Capacitor.registerPlugin('BackgroundGeolocation');
    }catch(e){ console.warn('[RHNativeGPS] register failed',e); }
    return plugin;
  }

  function dispatch(location){
    if(location) window.dispatchEvent(new CustomEvent('rh-native-location',{detail:location}));
  }

  function startForegroundFallback(){
    if(webWatch!==null || !navigator.geolocation) return;
    try{
      webWatch=navigator.geolocation.watchPosition(p=>{
        const c=p&&p.coords;
        if(!c) return;
        // Normalize WebView geolocation into the same Location shape used by
        // @capgo/background-geolocation. Speed remains m/s here; GPS.position()
        // performs the single m/s -> km/h conversion.
        dispatch({
          latitude:c.latitude,
          longitude:c.longitude,
          accuracy:c.accuracy,
          altitude:c.altitude,
          bearing:c.heading,
          speed:c.speed,
          time:p.timestamp,
          simulated:false,
          source:'native-foreground-fallback'
        });
      },e=>console.warn('[RHNativeGPS] foreground fallback:',e),{
        enableHighAccuracy:true,
        maximumAge:0,
        timeout:20000
      });
    }catch(e){
      console.warn('[RHNativeGPS] foreground fallback unavailable:',e);
    }
  }

  function stopForegroundFallback(){
    if(webWatch!==null && navigator.geolocation){
      try{navigator.geolocation.clearWatch(webWatch);}catch(e){}
    }
    webWatch=null;
  }

  async function start(id){
    const bg=getPlugin();
    if(!bg) throw new Error('Native GPS belum tersedia. Jalankan npx cap sync setelah plugin terpasang.');
    sessionId=id;
    const url=APP_ORIGIN+'/api/native-location?tripId='+encodeURIComponent(id);

    // Foreground fallback makes the live speed/distance UI independent from
    // whether the native plugin callback is exposed to the WebView. The native
    // plugin remains the source for background/locked-screen delivery.
    startForegroundFallback();

    await bg.start({
      backgroundMessage:'RH Habits sedang merekam perjalanan. Ketuk untuk kembali ke aplikasi.',
      backgroundTitle:'RH Habits • GPS aktif',
      requestPermissions:true,
      stale:false,
      distanceFilter:5,
      minIntervalMs:3000,
      url,
      headers:{'Content-Type':'application/json'}
    },(location,error)=>{
      if(error){ console.warn('[RHNativeGPS] native callback:',error); return; }
      if(location) dispatch(location);
    });
    return true;
  }

  async function stop(){
    const bg=getPlugin();
    stopForegroundFallback();
    try{if(bg)await bg.stop();}finally{sessionId=null;}
  }

  async function checkPermissions(){ const bg=getPlugin(); if(bg?.checkPermissions)return bg.checkPermissions(); return null; }
  async function openSettings(){ const bg=getPlugin(); if(bg?.openSettings)return bg.openSettings(); }
  function isNative(){return isNativePlatform();}
  function hasDisclosure(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function markDisclosure(){try{localStorage.setItem(KEY,'1');}catch(e){}}
  window.RHNativeGPS={start,stop,isNative,hasDisclosure,markDisclosure,checkPermissions,openSettings,getSession:()=>sessionId};
})();
