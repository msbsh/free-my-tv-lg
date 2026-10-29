#!/usr/bin/env bash
# Records the README's animated preview (.github/preview.webp) from web/ as it is in this checkout: built with the
# TMDB key from the main checkout's config.properties, in a city where it's day now, toured by record.js.
#
#   .claude/skills/readme-preview/make.sh
#
# Needs Python 3, Node (tests/node_modules, which tests/run.sh installs), ImageMagick (magick) and libwebp (img2webp).
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
here=.claude/skills/readme-preview

for tool in python3 node magick img2webp; do
  command -v "$tool" > /dev/null || { echo "make.sh needs $tool" >&2; exit 1; }
done
main="$(git worktree list --porcelain | sed -n '1s/^worktree //p')"
config="$main/config.properties"
grep -q '^tmdb_key=.' "$config" 2>/dev/null || { echo "No TMDB key in $config: without it there are no picks." >&2; exit 1; }
if [ ! -d tests/node_modules ]; then (cd tests && npm ci --silent); fi

work="$(mktemp -d)"
mkdir "$work/src"
# The checkout's files, uncommitted changes included, built away from its own out/ and FreeMyTV-webos.ipk.
git ls-files -z --cached --others --exclude-standard | tar --null -T - -cf - | tar -xf - -C "$work/src"

# The weather is live: a city where it's early afternoon now shows the sun and a forecast that matches it.
tz="$(python3 - "$work/preview.properties" "$config" << 'EOF'
import sys
from datetime import datetime
from zoneinfo import ZoneInfo
CITIES = [  # name, latitude, longitude, TMDB region, time zone: every 2 to 4.5 hours around the world
    ('Sydney', -33.8688, 151.2093, 'AU', 'Australia/Sydney'), ('Tokyo', 35.6762, 139.6503, 'JP', 'Asia/Tokyo'),
    ('Mumbai', 19.0760, 72.8777, 'IN', 'Asia/Kolkata'), ('Berlin', 52.5200, 13.4050, 'DE', 'Europe/Berlin'),
    ('London', 51.5072, -0.1276, 'GB', 'Europe/London'), ('São Paulo', -23.5505, -46.6333, 'BR', 'America/Sao_Paulo'),
    ('New York', 40.7128, -74.0060, 'US', 'America/New_York'),
    ('Los Angeles', 34.0522, -118.2437, 'US', 'America/Los_Angeles'),
    ('Honolulu', 21.3069, -157.8583, 'US', 'Pacific/Honolulu')]
def off_one(c):
    t = datetime.now(ZoneInfo(c[4]))
    return abs(t.hour + t.minute / 60 - 13.5)
name, lat, lon, region, tz = min(CITIES, key=off_one)
key = next(l for l in open(sys.argv[2], encoding='utf-8-sig') if l.startswith('tmdb_key='))
with open(sys.argv[1], 'w', encoding='utf-8') as f:
    f.write(key.rstrip('\n') + '\n' + '\n'.join([
        'tmdb_region=' + region, 'latitude=%s' % lat, 'longitude=%s' % lon, 'city=' + name, 'language=en',
        'temperature=auto', 'theme=auto', 'hide_animation=false', 'hide_apps=', 'shelf_apps=', 'drawer_first=false']) + '\n')
print(tz)
EOF
)"
(cd "$work/src" && python3 webos/build.py --preview --config "$work/preview.properties" > /dev/null)
rm "$work/preview.properties"   # it holds the key

NODE_PATH="$PWD/tests/node_modules" node "$here/record.js" "$work/src/out/webos/index.html" "$work/frames" "$tz"

# 960×540 as the README shows it; a keyframe every 3 to 6 frames, or the blurred backdrop collects blocks.
mkdir "$work/small"
magick mogrify -path "$work/small" -filter Lanczos -resize 960x540 "$work/frames/f*.png"
python3 - "$work" .github/preview.webp << 'EOF'
import json, subprocess, sys
work, out = sys.argv[1], sys.argv[2]
frames = json.load(open(work + '/frames/frames.json'))
args = ['img2webp', '-loop', '0', '-lossy', '-q', '75', '-m', '4', '-kmin', '3', '-kmax', '6']
for i, f in enumerate(frames):
    until = frames[i + 1]['t'] if i + 1 < len(frames) else f['t'] + 1.5
    args += ['-d', str(max(20, round((until - f['t']) * 1000))), work + '/small/' + f['name']]
subprocess.run(args + ['-o', out], check=True, capture_output=True)
EOF

# Sixteen frames across the loop, decoded from the WebP (its artifacts show), to look at before committing.
mkdir "$work/decoded"
magick .github/preview.webp -coalesce "$work/decoded/f%04d.png"
n="$(ls "$work/decoded" | wc -l | tr -d ' ')"
magick montage $(python3 -c "import sys; n=int(sys.argv[1]); print(' '.join('$work/decoded/f%04d.png' % (i * (n - 1) // 15) for i in range(16)))" "$n") \
  -tile 4x -geometry 480x270+4+4 "$work/contact.png"
echo "Frames, full size: $work/decoded"
echo "Wrote .github/preview.webp ($(( $(wc -c < .github/preview.webp) / 1024 )) KB, ${tz})"
echo "Contact sheet: $work/contact.png"
