/* RH Habits native GPS bridge. Web/PWA falls back to navigator.geolocation. */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v3';
  const isNativePlatform=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  let plugin=null, sessionId=null;
  function getPlugin(){
    if(!isNativePlatform()) return null;
    if(!plugin){
      try{
        if(window.Capacitor.Plugins && window.Capacitor.Plugins.BackgroundGeolocation){
          plugin=window.Capacitor.Plugins.BackgroundGeolocation;
        } else if(window.Capacitor.registerPlugin){
          plugin=window.Capacitor.registerPlugin('BackgroundGeolocation');
        }
      }catch(e){ console.warn('[RHNativeGPS] register failed',e); }
    }
    return plugin;
  }
  function dispatch(location){ if(location) window.dispatchEvent(new CustomEvent('rh-native-location',{detail:location})); }
  async function start(id){
    const bg=getPlugin();
    if(!bg) throw new Error('Native GPS belum tersedia. Pastikan plugin BackgroundGeolocation terpasang dan npx cap sync sudah dijalankan.');
    sessionId=id;
    const url='https://rhhabits.vercel.app/api/native-location?tripId='+encodeURIComponent(id);
    await bg.start({
      backgroundMessage:'RH Habits sedang merekam perjalanan. Ketuk untuk kembali ke aplikasi.',
      backgroundTitle:'RH Habits • Tracking aktif',
      requestPermissions:true,
      stale:false,
      distanceFilter:10,
      minIntervalMs:5000,
      url,
      headers:{'Content-Type':'application/json'}
    },(location,error)=>{
      if(error){ console.warn('[RHNativeGPS]',error); return; }
      dispatch(location);
    });
    return true;
  }
  async function stop(){ const bg=getPlugin(); if(!bg){sessionId=null;return;} try{await bg.stop();}finally{sessionId=null;} }
  function isNative(){return isNativePlatform();}
  function hasDisclosure(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function markDisclosure(){try{localStorage.setItem(KEY,'1');}catch(e){}}
  window.RHNativeGPS={start,stop,isNative,hasDisclosure,markDisclosure,getSession:()=>sessionId};
})();
