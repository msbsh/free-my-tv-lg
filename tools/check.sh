#!/usr/bin/env bash
# What CI runs on every pull request (.github/workflows/check.yml). Run it before you push:
#
#   tools/check.sh   # translations, the LG package, what webOS 6 can run, and tests/ (needs Python 3 and Node)
set -euo pipefail
cd "$(dirname "$0")/.."

python3 tools/translate.py --check

# The generic package lands where your own build leaves yours (with your city and TMDB key): keep yours and put it
# back afterwards, so the next install isn't the generic one.
kept="$(mktemp -d)"
if [ -f FreeMyTV-webos.ipk ]; then cp FreeMyTV-webos.ipk "$kept/"; fi
trap 'if [ -f "$kept/FreeMyTV-webos.ipk" ]; then mv "$kept/FreeMyTV-webos.ipk" FreeMyTV-webos.ipk; else rm -f FreeMyTV-webos.ipk; fi; rm -rf "$kept"' EXIT
python3 webos/build.py --generic

# webOS 6 runs Chromium 79 and Node 12: web/ and the service go up to ES2019 in syntax (no ?. or ??)...
for f in web/*.js webos/service/*.js; do npx --yes acorn@8.14.0 --ecma2019 --silent "$f"; done
# ...and in what they call. These parse fine but came after Chromium 79 (wrap a feature check in try, as strings.js
# does with Intl.DisplayNames).
if grep -nE '\.(at|replaceAll|findLast|findLastIndex)\(|Object\.hasOwn\(|structuredClone\(|Promise\.any\(' web/*.js webos/service/*.js; then
  echo "web/ calls something webOS 6 doesn't have (above)." >&2
  exit 1
fi
# Nor CSS that came after it.
if grep -nE '(^|[{;[:space:]])(aspect-ratio|inset)[[:space:]]*:|:(is|where|has)\(' web/*.css; then
  echo "web/ uses CSS webOS 6 doesn't have (above)." >&2
  exit 1
fi

# The LG package and screen against their baseline (tests/run.sh).
tests/run.sh

echo "All checks passed."
