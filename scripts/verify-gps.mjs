import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
function read(relative) {
  return fs.readFileSync(path.join(root, relative), 'utf8');
}
function assert(condition, message) {
  if (!condition) throw new Error('[GPS VERIFY] FAIL: ' + message);
}
function approx(actual, expected, tolerance) {
  return Math.abs(actual - expected) <= tolerance;
}
function Haversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
  const z = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(z), Math.sqrt(1 - z));
}
const html = read('index.html');
const start = html.indexOf('const RH_GPS_CFG = Object.freeze({');
const end = html.indexOf('const GPS = {', start);
assert(start >= 0 && end > start, 'GPS filtering block exists in index.html');
const logic = html.slice(start, end);
const gps = new Function('Haversine', logic + '; return {RHGpsTimeMs, RHNormalizeGpsPoints, RHFilterGpsTrack, RHComputeGpsMetrics};')(Haversine);

function points(offsets, options = {}) {
  const lat0 = -6.25, lng0 = 106.75;
  const longitudeScale = 111320 * Math.cos(lat0 * Math.PI / 180);
  return offsets.map((offset, index) => ({
    lat: lat0,
    lng: lng0 + offset / longitudeScale,
    time: 1700000000000 + index * (options.intervalMs || 1000),
    accuracy: options.accuracy ?? 5,
    source: options.source || 'browser',
    ...(Number.isFinite(options.speedKmh) ? {speedKmh: options.speedKmh} : {}),
    ...(Number.isFinite(options.providerSpeedKmh) ? {providerSpeedKmh: options.providerSpeedKmh} : {}),
    ...(Number.isFinite(options.speedAccuracyMps) ? {speedAccuracyMps: options.speedAccuracyMps} : {})
  }));
}
function metrics(input, startOffsetMs = 0) {
  return gps.RHComputeGpsMetrics(input, input[0].time - startOffsetMs, input.at(-1).time, 'Motor');
}
function checkStationary(name, input) {
  const m = metrics(input, 60000);
  assert(m.distanceKm === 0, name + ': stationary distance must stay at zero');
  assert(m.currentSpeedKmh === 0, name + ': stationary current speed must stay at zero');
  assert(m.avgSpeedKmh === 0, name + ': stationary average speed must stay at zero');
  assert(m.maxSpeedKmh === 0, name + ': stationary max speed must stay at zero');
  assert(m.movingTimeMin === 0, name + ': stationary moving time must stay at zero');
  assert(m.durationMin > 1, name + ': elapsed wall-clock duration must still advance');
  console.log('PASS', name);
}
checkStationary('stationary GPS jitter', points([0,2,-2,3,-1,4,2,1,5,3,6,4,2,0,3,2]));
checkStationary('single 20 m GPS drift then stationary', points([0,0,0,0,20,20,20.4,19.8,20.2,20.1,20.4,20,20.2,20.1,20.3,20.1]));
checkStationary('weak 0.7 km/h provider speed while stationary',
  points(Array(20).fill(0), {source:'native-android',accuracy:4,providerSpeedKmh:0.7,speedAccuracyMps:0.2}));

const providerMove = points(Array.from({length:30}, (_,i) => i * 6), {
  source:'native-android', accuracy:4, providerSpeedKmh:21.6, speedAccuracyMps:0.4
});
const pm = metrics(providerMove, 60000);
assert(pm.distanceKm > 0.15, 'provider-speed route distance must accrue');
assert(approx(pm.avgSpeedKmh,21.6,1.5), 'provider speed average must stay plausible');
assert(approx(pm.maxSpeedKmh,21.6,1.5), 'provider speed max must stay plausible');
assert(pm.movingTimeMin > 0, 'real movement must accumulate moving time');
console.log('PASS reliable Android/provider speed');

const coordinateMove = points(Array.from({length:30}, (_,i) => i * 4), {accuracy:5});
const cm = metrics(coordinateMove, 60000);
assert(cm.distanceKm > 0.08, 'coordinate-only route must accrue distance after confirmed movement');
assert(cm.maxSpeedKmh > 10 && cm.maxSpeedKmh < 20, 'coordinate-only speed must be in a plausible range');
assert(cm.movingTimeMin > 0, 'coordinate-only movement must accumulate moving time');
console.log('PASS coordinate-only movement fallback');

// Regression: native Android previously calculated a useful speedKmh fallback,
// but the frontend normalizer dropped it. Exercise the full production filter at
// road speeds without an OS provider-speed estimate.
const native60 = points(Array.from({length:35}, (_,i) => i * (60 / 3.6)), {
  source:'native-android', accuracy:4, speedKmh:60
});
const n60 = metrics(native60, 60000);
assert(n60.distanceKm > 0.45, 'native 60 km/h route distance must accrue');
assert(n60.avgSpeedKmh >= 50 && n60.avgSpeedKmh <= 70, 'native 60 km/h average must stay close to reality');
assert(n60.maxSpeedKmh >= 50 && n60.maxSpeedKmh <= 70, 'native 60 km/h maximum must not collapse to low 20s');
console.log('PASS native stored speed at 60 km/h');

const native100 = points(Array.from({length:35}, (_,i) => i * (100 / 3.6)), {
  source:'native-android', accuracy:4, speedKmh:100
});
const n100 = metrics(native100, 60000);
assert(n100.distanceKm > 0.8, 'native 100 km/h route distance must accrue');
assert(n100.avgSpeedKmh >= 85 && n100.avgSpeedKmh <= 115, 'native 100 km/h average must stay plausible');
assert(n100.maxSpeedKmh >= 85 && n100.maxSpeedKmh <= 115, 'native 100 km/h maximum must not be under-reported');
console.log('PASS native stored speed at 100 km/h');

const noStored60 = points(Array.from({length:35}, (_,i) => i * (60 / 3.6)), {
  source:'native-android', accuracy:4, speedKmh:0
});
const ns60 = metrics(noStored60, 60000);
assert(ns60.maxSpeedKmh >= 45 && ns60.maxSpeedKmh <= 75, 'coordinate-only 60 km/h fallback must remain real');
console.log('PASS coordinate speed fallback at road speed');

for (const intervalMs of [7000, 15000]) {
  for (const kmh of [60, 100]) {
    const sparse = points(Array.from({length:35}, (_,i) => i * kmh / 3.6 * intervalMs / 1000), {
      source:'native-android', accuracy:5, speedKmh:0, intervalMs
    });
    const sm = metrics(sparse, 60000);
    assert(sm.distanceKm > 0.3, 'sparse ' + kmh + ' km/h coordinate route must accrue distance');
    assert(sm.maxSpeedKmh >= kmh * 0.85 && sm.maxSpeedKmh <= kmh * 1.15,
      'sparse ' + kmh + ' km/h speed must be reconstructed from elapsed GPS time without guessing');
    assert(sm.avgSpeedKmh >= kmh * 0.80 && sm.avgSpeedKmh <= kmh * 1.20,
      'sparse ' + kmh + ' km/h average speed must remain plausible');
    console.log('PASS sparse background GPS cadence ' + kmh + ' km/h');
  }
}
const jump = points([0,0,0,50,0,0,0,0,0], {source:'native-android', accuracy:5, speedKmh:180});
const jumpMetrics = metrics(jump, 60000);
assert(jumpMetrics.maxSpeedKmh <= 160, 'an isolated GPS jump must not create an extreme motorcycle speed');
console.log('PASS isolated GPS jump rejection');

const stopOffsets = [];
for (let i = 0; i < 20; i++) stopOffsets.push(i * 60 / 3.6);
for (let i = 20; i < 35; i++) stopOffsets.push(19 * 60 / 3.6);
for (let i = 35; i < 55; i++) stopOffsets.push(19 * 60 / 3.6 + (i - 34) * 60 / 3.6);
const stopTrace = points(stopOffsets, {source:'native-android', accuracy:5, speedKmh:0});
const stopTrack = gps.RHFilterGpsTrack(stopTrace);
assert(stopTrack.slice(22,35).every(p => Number(p.filteredSpeedKmh || 0) <= 3),
  'speed must fall to zero after the phone stops instead of lingering from the prior moving window');
assert(stopTrack.slice(38).some(p => Number(p.filteredSpeedKmh || 0) >= 50),
  'speed must resume after subsequent GPS fixes confirm movement');
assert(html.includes('const currentMotionThreshold=Math.max(2.2,Math.min(10,noiseRadius*0.25));') &&
  html.includes('const confirmed=coordinateMotion||localMotion||providerMatches||reportedMatches;') &&
  html.includes('speed=providerMatches?provider:(reportedMatches?reported:segmentSpeed);'),
  'current speed must use the latest GPS segment, with corroboration, not stale rolling-window speed');

const seconds = points([0, 12, 24, 36], {intervalMs: 7000, speedKmh: 0});
seconds.forEach(p => { p.time = p.time / 1000; });
const normalizedSeconds = gps.RHNormalizeGpsPoints(seconds);
assert(normalizedSeconds.length === 4 && normalizedSeconds[1].time - normalizedSeconds[0].time === 7000,
  'epoch-second timestamps must become milliseconds before speed calculations');

const tripLike = points(Array.from({length:495}, (_,i) => i * 23.5), {
  source:'native-android', accuracy:5, speedKmh:0, intervalMs:6900
});
const tripLikeMetrics = metrics(tripLike, 60000);
assert(tripLikeMetrics.pointCount === 495 && tripLikeMetrics.distanceKm > 10 &&
  tripLikeMetrics.avgSpeedKmh > 5 && tripLikeMetrics.maxSpeedKmh > 5,
  'a long 495-point background trip must yield real speed metrics, not 0/0');
console.log('PASS per-fix speed, mixed timestamp units, and long-trip history');

assert(html.includes('if(x.pending&&x.pending.id)'), 'completed but unsaved trips must be restored after app restart');
assert(html.includes('const syncConfirmed=!!syncResult&&syncResult.ok===true&&Number(syncResult.remaining||0)===0;'),
  'native trip save must not treat a failed sync as success');
const confirmSaveStart=html.indexOf('async confirmSave()');
const confirmSaveEnd=html.indexOf('async cancelSave()',confirmSaveStart);
const confirmSaveSource=html.slice(confirmSaveStart,confirmSaveEnd);
assert(confirmSaveSource.includes('.getNativeTripPoints(sid)'), 'native route must be checked on server before local cleanup');
assert(!confirmSaveSource.includes('.deleteNativeTripPoints(sid)'), 'saving a trip must not delete server GPS points required by history maps');
assert(confirmSaveSource.includes('Keep server TripPoints: history map'), 'native GPS history route points must be retained');
console.log('PASS recoverable trip save and route history retention');

assert(html.includes('const wallEnd=Number(endMs)||(this.active?Date.now():Number(this.end)||lastPointTime)'),
  'metrics duration must use trip start/stop wall clock');
assert(html.includes('const elapsedSeconds=this.start?Math.max(0,Math.floor(((this.active?Date.now():(this.end||Date.now()))-this.start)/1000))'),
  'live trip timer must use wall clock');
assert(html.includes('RHTrustedProviderSpeed'), 'provider speed accuracy filter must exist');
assert(html.includes('if(!isFinite(accuracy)||accuracy<=0||accuracy>50)return 0;'),
  'provider speed must require a real, non-zero horizontal accuracy');
assert(html.includes('speedKmh:isFinite(speedRaw)&&speedRaw>=0?speedRaw:NaN'),
  'GPS normalizer must preserve native coordinate-derived speed');
assert(html.includes('raw<100000000000?raw*1000:raw') &&
  html.slice(html.indexOf('normalizeMapPoints(arr)'),html.indexOf('speedColor(speed)')).includes('RHGpsTimeMs({time:rawTime})'),
  'numeric GPS timestamps in seconds and milliseconds must normalize to the same time unit');
assert(html.includes('nativeStoredKmh>=3&&(!isFinite(providerKmh)||providerKmh<3)'),
  'a zero OS speed must not override a validated native coordinate-derived speed');
assert(html.includes('maxGapForMovingS: 22') && html.includes('movementWindowS: 32'),
  'movement filter must handle sparse background GPS intervals up to 15 seconds');
assert(html.includes('const windowMs=Math.min(RH_GPS_CFG.movementWindowS*1000,Math.max(4500,previousInterval*2.2));'),
  'speed window must shrink at high sampling rate so speed returns to zero after stopping');
assert(html.includes('const currentMotionThreshold=Math.max(2.2,Math.min(10,noiseRadius*0.25));') &&
  html.includes('const confirmed=coordinateMotion||localMotion||providerMatches||reportedMatches;'),
  'filter must validate current-segment movement before emitting speed');
assert(html.includes('usedCoordinateFallback'),
  'GPS route map must retain a credible coordinate trace when speed is not validated');
assert(html.includes('providerSpeedKmh:isFinite(providerRaw)&&providerRaw>=0?providerRaw:NaN,'),
  'coordinate-derived stored speed must never masquerade as provider GNSS speed');
assert(html.includes('Raw valid coordinates define the route; speed filtering only annotates it.'),
  'route geometry must remain visible even when speed validation rejects fixes');
assert(html.includes('https://nominatim.openstreetmap.org/reverse') &&
  html.includes('this._placeNameCache') && html.includes('1100-(Date.now()-Number(this._lastGeocodeAt||0))'),
  'route pin place-name lookup must be cached and rate-limited');
assert(html.includes("addRoutePin(track[0],'S','#16a34a','Titik mulai')") &&
  html.includes("addRoutePin(track[track.length-1],'F','#e11d48','Titik selesai')") &&
  html.includes('const markerCount=Math.min(12') &&
  html.includes("addRoutePin(track[idx],String(n),'#2563eb','Titik rute '+n)"),
  'start, finish and numbered route-point pins must be visible and tappable');
assert(html.includes('Buka titik ini di Google Maps') && html.includes('Klik pin bernomor untuk nama lokasi.'),
  'a route pin must provide place name lookup and a direct Google Maps point link');
assert(html.includes("modal.classList.add('active')") && html.includes('Koordinat jalur untuk perjalanan ini belum tersedia di server.'),
  'history map must open first and explain missing server coordinates instead of silently returning');
assert(html.includes('recompute from stored GPS failed') && html.includes('habitCounts[k].add(date)') &&
  html.includes('Habit dihitung dari tanggal perjalanan, bukan jumlah titik GPS.') &&
  html.includes('.filter(h=>h.dates.size>=2)') &&
  html.includes('Trip baru tidak langsung dianggap habit.'),
  'history and dashboard habits must use real trips on distinct dates');
console.log('PASS wall-clock timer, speed-quality gates, and movement-only map');

const service = read('android/app/src/main/java/com/rhhabits/app/RHTrackingService.java');
const plugin = read('android/app/src/main/java/com/rhhabits/app/RHTrackingPlugin.java');
const db = read('android/app/src/main/java/com/rhhabits/app/TrackingDb.java');
const api = read('api/native-location.js');
assert(service.includes('hasSpeedAccuracy()') && service.includes('getSpeedAccuracyMetersPerSecond()'),
  'Android OS speed accuracy must be read');
assert(service.includes('setMaxUpdateAgeMillis(0L)'), 'Android must not start from a stale cached fix');
assert(plugin.includes('out.put("providerSpeedKmh"') && plugin.includes('out.put("speedAccuracyMps"'),
  'native speed metadata must reach JavaScript');
assert(db.includes('DB_VERSION = 2') && db.includes('ALTER TABLE points ADD COLUMN speed_accuracy_mps'),
  'SQLite v1 to v2 migration must exist');
assert(db.includes('o.put("providerSpeedKmh"') && db.includes('o.put("speedAccuracyMps"'),
  'native speed metadata must persist locally and sync');
assert(api.includes('providerSpeedKmh:Number.isFinite') && api.includes('speedAccuracyMps:Number.isFinite'),
  'native GPS proxy must preserve speed confidence');
console.log('PASS Android → plugin → SQLite → sync pipeline');

console.log('[GPS VERIFY] All deterministic checks passed. Physical-device road test is still required.');
