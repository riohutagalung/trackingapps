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
const gps = new Function('Haversine', logic + '; return {RHFilterGpsTrack, RHComputeGpsMetrics};')(Haversine);

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

for (const intervalMs of [7000]) {
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
assert(html.includes('maxGapForMovingS: 18') && html.includes('movementWindowS: 15'),
  'movement filter must handle sparse background GPS intervals');
assert(html.includes('usedCoordinateFallback'),
  'GPS route map must retain a credible coordinate trace when speed is not validated');
assert(html.includes('providerSpeedKmh:isFinite(providerRaw)&&providerRaw>=0?providerRaw:NaN,'),
  'coordinate-derived stored speed must never masquerade as provider GNSS speed');
assert(html.includes('const movingPoints = filtered.filter(p => p.moving === true'),
  'route map must exclude stationary GPS jitter points');
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
