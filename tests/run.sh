#!/usr/bin/env bash
# Builds the LG package with the test settings and checks it against the baseline: the package itself
# (tests/test_package.py) and the screen in a browser that plays the TV (tests/e2e, Playwright).
#
#   tests/run.sh                       # everything
#   tests/run.sh --package             # only the package (Python 3, no Node)
#   tests/run.sh -- --update-snapshots # pass arguments on to Playwright
#
# FMTV_NO_SCREENSHOTS=1 leaves out the screenshots (their pixels differ between systems; CI sets it).
set -euo pipefail
cd "$(dirname "$0")/.."

only_package=false
if [ "${1:-}" = "--package" ]; then only_package=true; shift; fi
if [ "${1:-}" = "--" ]; then shift; fi

# The build leaves FreeMyTV-webos.ipk where your own build leaves yours (with your city and key): keep yours.
kept="$(mktemp -d)"
if [ -f FreeMyTV-webos.ipk ]; then cp FreeMyTV-webos.ipk "$kept/"; fi
trap 'if [ -f "$kept/FreeMyTV-webos.ipk" ]; then mv "$kept/FreeMyTV-webos.ipk" FreeMyTV-webos.ipk; else rm -f FreeMyTV-webos.ipk; fi; rm -rf "$kept"' EXIT

python3 webos/build.py --preview --config tests/fixtures/config.properties > /dev/null
rm -rf tests/.out
mkdir -p tests/.out
mv FreeMyTV-webos.ipk tests/.out/
cp -R out/webos tests/.out/app

python3 tests/test_package.py

if [ "$only_package" = false ]; then
  cd tests
  if [ ! -d node_modules ]; then npm ci --silent; fi
  npx playwright test "$@"
fi
