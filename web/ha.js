/*
 * Home Assistant, read only: the states of the entities in Settings (Prefs.haTop, Prefs.haPanel), live over its
 * WebSocket API (subscribe_entities), the last ones kept for the next start and for when it can't be reached.
 * A WebSocket, not REST: Home Assistant answers the page's file:// origin only there (REST needs a CORS setting).
 * The token comes only from config.properties (CONFIG.haToken). Never log it.
 */
var HA = (function () {
  'use strict';

  /** The domains the picker on the TV offers; others still show their state as it is. */
  var DOMAINS = ['sensor', 'binary_sensor', 'climate', 'switch', 'light', 'lock', 'cover', 'fan', 'input_boolean',
    'input_number', 'number'];
  /** The attributes the screen uses: the others (a thermostat's modes, a lamp's colors) aren't kept. */
  var KEEP = ['friendly_name', 'unit_of_measurement', 'device_class', 'current_temperature', 'temperature', 'current_position'];
  var RETRY_FIRST = 5000, RETRY_MAX = 300000, PING_EVERY = 60000, GIVE_UP = 10000;

  var ws = null, seq = 0, waiting = {}, subscription = 0;
  var status = 'off';   // off, connecting, live, offline (cached values), rejected (the token)
  // entity id → {s, a, lc}; when they were last live (ms); the address they came from
  var states = {}, at = 0, url = Prefs.haUrl();
  var retryIn = RETRY_FIRST, retryTimer = null, pingTimer = null, giveUpTimer = null, ponged = true;
  var paused = false;
  var listeners = [];

  function changed() { for (var i = 0; i < listeners.length; i++) listeners[i](); }

  function store() {
    try { localStorage.setItem('fmtv.ha', JSON.stringify({url: url, states: states, at: at})); } catch (e) {}
  }
  (function load() {
    var c = null;
    try { c = JSON.parse(localStorage.getItem('fmtv.ha')); } catch (e) {}
    if (c && c.url === url && c.states) { states = c.states; at = c.at || 0; }
  })();

  function wanted() {
    var ids = Prefs.haTop().slice();
    Prefs.haPanel().forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  function socketUrl(url) { return url.replace(/^http/i, 'ws') + '/api/websocket'; }

  // MARK: - The connection

  function connect() {
    if (ws || paused || !Prefs.homeAssistant()) return;
    clearTimeout(retryTimer);
    status = status === 'live' ? 'offline' : status === 'off' ? 'connecting' : status;
    var sock;
    try { sock = new WebSocket(socketUrl(Prefs.haUrl())); } catch (e) { retry(); return; }
    ws = sock;
    giveUpTimer = setTimeout(function () { if (ws === sock && status !== 'live') sock.close(); }, GIVE_UP);
    sock.onmessage = function (e) {
      if (ws !== sock) return;
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      receive(sock, m);
    };
    sock.onclose = function () {
      if (ws !== sock) return;
      ws = null;
      dropped();
    };
  }

  function receive(sock, m) {
    switch (m.type) {
      case 'auth_required':
        sock.send(JSON.stringify({type: 'auth', access_token: CONFIG.haToken}));
        return;
      case 'auth_invalid':
        status = 'rejected';   // no retries until the address or the token changes
        sock.close();
        changed();
        return;
      case 'auth_ok':
        status = 'live';
        retryIn = RETRY_FIRST;
        clearTimeout(giveUpTimer);
        subscribe();
        ponged = true;
        clearInterval(pingTimer);
        pingTimer = setInterval(ping, PING_EVERY);
        changed();
        return;
      case 'pong':
        ponged = true;
        return;
      case 'event':
        if (m.id === subscription && m.event) apply(m.event);
        return;
      case 'result':
        var done = waiting[m.id];
        delete waiting[m.id];
        if (done) done(m.success ? null : new Error((m.error && m.error.code) || 'failed'), m.result);
        return;
    }
  }

  function send(message, done) {
    if (!ws || status !== 'live') { if (done) done(new Error('not connected')); return 0; }
    message.id = ++seq;
    if (done) waiting[message.id] = done;
    ws.send(JSON.stringify(message));
    return message.id;
  }

  function subscribe() {
    var ids = wanted();
    subscription = 0;
    if (!ids.length) { at = Date.now(); store(); return; }
    subscription = send({type: 'subscribe_entities', entity_ids: ids});
  }

  /** A connection that answers no ping is gone (Home Assistant restarted, the network changed): open a new one. */
  function ping() {
    if (!ws) return;
    if (!ponged) { ws.close(); return; }
    ponged = false;
    send({type: 'ping'});
  }

  function dropped() {
    clearInterval(pingTimer);
    clearTimeout(giveUpTimer);
    var fail = waiting;
    waiting = {};
    for (var id in fail) if (fail.hasOwnProperty(id)) fail[id](new Error('not connected'));
    if (status === 'live') { at = Date.now(); store(); }
    if (status !== 'rejected') { status = 'offline'; retry(); }
    changed();
  }

  function retry() {
    clearTimeout(retryTimer);
    if (paused || !Prefs.homeAssistant()) return;
    retryTimer = setTimeout(connect, retryIn);
    retryIn = Math.min(RETRY_MAX, retryIn * 2);
  }

  function close() {
    clearTimeout(retryTimer);
    if (!ws) return;
    var sock = ws;
    ws = null;
    sock.close();
    dropped();
    clearTimeout(retryTimer);   // dropped() schedules one; whoever closed decides when to connect again
  }

  // MARK: - subscribe_entities: {a: added, c: changed (+ fields, - attributes), r: removed}, times in seconds

  function kept(a) {
    var out = {};
    for (var i = 0; a && i < KEEP.length; i++) if (a[KEEP[i]] !== undefined) out[KEEP[i]] = a[KEEP[i]];
    return out;
  }

  function apply(event) {
    var id, x;
    if (event.a) {
      for (id in event.a) {
        if (!event.a.hasOwnProperty(id)) continue;
        x = event.a[id];
        states[id] = {s: x.s, a: kept(x.a), lc: Math.round((x.lc || x.lu || 0) * 1000)};
      }
    }
    if (event.c) {
      for (id in event.c) {
        if (!event.c.hasOwnProperty(id) || !states[id]) continue;
        var plus = event.c[id]['+'], minus = event.c[id]['-'], old = states[id];
        if (plus) {
          if (plus.s !== undefined) old.s = plus.s;
          if (plus.a) for (var k in plus.a) if (plus.a.hasOwnProperty(k) && KEEP.indexOf(k) >= 0) old.a[k] = plus.a[k];
          if (plus.lc) old.lc = Math.round(plus.lc * 1000);
          else if (plus.s !== undefined && plus.lu) old.lc = Math.round(plus.lu * 1000);
        }
        if (minus && minus.a) for (var r = 0; r < minus.a.length; r++) delete old.a[minus.a[r]];
      }
    }
    if (event.r) for (var i = 0; i < event.r.length; i++) delete states[event.r[i]];
    at = Date.now();
    store();
    changed();
  }

  // MARK: - What it shows

  function domain(id) { return id.split('.')[0]; }

  function number(s, decimals) {
    try { return new Intl.NumberFormat(I18N.locale(), {maximumFractionDigits: decimals}).format(s); } catch (e) { return String(s); }
  }

  /** "21.53" → "21,5" in German: two decimals under 10, one under 100, none above; never more than it came with. */
  function amount(raw) {
    var n = parseFloat(raw), given = (String(raw).split('.')[1] || '').length;
    var a = Math.abs(n), decimals = a < 10 ? 2 : a < 100 ? 1 : 0;
    return number(n, Math.min(decimals, given));
  }

  function withUnit(text, unit) {
    if (!unit) return text;
    return unit === '%' || unit.charAt(0) === '°' ? text + unit : text + ' ' + unit;
  }

  var OPENINGS = ['door', 'garage_door', 'opening', 'window'];
  var ALERTS = ['carbon_monoxide', 'gas', 'moisture', 'motion', 'occupancy', 'presence', 'smoke', 'sound', 'vibration'];

  function binary(on, deviceClass) {
    if (OPENINGS.indexOf(deviceClass) >= 0) return on ? tr('ha|Open') : tr('ha|Closed');
    if (deviceClass === 'lock') return on ? tr('ha|Unlocked') : tr('ha|Locked');
    if (deviceClass === 'problem') return on ? tr('ha|Problem') : tr('ha|OK');
    if (ALERTS.indexOf(deviceClass) >= 0) return on ? tr('ha|Detected') : tr('ha|Clear');
    return on ? tr('ha|On') : tr('ha|Off');
  }

  // Each text in a tr() of its own: tools/translate.py finds only those.
  function climateMode(s) {
    switch (s) {
      case 'off': return tr('ha|Off');
      case 'heat': return tr('climate|Heat');
      case 'cool': return tr('climate|Cool');
      case 'heat_cool': return tr('climate|Heat/Cool');
      case 'auto': return tr('climate|Auto');
      case 'dry': return tr('climate|Dry');
      case 'fan_only': return tr('climate|Fan');
    }
    return s;
  }

  function coverState(s) {
    switch (s) {
      case 'open': return tr('ha|Open');
      case 'closed': return tr('ha|Closed');
      case 'opening': return tr('ha|Opening');
      case 'closing': return tr('ha|Closing');
    }
    return s;
  }

  function lockState(s) {
    switch (s) {
      case 'locked': return tr('ha|Locked');
      case 'unlocked': return tr('ha|Unlocked');
      case 'open': return tr('ha|Open');
      case 'jammed': return tr('ha|Jammed');
      case 'locking': return tr('ha|Locking');
      case 'unlocking': return tr('ha|Unlocking');
    }
    return s;
  }

  /**
   * An entity as the screen shows it: {id, name, value, note, on, symbol, missing}. on is true or false for the ones that
   * are on or off (the screen dims the off ones), else null.
   */
  function view(id) {
    var x = states[id], d = domain(id);
    var out = {id: id, name: id, value: '—', note: '', on: null, symbol: symbolFor(d, null, null), missing: !x};
    if (!x) return out;
    var a = x.a || {}, dc = a.device_class || null;
    out.name = a.friendly_name || id;
    out.symbol = symbolFor(d, dc, a.unit_of_measurement);
    if (x.s === 'unavailable' || x.s === 'unknown') { out.missing = true; return out; }
    switch (d) {
      case 'binary_sensor': case 'switch': case 'light': case 'fan': case 'input_boolean':
        out.on = x.s === 'on';
        out.value = binary(out.on, d === 'binary_sensor' ? dc : null);
        return out;
      case 'lock':
        out.on = x.s !== 'locked';
        out.value = lockState(x.s);
        return out;
      case 'cover':
        out.on = x.s !== 'closed';
        var p = a.current_position;
        out.value = x.s === 'open' && typeof p === 'number' && p > 0 && p < 100 ? number(p, 0) + '%' : coverState(x.s);
        return out;
      case 'climate':
        out.on = x.s !== 'off';
        out.value = typeof a.current_temperature === 'number' ? amount(a.current_temperature) + '°' : '—';
        var mode = climateMode(x.s);
        out.note = typeof a.temperature === 'number' && x.s !== 'off'
          ? trf('climate|{mode}, set to {target}', {mode: mode, target: amount(a.temperature) + '°'}) : mode;
        return out;
    }
    out.value = /^-?\d+(\.\d+)?$/.test(x.s) ? withUnit(amount(x.s), a.unit_of_measurement) : x.s;
    return out;
  }

  /** A number from the history as the screen shows it: with the entity's unit ("°" for a thermostat). */
  function amountOf(id, n) {
    var x = states[id], unit = domain(id) === 'climate' ? '°' : x && x.a ? x.a.unit_of_measurement : '';
    return withUnit(amount(n), unit);
  }

  /** Whether a state from the history counts as on (open, unlocked…), for the ones that are on or off. */
  function isOn(id, s) {
    var d = domain(id);
    if (d === 'lock') return s !== 'locked';
    if (d === 'cover') return s !== 'closed';
    return s === 'on';
  }

  function symbolFor(d, dc, unit) {
    if (d === 'climate') return 'thermostat';
    if (d === 'light') return 'lightbulb';
    if (d === 'lock' || dc === 'lock') return 'lock';
    if (d === 'cover') return 'blinds';
    if (dc === 'temperature' || unit === '°C' || unit === '°F') return 'thermostat';
    if (dc === 'humidity' || dc === 'moisture') return 'water_drop';
    if (dc === 'power' || dc === 'energy' || unit === 'W' || unit === 'kW' || unit === 'kWh') return 'bolt';
    if (dc === 'window') return 'window';
    if (OPENINGS.indexOf(dc) >= 0) return 'door';
    if (dc === 'motion' || dc === 'occupancy' || dc === 'presence') return 'motion';
    if (d === 'switch' || d === 'input_boolean' || d === 'fan') return 'toggle';
    return 'home';
  }

  // MARK: - On request

  /** The last 24 hours: done(error, [{t (ms), s (state), v (number or null)}]) from the oldest. */
  function history(id, done) {
    var now = Date.now(), d = domain(id);
    send({type: 'history/history_during_period', start_time: new Date(now - 864e5).toISOString(),
      entity_ids: [id], minimal_response: d !== 'climate', no_attributes: d !== 'climate',
      significant_changes_only: false}, function (err, result) {
      if (err) { done(err); return; }
      var list = (result && result[id]) || [], out = [];
      for (var i = 0; i < list.length; i++) {
        var x = list[i], t = Math.round((x.lu || x.lc || 0) * 1000), v = null;
        if (d === 'climate') v = x.a && typeof x.a.current_temperature === 'number' ? x.a.current_temperature : null;
        else if (/^-?\d+(\.\d+)?$/.test(x.s)) v = parseFloat(x.s);
        out.push({t: Math.max(t, now - 864e5), s: x.s, v: v});
      }
      done(null, out);
    });
  }

  /** Every entity the picker offers: done(error, [{id, name}]) by name. */
  function entities(done) {
    send({type: 'get_states'}, function (err, result) {
      if (err) { done(err); return; }
      var out = [];
      for (var i = 0; i < (result || []).length; i++) {
        var x = result[i];
        if (DOMAINS.indexOf(domain(x.entity_id)) < 0) continue;
        out.push({id: x.entity_id, name: (x.attributes && x.attributes.friendly_name) || x.entity_id});
      }
      out.sort(function (a, b) { return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : a.name.toLowerCase() > b.name.toLowerCase() ? 1 : 0; });
      done(null, out);
    });
  }

  /** Tries an address with the token, on its own connection: done(null) or done('rejected' or 'unreachable'). */
  function check(url, done) {
    var sock, over = false;
    function end(result) {
      if (over) return;
      over = true;
      clearTimeout(timer);
      try { sock.close(); } catch (e) {}
      done(result);
    }
    var timer = setTimeout(function () { end('unreachable'); }, GIVE_UP);
    try { sock = new WebSocket(socketUrl(url)); } catch (e) { end('unreachable'); return; }
    sock.onmessage = function (e) {
      var m;
      try { m = JSON.parse(e.data); } catch (err) { return; }
      if (m.type === 'auth_required') sock.send(JSON.stringify({type: 'auth', access_token: CONFIG.haToken}));
      else if (m.type === 'auth_ok') end(null);
      else if (m.type === 'auth_invalid') end('rejected');
    };
    sock.onclose = function () { end('unreachable'); };
  }

  return {
    onChange: function (fn) { listeners.push(fn); },
    /** off, connecting, live, offline or rejected. */
    get status() { return Prefs.homeAssistant() ? status : 'off'; },
    /** When the values shown were last live (ms), for "as of" while it can't be reached. */
    get at() { return at; },
    hasToken: function () { return !!CONFIG.haToken; },
    view: view,
    amountOf: amountOf,
    isOn: isOn,
    history: history,
    entities: entities,
    check: check,
    start: function () { paused = false; connect(); },
    /** Another app is in front: no connection until the home screen shows again. */
    pause: function () { paused = true; close(); },
    /** The lists changed in Settings: the same connection, another subscription. */
    listsChanged: function () {
      if (status !== 'live') { changed(); return; }
      if (subscription) send({type: 'unsubscribe_events', subscription: subscription});
      subscribe();
      changed();
    },
    /** The address or the switch changed in Settings: start over. */
    restart: function () {
      close();
      if (Prefs.haUrl() !== url) { url = Prefs.haUrl(); states = {}; at = 0; }
      status = Prefs.homeAssistant() ? 'connecting' : 'off';
      retryIn = RETRY_FIRST;
      changed();
      connect();
    }
  };
})();
