// What the tests put around the home screen: the internet (TMDB, Open-Meteo), a fixed clock, and for the
// webOS runs a fake TV (Luna's PalmServiceBridge, PalmSystem, the remote control API's WebSocket).
const path = require('path');
const zlib = require('zlib');
const {expect} = require('@playwright/test');

const APP = 'file://' + path.resolve(__dirname, '..', '.out', 'app', 'index.html');

// Tuesday 2026-10-20 in Berlin (CEST, UTC+2): 10:00 in the morning, 21:30 at night.
const DAY = '2026-10-20T10:00:00+02:00';
const NIGHT = '2026-10-20T21:30:00+02:00';

// MARK: - The internet

/** A small PNG in one color, from the path it stands for: the same photo every run. */
function png(seed) {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const w = 64, ht = 36, rgb = [h & 255, (h >> 8) & 255, (h >> 16) & 255];
  const raw = Buffer.alloc((w * 3 + 1) * ht);
  for (let y = 0; y < ht; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const o = y * (w * 3 + 1) + 1 + x * 3;
      raw[o] = (rgb[0] + x * 2) & 255;
      raw[o + 1] = (rgb[1] + y * 3) & 255;
      raw[o + 2] = rgb[2];
    }
  }
  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(ht, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, {level: 9})), chunk('IEND', Buffer.alloc(0))]);
}

const PROVIDERS = [[8, 'Netflix'], [9, 'Amazon Prime Video'], [337, 'Disney Plus'], [1796, 'Netflix basic with Ads'],
  [2100, 'Amazon Prime Video with Ads'], [688, 'Disney Plus Amazon Channel']];

function movie(id) {
  return {id, title: 'Movie ' + id, original_title: 'Movie ' + id, backdrop_path: '/m' + id + '.jpg',
    poster_path: '/mp' + id + '.jpg', genre_ids: id % 5 === 0 ? [16] : [28]};
}

function show(id) {
  return {id, name: 'Show ' + id, original_name: 'Show ' + id, backdrop_path: '/t' + id + '.jpg',
    poster_path: '/tp' + id + '.jpg', genre_ids: [10765]};
}

/** A title's details: its service rotates through the three, and every third one is Korean (an English title too). */
function details(kind, id, english) {
  const service = PROVIDERS[id % 3];
  const field = kind === 'movie' ? 'title' : 'name';
  const korean = id % 3 === 1 && !english;
  const own = korean ? '제목 ' + id : (kind === 'movie' ? 'Movie ' : 'Show ') + id;
  const o = {
    id, [field]: own, ['original_' + field]: korean ? own : own, original_language: korean ? 'ko' : 'en',
    poster_path: '/' + kind[0] + 'p' + id + '.jpg',
    genres: [{name: kind === 'movie' ? 'Action' : 'Sci-Fi & Fantasy'}],
    images: {backdrops: [{file_path: '/' + kind[0] + id + 'b.jpg', iso_639_1: null, width: 3840, vote_average: 5}]},
    'watch/providers': {results: {DE: {flatrate: [{provider_id: service[0], provider_name: service[1]}]}}},
  };
  if (kind === 'movie') o.runtime = 95 + id % 50; else o.number_of_seasons = 1 + id % 4;
  if (english) o[field] = (kind === 'movie' ? 'Movie ' : 'Show ') + id + ' (English)';
  return o;
}

function forecast(lat, lon) {
  const day = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'];
  const hourly = {time: [], temperature_2m: [], weather_code: [], is_day: []};
  for (let i = 0; i < 48; i++) {
    const d = day[Math.floor(i / 24)], hh = i % 24;
    hourly.time.push(d + 'T' + (hh < 10 ? '0' : '') + hh + ':00');
    hourly.temperature_2m.push(Math.round((8 + 6 * Math.sin((hh - 9) / 24 * 2 * Math.PI)) * 10) / 10);
    hourly.weather_code.push([0, 1, 2, 3, 45, 61, 63, 71, 95][i % 9]);
    hourly.is_day.push(hh >= 8 && hh < 18 ? 1 : 0);
  }
  return {
    latitude: +lat, longitude: +lon, utc_offset_seconds: 7200, timezone: 'Europe/Berlin',
    current: {temperature_2m: 12.4, weather_code: 2, is_day: 1},
    daily: {time: day, temperature_2m_max: [14.1, 15.2, 11.8, 9.9, 12.3, 13.0], temperature_2m_min: [6.2, 7.1, 5.5, 3.9, 4.8, 6.0],
      sunrise: day.map((d) => d + 'T07:35'), sunset: day.map((d) => d + 'T18:12'), weather_code: [2, 3, 61, 63, 0, 1]},
    hourly,
  };
}

/** Answers every request the page makes from the fixtures; anything else fails the test. Returns the log. */
async function internet(page) {
  const log = {requests: [], unexpected: [], pending: 0};
  const json = (route, body, status) => route.fulfill({status: status || 200, contentType: 'application/json',
    headers: {'Access-Control-Allow-Origin': '*'}, body: JSON.stringify(body)});
  await page.route(/^https?:\/\//, async (route) => {
    const req = route.request(), url = new URL(req.url());
    log.requests.push(req.method() + ' ' + req.url());
    log.pending++;
    try {
      if (req.method() === 'OPTIONS') {
        await route.fulfill({status: 204, headers: {'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'GET'}});
      } else if (url.host === 'image.tmdb.org') {
        await route.fulfill({status: 200, contentType: 'image/png', headers: {'Access-Control-Allow-Origin': '*'},
          body: png(url.pathname)});
      } else if (url.host === 'api.open-meteo.com' && url.pathname === '/v1/forecast') {
        await json(route, forecast(url.searchParams.get('latitude'), url.searchParams.get('longitude')));
      } else if (url.host === 'geocoding-api.open-meteo.com') {
        const name = (url.searchParams.get('name') || '').toLowerCase();
        await json(route, name === 'hamburg' ? {results: [
          {name: 'Hamburg', latitude: 53.55073, longitude: 9.99302, admin1: 'Hamburg', country: 'Germany'},
          {name: 'Hamburg', latitude: 40.55565, longitude: -75.98186, admin1: 'Pennsylvania', country: 'United States'},
          {name: 'Hamburg', latitude: 53.55073, longitude: 9.99302, admin1: 'Hamburg', country: 'Germany'}]} : {});
      } else if (url.host === 'api.tmdb.org') {
        await tmdb(route, url, json);
      } else {
        log.unexpected.push(req.url());
        await route.abort();
      }
    } finally {
      log.pending--;
    }
  });
  return log;
}

async function tmdb(route, url, json) {
  const p = url.pathname.replace(/^\/3/, ''), key = url.searchParams.get('api_key');
  if (key === 'ffffffffffffffffffffffffffffffff') { await json(route, {status_code: 7, success: false}, 401); return; }
  let m;
  if (p === '/configuration') await json(route, {images: {base_url: 'https://image.tmdb.org/t/p/'}});
  else if (p === '/watch/providers/movie') await json(route, {results: PROVIDERS.map((x) => ({provider_id: x[0], provider_name: x[1]}))});
  else if (p === '/trending/movie/week') await json(route, {results: [101, 102, 103, 104, 105, 106, 107, 108].map(movie)});
  else if (p === '/trending/tv/week') await json(route, {results: [201, 202, 203, 204, 205, 206].map(show)});
  else if (p === '/discover/movie') await json(route, {results: [301, 302, 303, 304].map(movie)});
  else if (p === '/discover/tv') await json(route, {results: [401, 402, 403].map(show)});
  else if ((m = /^\/(movie|tv)\/(\d+)$/.exec(p))) await json(route, details(m[1], +m[2], url.searchParams.get('language') === 'en-US'));
  else await json(route, {status_code: 34}, 404);
}

// MARK: - The TV (webOS)

const LAUNCH_POINTS = [
  {id: 'netflix', title: 'Netflix', icon: 'icons/netflix.svg', bgColor: '#000000'},
  {id: 'youtube.leanback.v4', title: 'YouTube', largeIcon: 'icons/youtube.png'},
  {id: 'amazon', title: 'Prime Video', icon: 'icons/prime.png'},
  {id: 'com.disney.disneyplus-prod', title: 'Disney+', iconColor: '#1838C8'},
  {id: 'com.webos.app.livetv', title: 'Live TV'},
  {id: 'com.webos.app.hdmi1', title: 'HDMI 1'},
  {id: 'com.webos.app.home', title: 'Home'},
  {id: 'test.app', title: 'Free My TV'},
  {id: 'com.webos.app.browser', title: 'Web Browser'},
  {id: 'cdp-30', title: 'Plex', bgColor: '#E5A00D'},
  {id: 'com.palm.app.settings', title: 'Settings'},
  {id: 'broken.app', title: 'Broken App'},
];

/**
 * Runs in the page before its scripts: a webOS TV whose answers `tv` decides.
 *  tv.launchPoints: true (listed) or false (denied, as on webOS 6 in Developer Mode)
 *  tv.ws: 'pending' (the TV asks and nobody answers yet), 'ok', 'refused', 'origin' (1008: through the service)
 *  tv.storage: localStorage to start with (the first load only)
 */
function fakeWebOS(tv) {
  window.__luna = [];
  window.__ws = [];
  window.__palm = [];
  if (!sessionStorage.getItem('__started')) {
    sessionStorage.setItem('__started', '1');
    Object.keys(tv.storage || {}).forEach(function (k) { localStorage.setItem(k, tv.storage[k]); });
  }
  window.PalmSystem = {
    identifier: 'test.app 1234',
    platformBack: function () { window.__palm.push('platformBack'); },
    activate: function () { window.__palm.push('activate'); },
  };
  var later = function (fn) { Promise.resolve().then(fn); };
  var ok = function (o) { o.returnValue = true; return o; };
  function answer(uri, params) {
    switch (uri) {
      case 'luna://com.webos.applicationManager/listLaunchPoints':
        return tv.launchPoints ? ok({launchPoints: tv.points}) : {returnValue: false, errorCode: -1, errorText: 'Denied method call'};
      case 'luna://com.webos.applicationManager/getAppLoadStatus':
        return ok({exist: tv.known.indexOf(params.appId) >= 0});
      case 'luna://com.webos.applicationManager/launch':
        return params.id === 'broken.app' ? {returnValue: false, errorText: 'no app'} : ok({});
      case 'luna://com.webos.service.eim/getAllInputStatus':
        return ok({devices: [
          {appId: 'com.webos.app.hdmi1', connected: true, label: 'PS5'},
          {appId: 'com.webos.app.hdmi2', connected: false, label: 'HDMI2'},
          {appId: 'com.webos.app.hdmi3', connected: true, label: 'HDMI 3'},
          {appId: 'com.webos.app.hdmi4', connected: false, label: 'Apple TV'}]});
      case 'luna://com.webos.service.tv.systemproperty/getSystemInfo':
        return ok({modelName: 'OLED48C11LB', firmwareVersion: '03.53.47', sdkVersion: '6.5.3'});
      case 'luna://com.webos.service.systemservice/osInfo/query':
        return ok({webos_release: '6.5.3-47'});
      case 'luna://com.palm.connectionmanager/getStatus':
        return ok({wired: {state: 'disconnected'}, wifi: {state: 'connected', ipAddress: '192.168.1.77'}});
      case 'luna://com.webos.service.tvpower/power/responseScreenSaverRequest':
        return ok({});
      case 'luna://com.webos.service.tvpower/power/registerScreenSaverRequest':
        return ok({subscribed: true});
      case 'luna://test.app.service/ssap':
        return ok({clientKey: 'service-key', payload: ok({launchPoints: tv.points.slice(0, 4)})});
    }
    return {returnValue: false, errorText: 'not faked: ' + uri};
  }
  window.PalmServiceBridge = function () { this.onservicecallback = null; };
  window.PalmServiceBridge.prototype.call = function (uri, json) {
    var params = JSON.parse(json), bridge = this;
    window.__luna.push({uri: uri, params: params});
    if (/registerScreenSaverRequest$/.test(uri)) window.__saver = bridge;
    var res = answer(uri, params);
    later(function () { if (bridge.onservicecallback) bridge.onservicecallback(JSON.stringify(res)); });
  };
  /** The TV's screensaver asks whether it may start. */
  window.__askSaver = function (timestamp) {
    window.__saver.onservicecallback(JSON.stringify({timestamp: timestamp}));
  };

  window.WebSocket = function (url) {
    var ws = this;
    window.__ws.push({open: url});
    ws.close = function () { window.__ws.push({close: true}); };
    ws.send = function (text) {
      var m = JSON.parse(text);
      window.__ws.push({send: m});
      later(function () {
        if (m.type === 'register') {
          if (tv.ws === 'refused') ws.onmessage({data: JSON.stringify({type: 'error', id: 'register', error: '403 User denied access'})});
          else if (tv.ws === 'origin') ws.onclose({code: 1008, reason: 'invalid origin'});
          else if (tv.ws === 'ok') ws.onmessage({data: JSON.stringify({type: 'registered', id: 'register', payload: {'client-key': 'socket-key'}})});
        } else if (m.type === 'request') {
          ws.onmessage({data: JSON.stringify({type: 'response', id: m.id, payload: {returnValue: true, launchPoints: tv.points.slice(0, 5)}})});
        }
      });
    };
    later(function () { if (ws.onopen) ws.onopen(); });
  };
}

// MARK: - Opening the home screen

/**
 * Opens the home screen at `at` (DAY or NIGHT) with these settings (Home Settings' fmtv.prefs), on a webOS TV when
 * `tv` is given, else in the browser stand-in. Fails the test on a script error or a request the fixtures don't know.
 */
async function open(page, {at = DAY, prefs = null, tv = null, storage = {}} = {}) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.clock.install({time: new Date(at)});
  // Time moves only with runFor, not while the page loads: the screensaver's 0.6 s clock fade then lands the same way
  // every run.
  await page.clock.pauseAt(new Date(new Date(at).getTime() + 1000));
  // Math.random from a fixed seed, like the clock: the screensaver's corners come in the same order every run.
  await page.addInitScript(() => {
    let seed = 42;
    Math.random = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  });
  const start = Object.assign({}, storage);
  if (prefs) start['fmtv.prefs'] = JSON.stringify(prefs);
  if (tv) {
    await page.addInitScript(fakeWebOS, Object.assign({launchPoints: true, ws: 'pending', points: LAUNCH_POINTS,
      known: ['netflix', 'youtube.leanback.v4', 'amazon', 'cdp-30', 'org.jellyfin.webos'], storage: start}, tv));
  } else {
    await page.addInitScript((s) => {
      if (sessionStorage.getItem('__started')) return;
      sessionStorage.setItem('__started', '1');
      Object.keys(s).forEach((k) => localStorage.setItem(k, s[k]));
    }, start);
  }
  const net = await internet(page);
  await page.goto(APP);
  await settle(page, net);
  return {net, errors, check: () => {
    expect(net.unexpected, 'requests the fixtures don\'t know').toEqual([]);
    expect(errors, 'errors in the page').toEqual([]);
  }};
}

/** Waits (in real time) until no request is open and none followed for a moment: the page's clock stands still. */
async function idle(page, net) {
  for (let i = 0, stable = 0; i < 500 && stable < 4; i++) {
    await page.waitForTimeout(10);
    stable = net.pending === 0 ? stable + 1 : 0;
  }
}

/**
 * Lets the page's timers run for 6 s on its clock, in steps, with every request answered before the next step: the
 * same clock time every run, however long the answers take.
 */
async function settle(page, net) {
  for (let i = 0; i < 24; i++) {
    await idle(page, net);
    await page.clock.runFor(250);
  }
  await idle(page, net);
}

/** Presses remote keys: 'Right', 'Right', 'Enter', 'Back' (461, LG's Back)... then lets the page settle. */
async function press(page, net, ...keys) {
  for (const k of keys) {
    if (k === 'Back') await page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', {keyCode: 461, bubbles: true})));
    else await page.keyboard.press(k === 'Left' || k === 'Right' || k === 'Up' || k === 'Down' ? 'Arrow' + k : k);
    await settle(page, net);
  }
}

/** The page as text: elements with their id and classes, the text, and what decides what's shown (src, background). */
async function dom(page) {
  return page.evaluate(() => {
    const out = [];
    const pad = (n) => '  '.repeat(n);
    (function walk(node, depth) {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          const t = c.textContent.replace(/\s+/g, ' ').trim();
          if (t) out.push(pad(depth) + JSON.stringify(t));
        } else if (c.nodeType === 1 && c.tagName !== 'SCRIPT') {
          let line = c.tagName.toLowerCase() + (c.id ? '#' + c.id : '');
          const cls = (c.getAttribute('class') || '').trim();
          if (cls) line += '.' + cls.split(/\s+/).join('.');
          for (const a of c.getAttributeNames().sort()) {
            if (/^(aria-|role$|src$|placeholder$|type$|autocapitalize$)/.test(a)) line += ' ' + a + '=' + JSON.stringify(c.getAttribute(a));
          }
          if (c.tagName === 'INPUT') line += ' value=' + JSON.stringify(c.value) + (document.activeElement === c ? ' [focused]' : '');
          if (c.style && c.style.backgroundImage) line += ' bg=' + JSON.stringify(c.style.backgroundImage);
          out.push(pad(depth) + line);
          walk(c, depth + 1);
        }
      }
    })(document.body, 0);
    return 'html.' + (document.documentElement.className || '-') + ' body.' + (document.body.className || '-') + '\n' + out.join('\n') + '\n';
  });
}

/** Home Settings, the TV's own keys and choices it keeps (not the cached forecast and picks). */
async function storage(page) {
  return page.evaluate(() => {
    const out = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (/^fmtv\.(prefs|ssapKey|ssapRefused|night)$/.test(k)) out[k] = localStorage.getItem(k);
    }
    return JSON.stringify(out, Object.keys(out).sort(), 1) + '\n';
  });
}

/** The requests, sorted (some run side by side). */
function requests(net) {
  return net.requests.slice().sort().join('\n') + '\n';
}

async function screenshot(page, name) {
  if (process.env.FMTV_NO_SCREENSHOTS) return;
  await expect(page).toHaveScreenshot(name);
}

/** Moves the focus along `selector` (a row of keys, a list of rows) to the one labeled `text`, from the one focused. */
async function moveTo(page, net, selector, text, horizontal) {
  const at = await page.evaluate(([sel, t]) => {
    const list = Array.prototype.slice.call(document.querySelectorAll(sel));
    const label = (n) => (n.querySelector(':scope > .label') ? n.querySelector(':scope > .label').textContent
      : n.firstChild && n.firstChild.nodeType === 3 ? n.firstChild.textContent : n.textContent).trim();
    return {focus: list.findIndex((n) => / focus /.test(' ' + n.className + ' ')), target: list.findIndex((n) => label(n) === t)};
  }, [selector, text]);
  if (at.target < 0) throw new Error('no ' + selector + ' with "' + text + '"');
  const n = at.target - Math.max(0, at.focus), key = horizontal ? (n > 0 ? 'Right' : 'Left') : (n > 0 ? 'Down' : 'Up');
  for (let i = 0; i < Math.abs(n); i++) await press(page, net, key);
}

module.exports = {DAY, NIGHT, LAUNCH_POINTS, open, settle, press, dom, storage, requests, screenshot, moveTo};
