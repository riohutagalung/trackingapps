/* RH Habits native GPS bridge — Android + iOS. */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v4';
  const APP_ORIGIN='https://rhhabits.vercel.app';
  const isNativePlatform=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  let plugin=null,sessionId=null;
  function getPlugin(){
    if(!isNativePlatform()) return null;
    if(plugin) return plugin;
    try{
      if(window.Capacitor.Plugins?.BackgroundGeolocation) plugin=window.Capacitor.Plugins.BackgroundGeolocation;
      else if(window.Capacitor.registerPlugin) plugin=window.Capacitor.registerPlugin('BackgroundGeolocation');
    }catch(e){ console.warn('[RHNativeGPS] register failed',e); }
    return plugin;
  }
  function dispatch(location){ if(location) window.dispatchEvent(new CustomEvent('rh-native-location',{detail:location})); }
  async function start(id){
    const bg=getPlugin();
    if(!bg) throw new Error('Native GPS belum tersedia. Jalankan npx cap sync setelah plugin terpasang.');
    sessionId=id;
    const url=APP_ORIGIN+'/api/native-location?tripId='+encodeURIComponent(id);
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
      if(error){ console.warn('[RHNativeGPS]',error); return; }
      dispatch(location);
    });
    return true;
  }
  async function stop(){ const bg=getPlugin(); try{if(bg)await bg.stop();}finally{sessionId=null;} }
  async function checkPermissions(){ const bg=getPlugin(); if(bg?.checkPermissions)return bg.checkPermissions(); return null; }
  async function openSettings(){ const bg=getPlugin(); if(bg?.openSettings)return bg.openSettings(); }
  function isNative(){return isNativePlatform();}
  function hasDisclosure(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function markDisclosure(){try{localStorage.setItem(KEY,'1');}catch(e){}}
  window.RHNativeGPS={start,stop,isNative,hasDisclosure,markDisclosure,checkPermissions,openSettings,getSession:()=>sessionId};
})();
