/* RH Habits native GPS bridge.
 * Android uses RHTrackingPlugin + RHTrackingService:
 * GNSS/Fused Location -> foreground service -> SQLite -> batch/retry -> Vercel -> Apps Script.
 * iOS keeps the existing Capgo native location path.
 */
(function(){
  'use strict';
  const KEY='rh_native_location_disclosure_v7';
  const APP_ORIGIN='https://rhhabits.vercel.app';
  const isNativePlatform=()=>!!(window.Capacitor&&typeof window.Capacitor.isNativePlatform==='function'&&window.Capacitor.isNativePlatform());
  const platform=()=>{try{return window.Capacitor?.getPlatform?.()||'';}catch(e){return '';}};
  const isIOS=()=>platform()==='ios';
  const isAndroid=()=>platform()==='android';
  let capgo=null, rhTracking=null, sessionId=null, androidListener=null;

  function getCapgo(){
    if(!isNativePlatform()) return null;
    if(capgo) return capgo;
    try{
      if(window.Capacitor.Plugins?.BackgroundGeolocation) capgo=window.Capacitor.Plugins.BackgroundGeolocation;
      else if(window.Capacitor.registerPlugin) capgo=window.Capacitor.registerPlugin('BackgroundGeolocation');
    }catch(e){ console.warn('[RHNativeGPS] Capgo register failed',e); }
    return capgo;
  }

  function getAndroidTracking(){
    if(!isAndroid()||!isNativePlatform()) return null;
    if(rhTracking) return rhTracking;
    try{
      if(window.Capacitor.Plugins?.RHTracking) rhTracking=window.Capacitor.Plugins.RHTracking;
      else if(window.Capacitor.registerPlugin) rhTracking=window.Capacitor.registerPlugin('RHTracking');
    }catch(e){ console.warn('[RHNativeGPS] RHTracking register failed',e); }
    if(rhTracking&&!androidListener&&typeof rhTracking.addListener==='function'){
      androidListener=rhTracking.addListener('location',location=>{
        if(location) dispatch(location);
      });
    }
    return rhTracking;
  }

  function dispatch(location){
    if(location) window.dispatchEvent(new CustomEvent('rh-native-location',{detail:location}));
  }

  async function getPermissionState(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(!native?.getPermissionStatus) return null;
      try{return await native.getPermissionStatus();}
      catch(e){console.warn('[RHNativeGPS] Android permission status failed:',e);return null;}
    }
    const bg=getCapgo();
    if(!bg) return null;
    try{return await bg.checkPermissions();}
    catch(e){console.warn('[RHNativeGPS] checkPermissions failed:',e);return null;}
  }

  async function requestPermissions(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(!native?.requestPermissions || !native?.getPermissionStatus) return null;
      try{
        let status=await native.getPermissionStatus();
        if(!status?.preciseLocation){
          try{await native.requestPermissions({permissions:['location']});}catch(e){}
        }
        status=await native.getPermissionStatus();
        if(status?.preciseLocation && status?.notification!=='granted'){
          try{await native.requestPermissions({permissions:['notification']});}catch(e){}
        }
        status=await native.getPermissionStatus();
        // Android 10 still offers the system-level Allow all the time choice.
        // Android 11+ must be sent to App info > Permissions > Location instead.
        if(Number(status?.sdkInt)===29 && status?.preciseLocation && status?.backgroundLocation!=='granted'){
          try{await native.requestPermissions({permissions:['backgroundLocation']});}catch(e){}
        }
        return await native.getPermissionStatus();
      }catch(e){
        console.warn('[RHNativeGPS] Android permission request failed:',e);
        return await getPermissionState();
      }
    }
    const bg=getCapgo();
    if(!bg?.requestPermissions) return null;
    try{return await bg.requestPermissions({permissions:['location','backgroundLocation','notification']});}
    catch(e){console.warn('[RHNativeGPS] permission request failed:',e);return null;}
  }

  async function checkPermissions(){ return getPermissionState(); }

  function hasDisclosure(){try{return localStorage.getItem(KEY)==='1';}catch(e){return false;}}
  function markDisclosure(){try{localStorage.setItem(KEY,'1');}catch(e){}}

  async function start(id){
    sessionId=id;
    if(isAndroid()){
      const native=getAndroidTracking();
      if(!native?.start)throw new Error('RHTracking native module belum tersedia. Jalankan npx cap sync android lalu build ulang APK.');
      await native.start({tripId:String(id),endpoint:APP_ORIGIN+'/api/native-location'});
      return true;
    }

    const bg=getCapgo();
    if(!bg)throw new Error('Native GPS belum tersedia.');
    const perm=await getPermissionState();
    if(isIOS() && perm && perm.backgroundLocation && !['granted','always'].includes(perm.backgroundLocation)){
      throw new Error('Izin Always/Background Location belum aktif. Pilih Allow Always di Pengaturan iPhone agar GPS tetap merekam saat layar dikunci.');
    }
    await bg.start({
      backgroundMessage:'RH Habits sedang merekam perjalanan. Ketuk notifikasi untuk kembali ke aplikasi.',
      backgroundTitle:'RH Habits • GPS aktif',
      requestPermissions:false,
      stale:false,
      distanceFilter:3,
      minIntervalMs:1000,
      url:APP_ORIGIN+'/api/native-location?tripId='+encodeURIComponent(id),
      headers:{'Content-Type':'application/json'},
      networkFallback:true
    },(location,error)=>{
      if(error){console.warn('[RHNativeGPS] native callback:',error);return;}
      if(location)dispatch(location);
    });
    return true;
  }

  async function stop(){
    if(isAndroid()){
      const native=getAndroidTracking();
      try{if(native?.stop)await native.stop();}finally{sessionId=null;}
      return;
    }
    const bg=getCapgo();
    try{if(bg)await bg.stop();}finally{sessionId=null;}
  }

  async function getPoints(tripId){
    if(!isAndroid()) return [];
    const native=getAndroidTracking(); if(!native?.getPoints)return [];
    const result=await native.getPoints({tripId:String(tripId||'')});
    return Array.isArray(result?.points)?result.points:[];
  }

  async function sync(){
    if(isAndroid()){
      const native=getAndroidTracking(); if(!native?.sync)return {ok:false,remaining:0,tripIds:[]};
      return await native.sync({endpoint:APP_ORIGIN+'/api/native-location'});
    }
    return {ok:true,remaining:0,tripIds:[]};
  }

  async function clearTrip(tripId){
    if(isAndroid()){
      const native=getAndroidTracking(); if(native?.clearTrip)await native.clearTrip({tripId:String(tripId||'')});
    }
  }

  async function getActiveSession(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(native?.getActiveSession)return await native.getActiveSession();
    }
    return {running:false,tripId:'',startTime:0};
  }

  async function getStatus(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(native?.getStatus)return await native.getStatus();
    }
    return {running:false,tripId:'',pending:0};
  }

  async function openSettings(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(native?.openSettings)return native.openSettings();
    }
    const bg=getCapgo();
    if(bg?.openSettings)return bg.openSettings();
  }

  async function openBackgroundLocationSettings(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(native?.openBackgroundLocationSettings)return native.openBackgroundLocationSettings();
      return openSettings();
    }
    return openSettings();
  }

  async function openLocationSettings(){
    if(isAndroid()){
      const native=getAndroidTracking();
      if(native?.openLocationSettings)return native.openLocationSettings();
      return openSettings();
    }
    return openSettings();
  }

  function isNative(){return isNativePlatform();}

  window.RHNativeGPS={
    start,stop,isNative,hasDisclosure,markDisclosure,checkPermissions,requestPermissions,
    openSettings,openBackgroundLocationSettings,openLocationSettings,getSession:()=>sessionId,getPoints,sync,clearTrip,getActiveSession,getStatus
  };
})();
