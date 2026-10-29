#!/usr/bin/env python3
"""The LG package against the one the LG-only rework started from (tests/baseline/package.json).

    python3 tests/test_package.py            # check tests/.out/FreeMyTV-webos.ipk (tests/run.sh builds it)
    python3 tests/test_package.py --update   # write the baseline from it (only on the code it is meant to describe)

Every file the baseline lists must come out byte for byte the same, unless CHANGED, REMOVED or ADDED below names it
with the reason. The texts are compared as the screen gets them (tests/baseline/i18n.json holds the catalogues the
rework started from): every key web/ calls, in every language, through strings.js's fallback from "context|Text" to
"Text". Standard library only.
"""
import gzip
import hashlib
import io
import json
import os
import sys
import tarfile
import unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
IPK = os.environ.get('FMTV_IPK', os.path.join(ROOT, 'tests', '.out', 'FreeMyTV-webos.ipk'))
BASELINE = os.path.join(ROOT, 'tests', 'baseline', 'package.json')
TEXTS = os.path.join(ROOT, 'tests', 'baseline', 'i18n.json')
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import translate  # noqa: E402  (the keys web/ calls)

# Files whose content may change, and why. Everything else in the baseline must stay byte for byte.
CHANGED = {
    'index.html': 'the title names the fork; no crypto quotes; no round buttons at the top',
    'tv.js': 'Samsung and webOS 3-5 code removed, the fallback app id',
    'home.js': 'Samsung code removed, the About row names the fork; no crypto, the weather above the inputs; '
               'no round buttons at the top (all three are in the drawer)',
    'data.js': 'the Intl fallback for Tizen 2 removed; no crypto prices',
    'strings.js': 'polyfills for Chromium before 79 removed',
    'home.css': 'the lite mode for slow TVs removed; no crypto, the weather above the inputs; no round buttons at the top',
    'config.js': 'no show_crypto and currency',
    'appinfo.json': 'id, version, title and vendor of the fork (compared field by field below)',
    'service/service.js': 'the Buffer fallback for old Node removed',
    'service/package.json': 'the service id follows the app id',
    'service/services.json': 'the service id follows the app id',
}
# Files that may be gone, and why.
REMOVED = {
    'icons/deezer.svg': 'Samsung only', 'icons/fox.svg': 'Samsung only', 'icons/googleplay.svg': 'Samsung only',
    'icons/redbull.svg': 'Samsung only', 'icons/steam.svg': 'Samsung only', 'icons/ted.svg': 'Samsung only',
    'icons/youtubekids.svg': 'Samsung only', 'coins.js': 'no crypto prices',
}
# Files that may be new, and why.
ADDED = {
    'LICENSE': 'the MIT notice travels with the package',
}
# appinfo.json fields the fork changes; the others must stay.
APPINFO_CHANGED = {'id', 'version', 'title', 'vendor'}
# control fields that follow the content or the fork.
CONTROL_CHANGED = {'Package', 'Version', 'Installed-Size', 'Maintainer'}


def ar_members(data):
    """{name: bytes} of an ar archive."""
    assert data[:8] == b'!<arch>\n', 'not an ar archive'
    out, i = {}, 8
    while i < len(data):
        header = data[i:i + 60]
        name, size = header[:16].decode('ascii').strip(), int(header[48:58].decode('ascii').strip())
        out[name.rstrip('/')] = data[i + 60:i + 60 + size]
        i += 60 + size + (size % 2)
    return out


def tar_files(data):
    """{path: bytes} of the regular files in a .tar.gz."""
    out = {}
    with tarfile.open(fileobj=io.BytesIO(gzip.decompress(data)), mode='r:') as tar:
        for m in tar.getmembers():
            if m.isfile():
                out[m.name] = tar.extractfile(m).read()
    return out


def sha(data):
    return hashlib.sha256(data).hexdigest()


def catalogues(i18n_js):
    """The catalogues inside i18n.js, without its header comment."""
    text = i18n_js.decode('utf-8')
    start = text.index('window.I18N_CATALOGUES = ') + len('window.I18N_CATALOGUES = ')
    return json.loads(text[start:].rstrip().rstrip(';'))


def shown(catalogue, key):
    """What strings.js's tr() shows for a key: its text, else the text of "Text" for "context|Text", else Text."""
    if key in catalogue:
        return catalogue[key]
    plain = key.split('|', 1)[1] if '|' in key else key
    return catalogue.get(plain, plain)


def manifest(path):
    """What the baseline records of a package."""
    with open(path, 'rb') as f:
        members = ar_members(f.read())
    control = {}
    for line in tar_files(members['control.tar.gz'])['control'].decode('utf-8').splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            control[k.strip()] = v.strip()
    data = tar_files(members['data.tar.gz'])
    app_id = control['Package']
    app_base = 'usr/palm/applications/%s/' % app_id
    service_base = 'usr/palm/services/%s.service/' % app_id
    files, other = {}, []
    for name, content in data.items():
        if name.startswith(app_base):
            files[name[len(app_base):]] = sha(content)
        elif name.startswith(service_base):
            files['service/' + name[len(service_base):]] = sha(content)
        elif name != 'usr/palm/packages/%s/packageinfo.json' % app_id:
            other.append(name)
    packageinfo = json.loads(data['usr/palm/packages/%s/packageinfo.json' % app_id])
    appinfo = json.loads(data[app_base + 'appinfo.json'])
    service_files = {k: json.loads(data[service_base + k]) for k in ('package.json', 'services.json')}
    return {
        'control': control,
        'files': files,
        'catalogues': catalogues(data[app_base + 'i18n.js']),
        'appinfo': appinfo,
        'packageinfo': packageinfo,
        'service': service_files,
        'other': sorted(other),
    }


class Package(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not os.path.exists(IPK):
            raise unittest.SkipTest('%s is missing: run tests/run.sh' % IPK)
        with open(BASELINE, encoding='utf-8') as f:
            cls.base = json.load(f)
        cls.now = manifest(IPK)

    def test_files_unchanged(self):
        base, now = self.base['files'], self.now['files']
        for path, digest in sorted(base.items()):
            if path in CHANGED or path == 'i18n.js':
                continue
            if path not in now:
                self.assertIn(path, REMOVED, '%s is gone from the package' % path)
                continue
            self.assertEqual(now[path], digest, '%s changed' % path)
        for path in sorted(set(now) - set(base)):
            self.assertIn(path, ADDED, '%s is new in the package' % path)

    def test_texts_unchanged(self):
        with open(TEXTS, encoding='utf-8') as f:
            base = json.load(f)
        now = self.now['catalogues']
        self.assertEqual(sorted(now), sorted(base), 'languages added or gone')
        keys = sorted({args[0] for _, _, _, args in translate.web_calls() if args and args[0] is not None})
        for lang in sorted(base):
            for key in keys:
                self.assertEqual(shown(now[lang], key), shown(base[lang], key), '%s: %r reads differently' % (lang, key))

    def test_appinfo(self):
        base, now = self.base['appinfo'], self.now['appinfo']
        self.assertEqual(sorted(now), sorted(base), 'appinfo.json gained or lost fields')
        for k in base:
            if k not in APPINFO_CHANGED:
                self.assertEqual(now[k], base[k], 'appinfo.json: %s changed' % k)

    def test_structure(self):
        now = self.now
        app_id = now['appinfo']['id']
        self.assertEqual(now['control']['Package'], app_id)
        self.assertEqual(now['control']['Version'], now['appinfo']['version'])
        for k, v in self.base['control'].items():
            if k not in CONTROL_CHANGED:
                self.assertEqual(now['control'].get(k), v, 'control: %s changed' % k)
        self.assertEqual(now['packageinfo'], {'id': app_id, 'version': now['appinfo']['version'], 'app': app_id,
                                              'services': [app_id + '.service']})
        self.assertEqual(now['service']['package.json']['name'], app_id + '.service')
        self.assertEqual(now['service']['package.json']['main'], 'service.js')
        self.assertEqual(now['service']['services.json']['id'], app_id + '.service')
        self.assertEqual([s['name'] for s in now['service']['services.json']['services']], [app_id + '.service'])
        for name in ('service/service.js', 'service/package.json', 'service/services.json', 'index.html',
                     'appinfo.json', 'icon.png', 'largeIcon.png'):
            self.assertIn(name, now['files'])
        self.assertEqual(now['other'], [], 'files outside the app, its service and packageinfo.json')


if __name__ == '__main__':
    if '--update' in sys.argv:
        os.makedirs(os.path.dirname(BASELINE), exist_ok=True)
        with open(BASELINE, 'w', encoding='utf-8') as f:
            m = manifest(IPK)
            texts = m.pop('catalogues')
            json.dump(m, f, indent=1, sort_keys=True, ensure_ascii=False)
            f.write('\n')
        with open(TEXTS, 'w', encoding='utf-8') as f:
            json.dump(texts, f, indent=1, sort_keys=True, ensure_ascii=False)
            f.write('\n')
        print('Wrote %s' % os.path.relpath(BASELINE, ROOT))
    else:
        unittest.main()
