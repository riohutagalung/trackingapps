import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const infoPlist = path.join(root, 'ios/App/App/Info.plist');
const packageSwift = path.join(root, 'ios/App/CapApp-SPM/Package.swift');
const pluginSwift = path.join(root, 'node_modules/@capgo/background-geolocation/ios/Sources/CapgoBackgroundGeolocationPlugin/CapgoCapacitorBackgroundGeolocationPlugin.swift');
const xcodeproj = path.join(root, 'ios/App/App.xcodeproj/project.pbxproj');

function read(file, label) {
  if (!fs.existsSync(file)) throw new Error('[RH iOS] Missing ' + label + ': ' + file);
  return fs.readFileSync(file, 'utf8');
}

const info = read(infoPlist, 'Info.plist');
const spm = read(packageSwift, 'CapApp-SPM/Package.swift');
const proj = read(xcodeproj, 'Xcode project');

const checks = [
  ['NSLocationWhenInUseUsageDescription', info],
  ['NSLocationAlwaysAndWhenInUseUsageDescription', info],
  ['UIBackgroundModes', info],
  ['<string>location</string>', info],
  ['CapgoBackgroundGeolocation', spm],
  ['.product(name: "CapgoBackgroundGeolocation"', spm],
  ['XCLocalSwiftPackageReference "CapApp-SPM"', proj]
];

for (const [needle, source] of checks) {
  if (!source.includes(needle)) throw new Error('[RH iOS] Missing required configuration: ' + needle);
}

const plugin = fs.existsSync(pluginSwift) ? fs.readFileSync(pluginSwift, 'utf8') : '';
if (!plugin) {
  throw new Error('[RH iOS] Capgo iOS source missing. Run npm ci first.');
}
if (!plugin.includes('private let pluginVersion: String = "8.4.5"')) {
  throw new Error('[RH iOS] Unexpected @capgo/background-geolocation version. Expected 8.4.5.');
}
if (!plugin.includes('CLBackgroundActivitySession')) {
  throw new Error('[RH iOS] CLBackgroundActivitySession patch is not present. Run npm ci / npm run native:prepare.');
}
if (!plugin.includes('rhBackgroundActivitySession')) {
  throw new Error('[RH iOS] RH background activity session property is missing.');
}

console.log('[RH iOS] Info.plist location/background configuration: OK');
console.log('[RH iOS] CapApp-SPM + CapgoBackgroundGeolocation: OK');
console.log('[RH iOS] CLBackgroundActivitySession patch: OK');

if (process.platform !== 'darwin') {
  console.log('[RH iOS] Host OS: ' + process.platform + ' (inspection only; Xcode build requires macOS).');
  process.exit(0);
}

try {
  const version = execFileSync('xcodebuild', ['-version'], { encoding: 'utf8' });
  console.log('[RH iOS] Xcode:');
  process.stdout.write(version);
} catch {
  throw new Error('[RH iOS] xcodebuild not found. Install Xcode + command line tools.');
}

console.log('[RH iOS] iOS doctor finished OK');
