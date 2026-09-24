/* RH Habits native GPS bridge — Android + iOS. */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v6';
  const APP_ORIGIN='https://rhhabits.vercel.app';
  const isNativePlatform=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  const platform=()=>{try{return window.Capacitor?.getPlatform?.()||'';}catch(e){return '';}};
  const isIOS=()=>platform()==='ios';
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
    if(isIOS()) return s==='granted'||s==='always';
    // Android 10+ exposes a distinct backgroundLocation state. Require it
    // whenever the plugin reports that state so lock-screen tracking is explicit.
    if(platform()==='android' && typeof s==='string') return s==='granted'||s==='always';
    return platform()!=='android';
  }

  async function requestPermissions(){
    const bg=getPlugin();
    if(!bg?.requestPermissions) return null;
    try{
      const perm=await bg.requestPermissions({
        permissions:['location','backgroundLocation','notification']
      });

      if(!backgroundGranted(perm)){
        return Object.assign({},perm,{
          location:perm?.location||'denied',
          backgroundLocation:perm?.backgroundLocation||'denied'
        });
      }
      return perm;
    }catch(e){
      console.warn('[RHNativeGPS] permission request failed:',e);
      return null;
    }
  }

  async function checkPermissions(){
    const perm=await getPermissionState();
    if(!perm)return null;
    if(!backgroundGranted(perm)){
      return Object.assign({},perm,{
        location:perm?.location||'denied',
        backgroundLocation:perm?.backgroundLocation||'denied'
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
    if(!backgroundGranted(perm)){
      const msg=isIOS()
        ? 'Izin Always/Background Location belum aktif. Pilih Allow Always di Pengaturan iPhone agar GPS tetap merekam saat layar dikunci.'
        : 'Izin lokasi di latar belakang belum aktif. Izinkan "Allow all the time" di Pengaturan Android agar GPS tetap merekam saat layar dikunci.';
      throw new Error(msg);
    }

    await bg.start({
      backgroundMessage:'RH Habits sedang merekam perjalanan. Ketuk notifikasi untuk kembali ke aplikasi.',
      backgroundTitle:'RH Habits • GPS aktif',
      requestPermissions:false,
      stale:false,
      backgroundLocation:true,
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