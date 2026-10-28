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

test('inputs, Live TV and the TV\'s settings', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await m.press(page, s.net, 'Down');
  await snap(page, 'drawer');
  await calls(page, 'launch-inputs', async () => {
    await m.moveTo(page, s.net, '#drawer .key', 'PS5', true);
    await m.press(page, s.net, 'Enter');
    await m.moveTo(page, s.net, '#drawer .key', 'HDMI 2', true);
    await m.press(page, s.net, 'Enter');
    await m.moveTo(page, s.net, '#drawer .key', 'Live TV', true);
    await m.press(page, s.net, 'Enter');
    await m.moveTo(page, s.net, '#drawer .key', 'TV Settings', true);
    await m.press(page, s.net, 'Enter');
  });
  await calls(page, 'top-buttons', async () => {
    await m.press(page, s.net, 'Up', 'Up', 'Up', 'Right', 'Right', 'Right', 'Enter');
    await snap(page, 'hdmi-button');
    await m.press(page, s.net, 'Up', 'Up', 'Up', 'Right', 'Right', 'Right', 'Left', 'Enter');
  });
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
  await m.moveTo(page, s.net, '#drawer .key', 'Home Settings', true);
  await m.press(page, s.net, 'Enter');
  await snap(page, 'settings');
  await m.moveTo(page, s.net, '#settings .row', 'About this TV');
  await calls(page, 'about', () => m.press(page, s.net, 'Enter'));
  await snap(page, 'about');
  await calls(page, 'tv-settings-row', async () => {
    await m.press(page, s.net, 'Back');
    await m.moveTo(page, s.net, '#settings .row', 'TV Settings');
    await m.press(page, s.net, 'Enter');
  });
  s.check();
});

test('LG\'s screensaver waits for ours', async ({page}) => {
  const s = await m.open(page, {tv: {launchPoints: true}});
  await calls(page, 'screensaver', async () => {
    await page.evaluate(() => window.__askSaver(1001));   // the shelf: ours will show, the TV's waits
    await m.settle(page, s.net);
    await m.press(page, s.net, 'Down');
    await m.moveTo(page, s.net, '#drawer .key', 'Home Settings', true);
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
