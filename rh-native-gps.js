/* RH Habits native GPS bridge — Android + iOS. */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v5';
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

  function dispatch(location){
    if(location) window.dispatchEvent(new CustomEvent('rh-native-location',{detail:location}));
  }

  async function getPermissionState(){
    const bg=getPlugin();
    if(!bg) return null;
    try{return await bg.checkPermissions();}
    catch(e){console.warn('[RHNativeGPS] checkPermissions failed:',e);return null;}
  }

  function backgroundGranted(perm){
    const s=perm&&perm.backgroundLocation;
    return s==='granted'||s==='always';
  }

  async function requestPermissions(){
    const bg=getPlugin();
    if(!bg?.requestPermissions) return null;
    try{
      return await bg.requestPermissions({permissions:['location','backgroundLocation','notification']});
    }catch(e){console.warn('[RHNativeGPS] permission request failed:',e);return null;}
  }

  async function checkPermissions(){
    const perm=await getPermissionState();
    if(!perm)return null;
    if(!backgroundGranted(perm)){
      return Object.assign({},perm,{
        location:'denied',
        backgroundLocation:perm.backgroundLocation||'when_in_use'
      });
    }
    return perm;
  }

  async function start(id){
    const bg=getPlugin();
    if(!bg)throw new Error('Native GPS belum tersedia. Jalankan npx cap sync setelah plugin terpasang.');
    sessionId=id;
    const url=APP_ORIGIN+'/api/native-location?tripId='+encodeURIComponent(id);

    const perm=await getPermissionState();
    if(perm&&!backgroundGranted(perm)){
      throw new Error('Izin lokasi background belum aktif. Pilih Allow All the Time / Always di Pengaturan HP agar GPS tetap merekam saat layar dikunci.');
    }

    await bg.start({
      backgroundMessage:'RH Habits sedang merekam perjalanan. Ketuk notifikasi untuk kembali ke aplikasi.',
      backgroundTitle:'RH Habits • GPS aktif',
      requestPermissions:false,
      stale:false,
      distanceFilter:3,
      minIntervalMs:1000,
      url,
      headers:{'Content-Type':'application/json'},
      networkFallback:true
    },(location,error)=>{
      if(error){console.warn('[RHNativeGPS] native callback:',error);return;}
      if(location)dispatch(location);
    });
    return true;
  }

  async function stop(){
    const bg=getPlugin();
    try{if(bg)await bg.stop();}finally{sessionId=null;}
  }

  async function openSettings(){const bg=getPlugin();if(bg?.openSettings)return bg.openSettings();}
  function isNative(){return isNativePlatform();}
  function hasDisclosure(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function markDisclosure(){try{localStorage.setItem(KEY,'1');}catch(e){}}

  window.RHNativeGPS={start,stop,isNative,hasDisclosure,markDisclosure,checkPermissions,requestPermissions,openSettings,getSession:()=>sessionId};
})();