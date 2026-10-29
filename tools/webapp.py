"""The settings and the web app's files, for webos/build.py.

The settings come from config.properties. --generic leaves it out: no TMDB key, and the TV's time zone picks the
city and the region.
"""
import json
import os
import re
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'tools'))
import translate  # noqa: E402  (the catalogues and the keys the web app uses)

GENERIC = {'tmdbKey': '', 'tmdbRegion': '', 'latitude': '', 'longitude': '', 'city': '', 'language': 'auto',
           'temperature': 'auto', 'theme': 'auto', 'hideAnimation': False, 'hideApps': [],
           'shelfApps': [], 'drawerFirst': False, 'haUrl': '', 'haToken': '', 'haTop': [], 'haPanel': []}


def config_from_args(args):
    """The settings for these command-line arguments (--generic, --config PATH or config.properties)."""
    if '--generic' in args:
        return dict(GENERIC)
    path = os.path.join(ROOT, 'config.properties')
    if '--config' in args:
        path = os.path.abspath(args[args.index('--config') + 1])
    return read_config(path)


def read_config(path):
    if not os.path.exists(path):
        shutil.copy(os.path.join(ROOT, 'config.example.properties'), path)
        print('Created config.properties: add your TMDB key and your city there (optional), then build again.')
    values = {}
    try:
        with open(path, encoding='utf-8-sig') as f:
            lines = f.readlines()
    except UnicodeDecodeError:   # Notepad's "Unicode" is UTF-16
        sys.exit('config.properties is saved as UTF-16 (Notepad\'s "Unicode"). Save it as UTF-8 and build again.')
    for line in lines:
        line = line.strip()
        if not line or line.startswith('#') or '=' not in line:
            continue
        key, value = line.split('=', 1)
        values[key.strip()] = value.strip().strip('"')

    def number(key, default):
        v = values.get(key, '') or default
        if not re.match(r'^-?\d+(\.\d+)?$', v):
            sys.exit('config.properties: %s must be a number (got "%s")' % (key, v))
        return v

    return {
        'tmdbKey': values.get('tmdb_key', ''),
        'tmdbRegion': values.get('tmdb_region', 'US') or 'US',
        'latitude': number('latitude', '40.7128'),
        'longitude': number('longitude', '-74.0060'),
        'city': values.get('city', ''),
        'language': values.get('language', 'auto') or 'auto',
        'temperature': values.get('temperature', 'auto') or 'auto',
        'theme': values.get('theme', 'auto') or 'auto',
        'hideAnimation': values.get('hide_animation', 'false').lower() == 'true',
        'hideApps': [s.strip() for s in values.get('hide_apps', '').split(',') if s.strip()],
        'shelfApps': [s.strip() for s in values.get('shelf_apps', '').split(',') if s.strip()],
        'drawerFirst': values.get('drawer_first', 'false').lower() == 'true',
        'haUrl': values.get('ha_url', '').rstrip('/'),
        'haToken': values.get('ha_token', ''),
        'haTop': [s.strip() for s in values.get('ha_top', '').split(',') if s.strip()][:3],
        'haPanel': [s.strip() for s in values.get('ha_panel', '').split(',') if s.strip()],
    }


def catalogues():
    """Each language's catalogue (assets/i18n), with only the keys the web app uses: {lang: {key: text}}."""
    keys = translate.web_keys()
    return {lang: {k: v for k, v in sorted(translate.load(lang).items()) if k in keys} for lang in translate.languages()}


QUOTE_MAX = 110


def quotes():
    """The quotes at the top, by the language they were written in: {lang: [{text, author, work}]}."""
    out = {}
    folder = os.path.join(ROOT, 'assets', 'quotes')
    for name in sorted(os.listdir(folder)):
        if name.endswith('.json'):
            with open(os.path.join(folder, name), encoding='utf-8') as f:
                entries = json.load(f)
            for q in entries:
                if not all(q.get(k) for k in ('text', 'author', 'work', 'source')):
                    sys.exit('assets/quotes/%s: each quote needs text, author, work and source: %r' % (name, q))
                if len(q['text']) > QUOTE_MAX:   # two lines at the top
                    sys.exit('assets/quotes/%s: longer than %d characters: %r' % (name, QUOTE_MAX, q['text']))
            out[name[:-5]] = [{k: q[k] for k in ('text', 'author', 'work')} for q in entries]
    return out


def files(config, made_by):
    """The web app's files, {path inside the app: bytes}: web/, the settings, the catalogues, the quotes, the symbols, the
    font and the license (MIT asks its notice to travel with every copy)."""
    out = {}
    with open(os.path.join(ROOT, 'LICENSE'), 'rb') as f:
        out['LICENSE'] = f.read()
    web = os.path.join(ROOT, 'web')
    for name in sorted(os.listdir(web)):
        if os.path.isdir(os.path.join(web, name)):
            continue
        with open(os.path.join(web, name), 'rb') as f:
            out[name] = f.read()
    icons = os.path.join(web, 'icons')
    for name in sorted(os.listdir(icons)):
        with open(os.path.join(icons, name), 'rb') as f:
            out['icons/' + name] = f.read()
    out['config.js'] = ('/* Generated by %s. */\nwindow.CONFIG = %s;\n'
                        % (made_by, json.dumps(config, ensure_ascii=False))).encode('utf-8')
    out['i18n.js'] = ('/* Generated by %s from assets/i18n. */\nwindow.I18N_CATALOGUES = %s;\n'
                      % (made_by, json.dumps(catalogues(), ensure_ascii=False, separators=(',', ':')))).encode('utf-8')
    out['quotes.js'] = ('/* Generated by %s from assets/quotes. */\nwindow.QUOTES = %s;\n'
                        % (made_by, json.dumps(quotes(), ensure_ascii=False, separators=(',', ':')))).encode('utf-8')
    symbols = os.path.join(ROOT, 'assets', 'symbols')
    for name in sorted(os.listdir(symbols)):
        if name.endswith('.png') or name.startswith('LICENSE'):
            with open(os.path.join(symbols, name), 'rb') as f:
                out['symbols/' + name] = f.read()
    for name in ('InterVariable.ttf', 'OFL.txt'):
        with open(os.path.join(ROOT, 'assets', 'fonts', name), 'rb') as f:
            out['fonts/' + name] = f.read()
    return out


def preview(app, out_dir):
    """Leaves the app's files in out_dir, to open index.html in a browser."""
    if os.path.isdir(out_dir):
        shutil.rmtree(out_dir)
    for path, content in app.items():
        target = os.path.join(out_dir, path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, 'wb') as f:
            f.write(content)
