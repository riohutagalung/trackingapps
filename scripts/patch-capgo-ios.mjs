import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const target = path.join(
  root,
  'node_modules/@capgo/background-geolocation/ios/Sources/CapgoBackgroundGeolocationPlugin/CapgoCapacitorBackgroundGeolocationPlugin.swift'
);

if (!fs.existsSync(target)) {
  console.log('[RH] Capgo iOS source not present; skipping iOS background-session patch.');
  process.exit(0);
}

let source = fs.readFileSync(target, 'utf8');

if (!source.includes('private let pluginVersion: String = "8.4.5"')) {
  throw new Error('[RH] Unsupported @capgo/background-geolocation version; expected 8.4.5.');
}

if (source.includes('rhBackgroundActivitySession')) {
  console.log('[RH] Capgo iOS background-session patch already applied.');
  process.exit(0);
}

const propertyAnchor = '    private var locationManager: CLLocationManager?\n';
const propertyInsert = propertyAnchor +
  '    @available(iOS 17.0, *)\n' +
  '    private var rhBackgroundActivitySession: CLBackgroundActivitySession?\n';

if (!source.includes(propertyAnchor)) {
  throw new Error('[RH] Could not find iOS CLLocationManager property anchor.');
}
source = source.replace(propertyAnchor, propertyInsert);

const configAnchor =
  '        manager.pausesLocationUpdatesAutomatically = false\n';
const configInsert =
  configAnchor +
  '        if #available(iOS 17.0, *), background {\n' +
  '            if self.rhBackgroundActivitySession == nil {\n' +
  '                self.rhBackgroundActivitySession = CLBackgroundActivitySession()\n' +
  '            }\n' +
  '            manager.activityType = .automotiveNavigation\n' +
  '        }\n';

if (!source.includes(configAnchor)) {
  throw new Error('[RH] Could not find iOS location-manager configuration anchor.');
}
source = source.replace(configAnchor, configInsert);

const stopAnchor =
  '            self.locationManager?.delegate = nil\n';
const stopInsert =
  '            if #available(iOS 17.0, *) {\n' +
  '                self.rhBackgroundActivitySession?.invalidate()\n' +
  '                self.rhBackgroundActivitySession = nil\n' +
  '            }\n' +
  stopAnchor;

if (!source.includes(stopAnchor)) {
  throw new Error('[RH] Could not find iOS stop() anchor.');
}
source = source.replace(stopAnchor, stopInsert);

fs.writeFileSync(target, source);
console.log('[RH] Applied iOS CLBackgroundActivitySession patch to Capgo 8.4.5.');
