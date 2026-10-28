/*
 * The TV's side of the web home screen: its apps, opening one, its inputs, its settings, the Back key, its time zone.
 *  - LG webOS: the TV's service bus (Luna), the same calls LG's launcher makes.
 *  - A desktop browser: a stand-in with sample apps, so the screen can be previewed and tested on a computer.
 * For webOS 6 and newer (Chromium 79).
 */
var TV = (function () {
  'use strict';

  var webos = typeof window.PalmServiceBridge !== 'undefined';
  var calls = [];   // a bridge is collected if nothing holds it before its reply arrives
  /** One Luna call; done(result) with null on failure. */
  function luna(uri, params, done) {
    if (!webos) {
      if (done) setTimeout(function () { done(null); }, 0);
      return;
    }
    var bridge = new window.PalmServiceBridge();
    calls.push(bridge);
    var finished = false;
    bridge.onservicecallback = function (message) {
      if (finished) return;
      finished = true;
      var i = calls.indexOf(bridge);
      if (i >= 0) calls.splice(i, 1);
      var result = null;
      try { result = JSON.parse(message); } catch (e) {}
      if (done) done(result && result.returnValue !== false ? result : null);
    };
    bridge.call(uri, JSON.stringify(params || {}));
  }

  // LG's own screensaver asks every subscribed app first. While Free My TV is on screen and its own screensaver will
  // take over (`hold`, from home.js), it says no; otherwise, and in the background, the TV's runs as before.
  var saverBridge = null;

  function holdScreenSaver(hold) {
    if (!webos || saverBridge) return;
    saverBridge = new window.PalmServiceBridge();
    saverBridge.onservicecallback = function (message) {
      var m = null;
      try { m = JSON.parse(message); } catch (e) {}
      if (!m || m.timestamp === undefined) return;
      luna('luna://com.webos.service.tvpower/power/responseScreenSaverRequest',
          {clientName: self, ack: !!document.hidden || !hold(), timestamp: m.timestamp});
    };
    saverBridge.call('luna://com.webos.service.tvpower/power/registerScreenSaverRequest',
        JSON.stringify({subscribe: true, clientName: self}));
  }

  // webOS 6 gives Developer Mode apps only the "public" group, which leaves out listLaunchPoints. There the list comes
  // from the TV's remote control API on 127.0.0.1:3000 (the one LG's phone app uses), which takes file:// pages.
  // The TV asks once to allow it; the key it gives back is kept. Newer firmware gives the page its own origin
  // (file://<app id>-webos), which the API refuses with 1008 "invalid origin": there our JS service (webos/service)
  // makes the call.
  var SSAP_KEY = 'fmtv.ssapKey', SSAP_REFUSED = 'fmtv.ssapRefused';

  /** One call to the remote control API; done(result) with null on failure. */
  function ssap(uri, done) {
    var ws = null, finished = false, key = null;
    var timer = setTimeout(function () { finish(null); }, 90000);   // time to answer the TV's prompt
    function finish(result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { ws.close(); } catch (e) {}
      done(result);
    }
    try { key = localStorage.getItem(SSAP_KEY); } catch (e) {}
    try { ws = new WebSocket('ws://127.0.0.1:3000'); } catch (e) { finish(null); return; }
    ws.onopen = function () {
      var payload = {forcePairing: false, pairingType: 'PROMPT',
        manifest: {manifestVersion: 1, appVersion: '1.0', permissions: ['READ_INSTALLED_APPS']}};
      if (key) payload['client-key'] = key;
      ws.send(JSON.stringify({type: 'register', id: 'register', payload: payload}));
    };
    ws.onmessage = function (event) {
      var m = null;
      try { m = JSON.parse(event.data); } catch (e) {}
      if (!m) return;
      if (m.type === 'registered') {
        try { localStorage.setItem(SSAP_KEY, m.payload['client-key']); } catch (e) {}
        ws.send(JSON.stringify({type: 'request', id: 'call', uri: 'ssap://' + uri}));
      } else if (m.id === 'call' || m.type === 'error') {
        if (m.id === 'register' && m.type === 'error') {
          try { localStorage.setItem(SSAP_REFUSED, '1'); } catch (e) {}   // the person said no on the TV
        }
        finish(m.type !== 'error' && m.payload && m.payload.returnValue !== false ? m.payload : null);
      }
    };
    ws.onerror = function () { finish(null); };
    ws.onclose = function (event) {
      if (event.code === 1008 && !finished) viaService(); else finish(null);
    };
    function viaService() {
      clearTimeout(timer);
      timer = setTimeout(function () { finish(null); }, 100000);   // the service waits 90 s for the prompt
      luna('luna://' + self + '.service/ssap', {uri: uri, clientKey: key}, function (res) {
        if (res && res.clientKey) {
          try { localStorage.setItem(SSAP_KEY, res.clientKey); } catch (e) {}
        }
        if (res && res.refused) {
          try { localStorage.setItem(SSAP_REFUSED, '1'); } catch (e) {}   // the person said no on the TV
        }
        finish(res && res.payload && res.payload.returnValue !== false ? res.payload : null);
      });
    }
  }

  // LG inputs: the antenna and the four HDMI ports, with the apps LG opens for them.
  var INPUTS = [
    {id: 'com.webos.app.livetv', key: 'live', label: null, symbol: 'live_tv'},
    {id: 'com.webos.app.hdmi1', key: 'hdmi1', label: 'HDMI 1', symbol: 'hdmi'},
    {id: 'com.webos.app.hdmi2', key: 'hdmi2', label: 'HDMI 2', symbol: 'hdmi'},
    {id: 'com.webos.app.hdmi3', key: 'hdmi3', label: 'HDMI 3', symbol: 'hdmi'},
    {id: 'com.webos.app.hdmi4', key: 'hdmi4', label: 'HDMI 4', symbol: 'hdmi'}
  ];

  // Not shown among LG's apps: the inputs above, LG's own home and launchers.
  var HIDDEN = /^(com\.webos\.app\.(livetv|hdmi\d|home|homeconnect|discovery|launcher)|com\.webos\.app\.inputpicker)$/;

  var SAMPLE = [
    ['netflix', 'Netflix', '#E50914'], ['youtube.leanback.v4', 'YouTube', '#FF0033'], ['amazon', 'Prime Video', '#1A98FF'],
    ['com.disney.disneyplus-prod', 'Disney+', '#1838C8'], ['com.hbo.hbomax', 'Max', '#6C3BE0'],
    ['com.apple.appletv', 'Apple TV', '#B8BCC6'], ['globoplaywebos', 'Globoplay', '#FF5A1F'], ['spotify-beehive', 'Spotify', '#1DB954'],
    ['cdp-30', 'Plex', '#E5A00D'], ['com.crunchyroll.webapp', 'Crunchyroll', '#F47521'], ['com.webos.app.browser', 'Web Browser', '#3A7BD5'],
    ['com.palm.app.settings', 'Settings', '#8E8E93']
  ];

  // Newer webOS (11 tested) denies listLaunchPoints to Developer Mode apps, but still answers getAppLoadStatus for
  // one app id: these are checked one by one there. Their icons can't be read, so they get our logo where web/icons
  // has one, and otherwise their name on the brand's color: [id, title, logo, color].
  var KNOWN = [
    ['netflix', 'Netflix', 'icons/netflix.svg'], ['youtube.leanback.v4', 'YouTube', 'icons/youtube.png'],
    ['amazon', 'Prime Video', 'icons/prime.png'], ['com.disney.disneyplus-prod', 'Disney+'],
    ['com.wbd.stream', 'HBO Max', 'icons/max.svg'], ['com.hbo.hbomax', 'Max', 'icons/max.svg'],
    ['com.apple.appletv', 'Apple TV'], ['hulu', 'Hulu'], ['com.peacock.tv', 'Peacock'], ['com.nfl.app', 'NFL'],
    ['globoplaywebos', 'Globoplay'], ['spotify-beehive', 'Spotify', 'icons/spotify.svg'],
    ['tv.twitch.tv.starshot.lg', 'Twitch', '', '#9146FF'], ['cdp-30', 'Plex', '', '#E5A00D'],
    ['org.jellyfin.webos', 'Jellyfin', 'icons/jellyfin.svg'], ['com.crunchyroll.webapp', 'Crunchyroll', '', '#F47521'],
    ['com.webos.app.browser', 'Web Browser', '', '#3A7BD5']
  ];

  function knownApps(done) {
    var found = [], left = KNOWN.length, sent = false;
    function finish() {
      if (sent) return;
      sent = true;
      done(found.filter(function (x) { return x; }));
    }
    setTimeout(finish, 5000);   // an id that never answers doesn't hold the rest
    KNOWN.forEach(function (k, i) {
      luna('luna://com.webos.applicationManager/getAppLoadStatus', {appId: k[0]}, function (res) {
        if (res && res.exist) found[i] = {id: k[0], title: k[1], icon: k[2] || '', color: k[3] || ''};
        if (--left === 0) finish();
      });
    });
  }

  var self = 'de.msbsh.freemytvlg';
  if (webos && window.PalmSystem && window.PalmSystem.identifier) self = window.PalmSystem.identifier.split(' ')[0];

  // MARK: - About this TV

  /** done({model, firmware, system, version, ip}), with '' for what the TV doesn't tell. */
  function about(done) {
    var out = {model: '', firmware: '', system: '', version: '', ip: ''}, left = 1, sent = false;
    function wait() { left++; }
    function finish() {
      if (--left > 0 || sent) return;
      sent = true;
      clearTimeout(timer);
      done(out);
    }
    var timer = setTimeout(function () { left = 1; finish(); }, 4000);   // a service that never answers doesn't hold the rest

    if (webos) {
      // The services LG's webOSTV.js reads for webOS.deviceInfo, and its public connection manager.
      wait();
      luna('luna://com.webos.service.tv.systemproperty/getSystemInfo', {keys: ['modelName', 'firmwareVersion', 'sdkVersion']}, function (res) {
        if (res) {
          out.model = res.modelName || '';
          out.firmware = res.firmwareVersion || '';
          if (!out.system && res.sdkVersion) out.system = 'webOS ' + res.sdkVersion;
        }
        finish();
      });
      wait();
      luna('luna://com.webos.service.systemservice/osInfo/query', {parameters: ['webos_release']}, function (res) {
        if (res && res.webos_release) out.system = 'webOS ' + res.webos_release;
        finish();
      });
      wait();
      luna('luna://com.palm.connectionmanager/getStatus', {}, function (res) {
        if (res) {
          var wired = res.wired || {}, wifi = res.wifi || {};
          if (wired.state === 'connected' && wired.ipAddress) out.ip = wired.ipAddress;
          else if (wifi.state === 'connected' && wifi.ipAddress) out.ip = wifi.ipAddress;
        }
        finish();
      });
      wait();
      // The app's own version: its appinfo.json, beside index.html.
      var x = new XMLHttpRequest();
      x.onreadystatechange = function () {
        if (x.readyState !== 4) return;
        try { out.version = JSON.parse(x.responseText).version || ''; } catch (e) {}
        finish();
      };
      try { x.open('GET', 'appinfo.json', true); x.send(); } catch (e) { finish(); }
    } else {
      out = {model: 'OLED55C1', firmware: '03.33.85', system: 'webOS 6.0', version: 'preview', ip: '192.168.1.50'};
    }
    finish();
  }

  // MARK: - The TV

  return {
    name: webos ? 'webos' : 'browser',

    /** Installed apps, as the TV's launcher lists them: [{id, title, icon, color}]. */
    apps: function (done) {
      if (!webos) {
        done(SAMPLE.map(function (s) { return {id: s[0], title: s[1], icon: '', color: s[2]}; }));
        return;
      }
      function list(res) {
        var out = [];
        var points = res && res.launchPoints ? res.launchPoints : [];
        for (var i = 0; i < points.length; i++) {
          var p = points[i];
          if (!p.id || p.id === self || HIDDEN.test(p.id)) continue;
          out.push({id: p.id, title: p.title || p.id, icon: p.largeIcon || p.icon || '', color: p.bgColor || p.iconColor || ''});
        }
        return out;
      }
      luna('luna://com.webos.applicationManager/listLaunchPoints', {}, function (res) {
        if (res) { done(list(res)); return; }
        // Denied to Developer Mode apps (webOS 6 and newer): once the TV has allowed the remote control API, it lists
        // every app with its icon; until then, the known apps the TV says it has, while the TV asks once (an answer
        // only counts from the next load on, and a "no" isn't asked again).
        var paired = false, refused = false;
        try { paired = !!localStorage.getItem(SSAP_KEY); refused = !!localStorage.getItem(SSAP_REFUSED); } catch (e) {}
        if (paired) {
          ssap('com.webos.applicationManager/listLaunchPoints', function (res2) {
            if (res2) done(list(res2)); else knownApps(done);
          });
          return;
        }
        knownApps(done);
        if (!refused) ssap('com.webos.applicationManager/listLaunchPoints', function () {});
      });
    },

    /** Opens an app (or an input); done(ok). */
    launch: function (id, params, done) {
      if (!webos) {
        if (done) setTimeout(function () { done(true); }, 0);
        return;
      }
      luna('luna://com.webos.applicationManager/launch', params ? {id: id, params: params} : {id: id}, function (res) {
        if (done) done(!!res);
      });
    },

    /** The antenna and HDMI inputs; `connected` when the TV says a device is on (when it tells). */
    inputs: function (done) {
      var list = INPUTS.map(function (x) { return {id: x.id, key: x.key, label: x.label, symbol: x.symbol, connected: true}; });
      if (!webos) {
        list[2].connected = false;
        list[3].connected = false;
        list[4].connected = false;
        done(list);
        return;
      }
      luna('luna://com.webos.service.eim/getAllInputStatus', {}, function (res) {
        var devices = res && res.devices ? res.devices : null;
        if (devices) {
          for (var i = 1; i < list.length; i++) {
            for (var j = 0; j < devices.length; j++) {
              var d = devices[j];
              if (d.appId !== list[i].id) continue;
              list[i].connected = d.connected !== false;
              // A name the person gave the input on the TV ("PS5"), if any.
              if (d.label && !/^hdmi\s*\d$/i.test(d.label)) list[i].label = d.label;
            }
          }
        }
        done(list);
      });
    },

    /** The TV's own settings; done(ok). */
    settings: function (done) {
      this.launch('com.palm.app.settings', null, done);
    },

    /** The TV's model, firmware, system, IP address and this app's version, for About this TV. */
    about: about,

    /** LG: keeps the TV's screensaver away while ours will take over (`hold` says when). */
    holdScreenSaver: holdScreenSaver,

    /** Back on the first screen: back to wherever the person came from. */
    back: function () {
      if (window.PalmSystem && window.PalmSystem.platformBack) window.PalmSystem.platformBack();
    },

    /** The TV's time zone ("America/Sao_Paulo"), or ''. */
    zone: function () {
      try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
    },

    /** Key codes: the arrows, OK and the TV's Back (461). */
    keys: {left: 37, up: 38, right: 39, down: 40, ok: 13, back: 461}
  };
})();
