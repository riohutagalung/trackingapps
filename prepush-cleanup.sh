#!/usr/bin/env bash
set -euo pipefail

# 1) Make root files canonical and remove generated/stale native web copies from git.
git rm -r --cached --ignore-unmatch www || true
git rm --cached --ignore-unmatch code.gs || true
git rm --cached --ignore-unmatch maps-helpers.gs || true
git rm -r --cached --ignore-unmatch node_modules || true

# 2) Keep the generated www locally for Capacitor builds, but never commit it.
rm -rf www
npm run native:prepare

# 3) Verify the canonical files exist.
test -f index.html
test -f Code.gs
test -f gas-bridge.js
test -f rh-native-gps.js
test -f rh-native-media.js
test -f vercel.json
test -f package.json

echo
echo '=== RH Habits canonical tree ==='
printf '%s\n' 'index.html' 'Code.gs' 'gas-bridge.js' 'rh-native-gps.js' 'rh-native-media.js' 'api/rpc.js' 'api/native-location.js' 'vercel.json' 'package.json' 'capacitor.config.ts' 'scripts/setup-native.mjs'
echo
echo 'Run git status now. Do not commit until the list is correct.'
