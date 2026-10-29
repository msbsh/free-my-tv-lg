// The home screen on a fake webOS TV (mock.js): the Luna calls it makes, the remote control API and what each shows.
// The app's id is the fake TV's (test.app), so these don't change with the id in appinfo.json.
const {test, expect} = require('@playwright/test');
const m = require('./mock');

async function snap(page, name) {
  expect(await m.dom(page)).toMatchSnapshot(name + '.txt');
  await m.screenshot(page, name + '.png');
}

async function trace(page) {
  return page.evaluate(() => JSON.stringify({luna: window.__luna, ws: window.__ws, palm: window.__palm}, null, 1) + '\n');
}

async function clearTrace(page) {
  await page.evaluate(() => { window.__luna.length = 0; window.__ws.length = 0; window.__palm.length = 0; });
}

/** Runs `steps`, then checks the Luna, WebSocket and PalmSystem calls they made against `name`. */
async function calls(page, name, steps) {
  await clearTrace(page);
  await steps();
  expect(await trace(page)).toMatchSnapshot(name + '-calls.json');
}

test('the TV lists its apps (listLaunchPoints)', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  expect(await trace(page)).toMatchSnapshot('start-calls.json');
  await snap(page, 'start');
  expect(m.requests(s.net)).toMatchSnapshot('start-requests.txt');

  await calls(page, 'launch-app', () => m.press(page, s.net, 'Right', 'Enter'));
  await calls(page, 'launch-fails', async () => {
    await m.press(page, s.net, 'Down');
    await m.moveTo(page, s.net, '#drawer .key', 'All Apps', true);
    await m.press(page, s.net, 'Enter');
    await snap(page, 'all-apps');
    await m.moveTo(page, s.net, '#apps .cell', 'Broken App', true);
    await m.press(page, s.net, 'Enter');
  });
  await snap(page, 'launch-failed-toast');
  s.check();
});

test('picks open their app', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await calls(page, 'launch-pick', () => m.press(page, s.net, 'Up', 'Enter', 'Right', 'Enter', 'Right', 'Enter'));
  s.check();
});

test('inputs and Live TV', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await m.press(page, s.net, 'Down');
  await snap(page, 'drawer');   // HDMI 2 and 4, with nothing plugged in, aren't there
  await calls(page, 'launch-inputs', async () => {
    await m.moveTo(page, s.net, '#drawer .key', 'PS5', true);
    await m.press(page, s.net, 'Enter');
    await m.moveTo(page, s.net, '#drawer .key', 'HDMI 3', true);
    await m.press(page, s.net, 'Enter');
    await m.moveTo(page, s.net, '#drawer .key', 'Live TV', true);
    await m.press(page, s.net, 'Enter');
  });
  s.check();
});

test('an input shows once a device is plugged in, and goes when it\'s out', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await m.press(page, s.net, 'Down');
  await m.moveTo(page, s.net, '#drawer .key', 'All Apps', true);
  await page.evaluate(() => window.__plug('com.webos.app.hdmi4', true));
  await m.settle(page, s.net);
  await snap(page, 'input-plugged');   // Apple TV among the inputs, the focus still on All Apps
  await page.evaluate(() => window.__plug('com.webos.app.hdmi1', false));
  await m.settle(page, s.net);
  await snap(page, 'input-unplugged');   // PS5 gone, the focus still on All Apps
  s.check();
});

test('Back on the shelf goes back to the TV', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await calls(page, 'back', () => m.press(page, s.net, 'Up', 'Back', 'Back'));
  s.check();
});

test('About this TV', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await m.press(page, s.net, 'Down');
  await m.moveTo(page, s.net, '#drawer .key', 'Settings', true);
  await m.press(page, s.net, 'Enter');
  await snap(page, 'settings');
  await m.moveTo(page, s.net, '#settings .row', 'About this TV');
  await calls(page, 'about', () => m.press(page, s.net, 'Enter'));
  await snap(page, 'about');
  s.check();
});

test('LG\'s screensaver waits for ours', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await calls(page, 'screensaver', async () => {
    await page.evaluate(() => window.__askSaver(1001));   // the shelf: ours will show, the TV's waits
    await m.settle(page, s.net);
    await m.press(page, s.net, 'Down');
    await m.moveTo(page, s.net, '#drawer .key', 'Settings', true);
    await m.press(page, s.net, 'Enter');
    await page.evaluate(() => window.__askSaver(1002));   // a sheet open: the TV's may run
    await m.settle(page, s.net);
  });
  s.check();
});

test('opened again while running (webOSRelaunch)', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await m.press(page, s.net, 'Down');
  await calls(page, 'relaunch', async () => {
    await page.evaluate(() => document.dispatchEvent(new Event('webOSRelaunch')));
    await m.settle(page, s.net);
  });
  await snap(page, 'relaunched');
  s.check();
});

test('listLaunchPoints denied: known apps, and the TV is asked once', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'pending'}});
  expect(await trace(page)).toMatchSnapshot('denied-calls.json');
  await snap(page, 'denied');
  expect(await m.storage(page)).toMatchSnapshot('denied-storage.txt');
  s.check();
});

test('listLaunchPoints denied, the TV allowed the remote control API', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'ok', storage: {'fmtv.ssapKey': 'old-key'}}});
  expect(await trace(page)).toMatchSnapshot('paired-calls.json');
  await snap(page, 'paired');
  expect(await m.storage(page)).toMatchSnapshot('paired-storage.txt');
  s.check();
});

test('listLaunchPoints denied, first time allowed on the TV', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'ok'}});
  expect(await trace(page)).toMatchSnapshot('pairing-calls.json');
  await snap(page, 'pairing');
  expect(await m.storage(page)).toMatchSnapshot('pairing-storage.txt');
  s.check();
});

test('listLaunchPoints denied, the page\'s origin refused: through the service', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'origin', storage: {'fmtv.ssapKey': 'old-key'}}});
  expect(await trace(page)).toMatchSnapshot('service-calls.json');
  await snap(page, 'service');
  expect(await m.storage(page)).toMatchSnapshot('service-storage.txt');
  s.check();
});

test('listLaunchPoints denied, the person said no on the TV', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'refused'}});
  expect(await trace(page)).toMatchSnapshot('refused-calls.json');
  expect(await m.storage(page)).toMatchSnapshot('refused-storage.txt');
  await page.reload();
  await m.settle(page, s.net);
  expect(await trace(page)).toMatchSnapshot('refused-reload-calls.json');
  await snap(page, 'refused');
  s.check();
});

// MARK: - The apps and their logos, kept across starts

/** Counts the logos lifted off icons (each reads the icon's pixels once). */
async function countLifts(page) {
  await page.addInitScript(() => {
    const read = CanvasRenderingContext2D.prototype.getImageData;
    window.__lifts = 0;
    CanvasRenderingContext2D.prototype.getImageData = function () { window.__lifts++; return read.apply(this, arguments); };
  });
}

/** The TV for the next load (mock.js), then that load. */
async function restart(page, net, tv) {
  if (tv) await page.evaluate((t) => sessionStorage.setItem('__tv', JSON.stringify(t)), tv);
  await page.reload();
  await m.settle(page, net);
}

const shelfApps = (page) => page.evaluate(() => Array.prototype.map.call(document.querySelectorAll('#tiles .tile .word'), (w) => w.textContent));
const logos = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('fmtv.logos')));

test('the logos are kept: the next start draws them at once, without lifting them again', async ({page}) => {
  await countLifts(page);
  const s = await m.open(page, {tv: {launchPoints: true}});
  expect(await page.evaluate(() => window.__lifts)).toBeGreaterThan(0);
  expect(Object.keys((await logos(page)).apps).sort()).toEqual(['amazon', 'netflix', 'youtube.leanback.v4']);
  const quote = () => page.locator('#quote .text').textContent();
  const first = await m.dom(page), firstQuote = await quote();
  await restart(page, s.net);
  expect(await page.evaluate(() => window.__lifts)).toBe(0);
  // The same screen, but for the quote: each start brings another.
  expect(await quote()).not.toBe(firstQuote);
  expect(await m.dom(page)).toBe(first.replace(firstQuote, await quote()));
  s.check();
});

test('back from another app, or opened again: the shelf is drawn again only when the apps change', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await page.evaluate(() => { document.querySelector('#tiles .tile img').__kept = true; });
  await clearTrace(page);
  await page.evaluate(() => {
    document.dispatchEvent(new Event('webOSRelaunch'));
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await m.settle(page, s.net);
  expect(await page.evaluate(() => document.querySelector('#tiles .tile img').__kept)).toBe(true);
  // Both ask for the apps at once: the TV is asked once.
  expect(await page.evaluate(() => window.__luna.filter((c) => /listLaunchPoints$/.test(c.uri)).length)).toBe(1);
  s.check();
});

test('the TV lists only the known apps this time: the last full list stays', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'ok', storage: {'fmtv.ssapKey': 'old-key'}}});
  const full = await shelfApps(page);
  expect(full).toContain('Disney+');
  await restart(page, s.net, {ws: 'refused'});   // the remote control API doesn't answer: known apps only
  expect(await shelfApps(page)).toEqual(full);
  s.check();
});

test('an app gone: its logo goes too; an icon that doesn\'t load keeps its logo', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  const netflix = (await logos(page)).apps.netflix;
  const points = m.LAUNCH_POINTS.filter((p) => p.id !== 'amazon')
    .map((p) => p.id === 'netflix' ? Object.assign({}, p, {icon: 'icons/missing.svg'}) : p);
  await restart(page, s.net, {points});
  const kept = (await logos(page)).apps;
  expect(Object.keys(kept).sort()).toEqual(['netflix', 'youtube.leanback.v4']);
  expect(kept.netflix).toEqual(netflix);
  expect(await page.evaluate(() => document.querySelector('#tiles .tile img').className)).toBe('logo');
  s.check();
});

test('Home Assistant beside the remote control API: two WebSockets', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: false, ws: 'ok'}, config: m.HA_CONFIG, ha: {}});
  await expect(page.locator('#hatop .value')).toHaveCount(3);
  expect(await page.evaluate(() => window.__ws.some((x) => x.open === 'ws://127.0.0.1:3000'))).toBe(true);
  expect(await page.evaluate(() => window.__ha.some((x) => x.open === 'ws://ha.test:8123/api/websocket'))).toBe(true);
  s.check();
});

// MARK: - ARD Mediathek, KiKA and ARTE

const MEDIATHEKEN = m.LAUNCH_POINTS.concat([{id: 'ard.mediathek', title: 'ARD Mediathek'},
  {id: 'de.kika.tvplayer.lge', title: 'KiKA'}, {id: 'com.3827031.168353', title: 'ARTE'}]);

/** The picks as "Title | App · meta", in the row's order. */
/** Every pick's card, in the row's order: only the ones near the view are drawn, so each is brought there in turn. */
async function cards(page) {
  return page.evaluate(() => {
    const st = FreeMyTV.state, was = st.card, out = [];
    for (let k = 0; k < Data.picks().length; k++) {
      st.card = k;
      FreeMyTV.move(0, 0);
      const c = [...document.querySelectorAll('#cards .card')].find((x) => x.at === k), meta = c.querySelector('.meta');
      out.push({text: c.querySelector('.name').textContent + ' | ' + (meta ? meta.textContent : ''),
        art: c.querySelector('.layer').style.backgroundImage});
    }
    st.card = was;
    FreeMyTV.move(0, 0);
    return out;
  });
}

async function picks(page) {
  return (await cards(page)).map((c) => c.text);
}

const MEDIA_PICKS = [
  'Babylon Berlin | ARD Mediathek · Series',
  'Das Erste | ARD Mediathek · Live',
  'Der Sternwanderer | ARTE · 2h 7m · 22 days left',
  'Happy Halloween | KiKA · 1, 2 oder 3 · 24m',
  'KiKA | KiKA · Live',
  'Mord im Mittsommer | ARTE · Tod am See · 1h 30m · Until Apr 2027',
  'Shaun das Schaf | KiKA · Series',
  'Tatort: Im Moor | ARD Mediathek · Tatort · 1h 29m · 6 days left',
  'Twin Peaks | ARTE · Series',
  'Weltspiegel | ARD Mediathek · 45m · Until Oct 2031',
  'arte | ARTE · Live',
];

test('ARD Mediathek, KiKA and ARTE without a TMDB key: their top rows and live streams; OK opens the app', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true, points: MEDIATHEKEN}, prefs: {tmdbKey: '', cards: 12}});
  expect(m.requests(s.net)).toMatchSnapshot('mediatheken-requests.txt');   // before picks() draws every card
  expect((await picks(page)).sort()).toEqual(MEDIA_PICKS);
  expect(s.net.requests.filter((r) => r.indexOf('api.tmdb.org') >= 0)).toEqual([]);
  // ARD's images at the card's width, ARTE's at its nearest size.
  const art = (await cards(page)).map((c) => c.art);
  expect(art.filter((u) => /ardmediathek/.test(u)).every((u) => /w=780/.test(u))).toBe(true);
  expect(art.filter((u) => /arte\.tv/.test(u)).every((u) => /\/1280x720/.test(u))).toBe(true);

  const first = (await picks(page))[0], app = first.split(' | ')[1].split(' · ')[0];
  await clearTrace(page);
  await m.press(page, s.net, 'Up', 'Enter');
  const launched = await page.evaluate(() => window.__luna.filter((c) => /launch$/.test(c.uri)).map((c) => c.params.id));
  expect(launched).toEqual([{'ARD Mediathek': 'ard.mediathek', 'KiKA': 'de.kika.tvplayer.lge', 'ARTE': 'com.3827031.168353'}[app]]);
  s.check();
});

test('Mediatheken: mixed with TMDB\'s picks; Picks from and Live streams switch them off', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true, points: MEDIATHEKEN}, prefs: {cards: 12}});
  let list = await picks(page);
  expect(list.length).toBe(12);
  expect(list.filter((p) => !/ \| (Netflix|Prime Video|Disney\+|ARD Mediathek|KiKA|ARTE)( · |$)/.test(p))).toEqual([]);
  expect(list.some((p) => /^(Movie|Show) /.test(p))).toBe(true);
  expect(list.some((p) => MEDIA_PICKS.indexOf(p) >= 0)).toBe(true);

  await m.press(page, s.net, 'Down');
  await m.moveTo(page, s.net, '#drawer .key', 'Settings', true);
  await m.press(page, s.net, 'Enter');
  for (const row of ['ARD Mediathek', 'KiKA', 'ARTE', 'Live streams']) {
    await m.moveTo(page, s.net, '#settings .row', row);
    if (row !== 'KiKA') await m.press(page, s.net, 'Enter');
  }
  expect(await m.storage(page)).toMatchSnapshot('mediatheken-off-storage.txt');
  await m.press(page, s.net, 'Back', 'Back');
  list = await picks(page);
  expect(list.length).toBe(12);
  expect(list.filter((p) => / \| (ARD Mediathek|ARTE) /.test(p) || / · Live$/.test(p))).toEqual([]);
  s.check();
});
