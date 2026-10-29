// The home screen in the browser stand-in (tv.js's sample apps): what it shows and how the remote moves through it.
const {test, expect} = require('@playwright/test');
const m = require('./mock');

async function snap(page, name) {
  expect(await m.dom(page)).toMatchSnapshot(name + '.txt');
  await m.screenshot(page, name + '.png');
}

/** From the shelf to Settings, through the drawer. */
async function openSettings(page, net) {
  await m.press(page, net, 'Down');
  await m.moveTo(page, net, '#drawer .key', 'Settings', true);
  await m.press(page, net, 'Enter');
}

test('start: picks, shelf and weather', async ({page}) => {
  const s = await m.open(page);
  await snap(page, 'start');
  // Only titles with their details show: each card names its app.
  expect(await page.$$eval('#cards .card', (c) => c.filter((x) => !x.querySelector('.meta .app')).length)).toBe(0);
  expect(m.requests(s.net)).toMatchSnapshot('start-requests.txt');
  expect(await m.storage(page)).toMatchSnapshot('start-storage.txt');
  s.check();
});

test('night', async ({page}) => {
  const s = await m.open(page, {at: m.NIGHT});
  await snap(page, 'night');
  expect(await m.storage(page)).toMatchSnapshot('night-storage.txt');
  s.check();
});

test('dark and light themes', async ({page}) => {
  const s = await m.open(page, {prefs: {theme: 'dark'}});
  await snap(page, 'theme-dark');
  s.check();
});

test('the remote moves through the shelf and the picks; nothing above them without Home Assistant', async ({page}) => {
  const s = await m.open(page);
  await m.press(page, s.net, 'Right', 'Right', 'Right');
  await snap(page, 'shelf-right-3');
  await m.press(page, s.net, 'Left', 'Up');
  await snap(page, 'cards');
  await m.press(page, s.net, 'Right', 'Up');
  await expect(page.locator('#cards .card.focus')).toHaveCount(1);
  await snap(page, 'cards-up');
  await m.press(page, s.net, 'Right', 'Right');
  await snap(page, 'cards-last');
  await m.press(page, s.net, 'Down');
  await snap(page, 'back-down');
  s.check();
});

test('the picks take turns being the wide one, endlessly; not while one has focus, nor for 30 s after', async ({page}) => {
  const s = await m.open(page);
  const wide = () => page.evaluate(() => {
    const w = document.querySelector('#cards .card.wide .name');
    return [FreeMyTV.state.card, w && w.textContent];
  });
  const [first, title] = await wide();
  await page.clock.runFor(6000);   // with open's 6 s: 12 s
  expect((await wide())[0]).toBe(first + 1);
  await page.clock.runFor(24000);   // past the last of the three picks: the first again, on the right
  expect(await wide()).toEqual([first + 3, title]);
  await m.press(page, s.net, 'Up');
  const held = (await wide())[0];
  await page.clock.runFor(60000);
  expect((await wide())[0]).toBe(held);
  await m.press(page, s.net, 'Down');   // 6 s
  await page.clock.runFor(23000);
  expect((await wide())[0]).toBe(held);
  await page.clock.runFor(2000);
  expect((await wide())[0]).toBe(held + 1);
  s.check();
});

test('without a TMDB key nothing above the shelf takes the focus; the quote stays', async ({page}) => {
  const s = await m.open(page, {prefs: {tmdbKey: ''}});
  await m.press(page, s.net, 'Up');
  await expect(page.locator('#tiles .focus')).toHaveCount(1);
  await snap(page, 'no-key');
  s.check();
});

test('drawer, All Apps and Back', async ({page}) => {
  const s = await m.open(page);
  await m.press(page, s.net, 'Down');
  await snap(page, 'drawer');
  await m.press(page, s.net, 'Right');
  await snap(page, 'drawer-right');
  await m.moveTo(page, s.net, '#drawer .key', 'All Apps', true);
  await m.press(page, s.net, 'Enter');
  await snap(page, 'all-apps');
  await m.press(page, s.net, 'Right', 'Down');
  await snap(page, 'all-apps-moved');
  await m.press(page, s.net, 'Back');
  await snap(page, 'all-apps-closed');
  await m.press(page, s.net, 'Back', 'Back');
  await snap(page, 'back-to-shelf');
  s.check();
});

test('Settings: every row and its values', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await snap(page, 'settings');
  await m.moveTo(page, s.net, '#settings .row', 'Temperature');
  await m.press(page, s.net, 'Right');
  await m.moveTo(page, s.net, '#settings .row', 'Theme');
  await m.press(page, s.net, 'Right');
  await snap(page, 'settings-light');
  await m.moveTo(page, s.net, '#settings .row', 'Picks per hour');
  await m.press(page, s.net, 'Enter');
  await m.moveTo(page, s.net, '#settings .row', 'Forecast');
  await m.press(page, s.net, 'Right');
  await m.moveTo(page, s.net, '#settings .row', 'Netflix');
  await m.press(page, s.net, 'Enter');
  await m.moveTo(page, s.net, '#settings .row', 'Watch from the screensaver');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'settings-changed');
  expect(await m.storage(page)).toMatchSnapshot('settings-changed-storage.txt');
  await m.press(page, s.net, 'Back');
  await snap(page, 'settings-closed');
  await m.press(page, s.net, 'Up');
  await snap(page, 'settings-closed-drawer-up');
  expect(m.requests(s.net)).toMatchSnapshot('settings-requests.txt');
  s.check();
});

test('Settings: weather widget off', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'Weather widget');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'widgets-off-settings');
  await m.press(page, s.net, 'Back');
  await snap(page, 'widgets-off');
  await m.press(page, s.net, 'Down');
  await snap(page, 'widgets-off-drawer');   // the inputs and shortcuts up in the weather's place
  expect(await m.storage(page)).toMatchSnapshot('widgets-off-storage.txt');
  s.check();
});

test('Settings: language', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await m.press(page, s.net, 'Enter');
  await snap(page, 'languages');
  await m.moveTo(page, s.net, '#langpick .row', 'Deutsch');
  await snap(page, 'languages-deutsch');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'settings-de');
  await m.press(page, s.net, 'Back', 'Back');
  await snap(page, 'home-de');
  expect(await m.storage(page)).toMatchSnapshot('language-storage.txt');
  expect(m.requests(s.net)).toMatchSnapshot('language-requests.txt');
  s.check();
});

for (const lang of ['de', 'pt', 'ru', 'ja', 'es']) {
  test('start in ' + lang, async ({page}) => {
    const s = await m.open(page, {prefs: {language: lang}});
    await snap(page, 'start-' + lang);
    await m.press(page, s.net, 'Down');
    await snap(page, 'drawer-' + lang);
    expect(m.requests(s.net)).toMatchSnapshot('start-' + lang + '-requests.txt');
    s.check();
  });
}

test('Settings: city', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'City');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'city');
  await page.keyboard.type('Hamburg');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'city-found');
  await m.press(page, s.net, 'Down');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'city-picked');
  expect(await m.storage(page)).toMatchSnapshot('city-storage.txt');
  await m.press(page, s.net, 'Enter');
  await page.keyboard.type('Nowhere');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'city-none');
  await m.press(page, s.net, 'Back', 'Back');
  await snap(page, 'city-cancelled');
  expect(m.requests(s.net)).toMatchSnapshot('city-requests.txt');
  s.check();
});

test('Settings: TMDB key', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'TMDB key');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'key');
  await page.keyboard.type('short');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'key-malformed');
  await m.press(page, s.net, 'Up', 'Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('ffffffffffffffffffffffffffffffff');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'key-refused');
  await m.press(page, s.net, 'Up', 'Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('abcdefabcdefabcdefabcdefabcdef12');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'key-saved');
  expect(await m.storage(page)).toMatchSnapshot('key-saved-storage.txt');
  await m.press(page, s.net, 'Down', 'Down', 'Enter');
  await snap(page, 'key-remove-ask');
  await m.press(page, s.net, 'Down', 'Enter');
  await snap(page, 'key-removed');
  expect(await m.storage(page)).toMatchSnapshot('key-removed-storage.txt');
  expect(m.requests(s.net)).toMatchSnapshot('key-requests.txt');
  s.check();
});

test('Settings: shelf editor', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'Shelf');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'shelf-edit');
  await m.press(page, s.net, 'Enter', 'Down', 'Down', 'Right', 'Down', 'Enter');
  await snap(page, 'shelf-edited');
  expect(await m.storage(page)).toMatchSnapshot('shelf-edited-storage.txt');
  await m.press(page, s.net, 'Back', 'Back', 'Back');
  await snap(page, 'shelf-after-edit');
  s.check();
});

test('About this TV (stand-in)', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'About this TV');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'about');
  await m.press(page, s.net, 'Back');
  await snap(page, 'about-closed');
  s.check();
});

test('screensaver after 5 idle minutes, and waking up', async ({page}) => {
  const s = await m.open(page);
  await page.clock.runFor(5.4 * 60000);   // the screensaver starts; the look is 6 s into its first photo
  await m.settle(page, s.net);
  await snap(page, 'saver');
  await page.clock.runFor(6000);   // with settle's 6 s: the next photo, 6 s in
  await m.settle(page, s.net);
  await snap(page, 'saver-next');
  await m.press(page, s.net, 'Left');
  await snap(page, 'saver-woken');
  s.check();
});

test('screensaver: the clock goes to another corner with every photo, and the photos don\'t repeat soon', async ({page}) => {
  const s = await m.open(page);
  await page.clock.runFor(5.4 * 60000);   // the screensaver starts; the look is 6 s into its first photo
  await m.settle(page, s.net);
  const corner = () => page.evaluate(() => {
    const c = document.querySelector('#saver .clock');
    return {at: ['bl', 'tl', 'br', 'tr'].filter((k) => c.classList.contains(k)), up: document.getElementById('saver').classList.contains('up'),
      title: c.querySelector('.title').textContent};
  });
  const seen = [await corner()];
  for (let i = 0; i < 12; i++) {
    await page.clock.runFor(6000);   // with settle's 6 s: one photo (12 s) per look
    await m.settle(page, s.net);
    seen.push(await corner());
  }
  for (let i = 0; i < seen.length; i++) {
    expect(seen[i].at.length, 'one corner at a time').toBe(1);
    expect(seen[i].up, 'the shade on the clock\'s side').toBe(seen[i].at[0][0] === 't');
    if (i) expect(seen[i].at[0], 'never the same corner twice in a row').not.toBe(seen[i - 1].at[0]);
  }
  expect(new Set(seen.map((x) => x.at[0])).size, 'every corner in turn').toBe(4);
  expect(new Set(seen.map((x) => x.title)).size, 'a new title with every photo').toBe(seen.length);
  // The next photo: the clock fades out with the last title and app, and comes back with the new ones in its new place.
  const before = await corner(), app = () => page.$eval('#saver .clock .app', (e) => e.textContent);
  const lastApp = await app();
  await page.clock.runFor(6300);
  expect(await page.$eval('#saver .clock', (c) => c.classList.contains('away'))).toBe(true);
  expect(await corner()).toEqual(before);
  expect(await app()).toBe(lastApp);
  await page.clock.runFor(400);
  const after = await corner();
  expect(after.title).not.toBe(before.title);
  expect(after.at[0]).not.toBe(before.at[0]);
  s.check();
});

test('screensaver: OK watches the title when Settings allows it', async ({page}) => {
  const s = await m.open(page, {prefs: {saverWatch: true}});
  await page.clock.runFor(5.4 * 60000);   // the screensaver starts; the look is 6 s into its first photo
  await m.settle(page, s.net);
  await snap(page, 'saver-watch');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'saver-watch-ok');
  s.check();
});

test('opened again: back to the shelf', async ({page}) => {
  const s = await m.open(page);
  await m.press(page, s.net, 'Up', 'Up', 'Right', 'Down');
  await page.evaluate(() => document.dispatchEvent(new Event('webOSRelaunch')));
  await m.settle(page, s.net);
  await snap(page, 'relaunched');
  s.check();
});

test('another app in front: no requests until the home screen shows again', async ({page}) => {
  const s = await m.open(page);
  const visible = (shown) => page.evaluate((v) => {
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => !v});
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => (v ? 'visible' : 'hidden')});
    document.dispatchEvent(new Event('visibilitychange'));
  }, shown);
  await visible(false);
  s.net.requests.length = 0;
  await page.clock.runFor(2 * 3600000);   // past the weather's 30 minutes and the picks' noon
  await m.settle(page, s.net);
  expect(s.net.requests).toEqual([]);
  await visible(true);
  await m.settle(page, s.net);
  expect(s.net.requests.some((r) => r.indexOf('https://api.open-meteo.com/v1/forecast') >= 0)).toBe(true);
  s.check();
});

// MARK: - Home Assistant (mock.js fakes its WebSocket API)

const HA = {config: m.HA_CONFIG, ha: {}};

/** What the page sent Home Assistant, without the ids that count up. */
async function haSent(page) {
  return page.evaluate(() => JSON.stringify(window.__ha.map((x) => {
    if (!x.send) return x;
    const s = Object.assign({}, x.send);
    delete s.id;
    if (s.start_time) s.start_time = '…';
    return {send: s};
  }), null, 1) + '\n');
}

test('Home Assistant: values at the top, their day, and the card in the drawer', async ({page}) => {
  const s = await m.open(page, HA);
  await snap(page, 'ha-start');
  expect(await haSent(page)).toMatchSnapshot('ha-start-sent.json');
  await m.press(page, s.net, 'Up', 'Up');
  await snap(page, 'ha-top-focus');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-history');
  await m.press(page, s.net, 'Back', 'Right', 'Enter');
  await snap(page, 'ha-history-door');
  await m.press(page, s.net, 'Back', 'Right', 'Right');
  await snap(page, 'ha-top-last');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-history-climate');
  await m.press(page, s.net, 'Back', 'Back', 'Down');
  await snap(page, 'ha-drawer');
  expect(await m.storage(page)).toMatchSnapshot('ha-storage.txt');
  s.check();
});

test('Home Assistant: a change shows at once', async ({page}) => {
  const s = await m.open(page, HA);
  await page.evaluate(() => window.__haChange('sensor.outside_temperature', '13.9'));
  await m.settle(page, s.net);
  await expect(page.locator('#hatop .value').first()).toHaveText(/13\.9°C/);
  await page.evaluate(() => window.__haChange('binary_sensor.front_door', 'on'));
  await m.settle(page, s.net);
  await expect(page.locator('#hatop .value').nth(1)).toHaveText(/^Open/);
  s.check();
});

test('Home Assistant: the card alone, without the weather', async ({page}) => {
  const s = await m.open(page, Object.assign({prefs: {weather: false}}, HA));
  await m.press(page, s.net, 'Down');
  await snap(page, 'ha-drawer-alone');
  s.check();
});

test('Home Assistant: out of reach, the last values dimmed', async ({page}) => {
  const cached = {url: m.HA_CONFIG.haUrl, at: Date.parse(m.DAY) - 3 * 3600000, states: {
    'sensor.outside_temperature': {s: '9.5', a: {friendly_name: 'Outside', unit_of_measurement: '°C'}, lc: 0},
    'sensor.living_room_humidity': {s: '51', a: {friendly_name: 'Living room humidity', unit_of_measurement: '%'}, lc: 0}}};
  const s = await m.open(page, {config: m.HA_CONFIG, ha: {reachable: false}, storage: {'fmtv.ha': JSON.stringify(cached)}});
  await m.press(page, s.net, 'Down');
  await snap(page, 'ha-offline');
  s.check();
});

test('Home Assistant: the token refused', async ({page}) => {
  const s = await m.open(page, {config: m.HA_CONFIG, ha: {token: 'another-token'}});
  await m.press(page, s.net, 'Down');
  await snap(page, 'ha-rejected');
  expect(await haSent(page)).toMatchSnapshot('ha-rejected-sent.json');
  s.check();
});

test('Home Assistant: off in Settings, and back on', async ({page}) => {
  const s = await m.open(page, HA);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'Home Assistant');
  await snap(page, 'ha-settings-row');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-sheet');
  await m.press(page, s.net, 'Down', 'Down', 'Enter');
  await snap(page, 'ha-sheet-off');
  await expect(page.locator('#hatop .value')).toHaveCount(0);
  await expect(page.locator('#drawer #ha')).toHaveCount(0);
  await m.press(page, s.net, 'Enter');
  await expect(page.locator('#hatop .value')).toHaveCount(3);
  s.check();
});

test('Home Assistant: which values at the top, in what order', async ({page}) => {
  const s = await m.open(page, HA);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'Home Assistant');
  await m.press(page, s.net, 'Enter', 'Down', 'Down', 'Down', 'Enter');
  await snap(page, 'ha-edit-top');
  await m.press(page, s.net, 'Down', 'Down', 'Down', 'Enter');
  await snap(page, 'ha-edit-top-full');
  await m.press(page, s.net, 'Up', 'Up', 'Up', 'Right');
  await snap(page, 'ha-edit-top-moved');
  await m.press(page, s.net, 'Enter', 'Back');
  await snap(page, 'ha-edit-back');
  await expect(page.locator('#hatop .value')).toHaveText([/^Closed/, /^21\.5°/]);
  s.check();
});

test('Home Assistant: which values in the drawer', async ({page}) => {
  const s = await m.open(page, HA);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'Home Assistant');
  await m.press(page, s.net, 'Enter', 'Down', 'Down', 'Down', 'Down', 'Enter', 'Enter');
  await snap(page, 'ha-edit-drawer');
  expect(await m.storage(page)).toMatchSnapshot('ha-edit-storage.txt');
  s.check();
});

test('Home Assistant: an address typed on the TV', async ({page}) => {
  const s = await m.open(page, {config: Object.assign({}, m.HA_CONFIG, {haUrl: ''}), ha: {}});
  await expect(page.locator('#hatop .value')).toHaveCount(0);
  await openSettings(page, s.net);
  await m.moveTo(page, s.net, '#settings .row', 'Home Assistant');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-address');
  await page.keyboard.type('not an address');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-address-malformed');
  await m.press(page, s.net, 'Up', 'Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('elsewhere.test:8123');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-address-unreachable');
  await m.press(page, s.net, 'Up', 'Enter');
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.type('ha.test:8123/');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-address-saved');
  expect(await m.storage(page)).toMatchSnapshot('ha-address-storage.txt');
  await expect(page.locator('#hatop .value')).toHaveCount(3);
  s.check();
});

test('Home Assistant: another app in front closes the connection', async ({page}) => {
  const s = await m.open(page, HA);
  const visible = (shown) => page.evaluate((v) => {
    window.__ha.length = 0;
    Object.defineProperty(document, 'hidden', {configurable: true, get: () => !v});
    Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => (v ? 'visible' : 'hidden')});
    document.dispatchEvent(new Event('visibilitychange'));
  }, shown);
  await visible(false);
  await page.clock.runFor(10 * 60000);   // past every retry: none while hidden
  await m.settle(page, s.net);
  expect(await haSent(page)).toMatchSnapshot('ha-hidden-sent.json');
  await visible(true);
  await m.settle(page, s.net);
  expect(await haSent(page)).toMatchSnapshot('ha-shown-sent.json');
  s.check();
});

test('Home Assistant: a new ha_top or ha_panel wins once over the values picked on the TV', async ({page}) => {
  const stamp = m.HA_CONFIG.haTop.join(',') + '|' + m.HA_CONFIG.haPanel.join(',');
  const s = await m.open(page, Object.assign({prefs: {haConfig: 'sensor.old|', haTop: ['light.desk']}}, HA));
  await expect(page.locator('#hatop .value')).toHaveCount(3);
  await page.evaluate((v) => {
    localStorage.setItem('fmtv.prefs', JSON.stringify({haConfig: v, haTop: ['light.desk']}));
    location.reload();
  }, stamp);
  await m.settle(page, s.net);
  await expect(page.locator('#hatop .value')).toHaveText([/^On/]);
  s.check();
});

test('Home Assistant: a lost connection comes back by itself', async ({page}) => {
  const s = await m.open(page, HA);
  await page.evaluate(() => { window.__ha.length = 0; window.__haDrop(); });
  await m.settle(page, s.net);   // the first try again is after 5 s
  await expect(page.locator('#hatop')).not.toHaveClass(/stale/);
  expect(await haSent(page)).toMatchSnapshot('ha-reconnect-sent.json');
  await page.evaluate(() => { window.__ha.length = 0; window.__haDrop(); });
  await m.press(page, s.net, 'Down');
  await expect(page.locator('#hatop')).not.toHaveClass(/stale/);
  s.check();
});

test('Home Assistant: at night', async ({page}) => {
  const s = await m.open(page, Object.assign({at: m.NIGHT}, HA));
  await m.press(page, s.net, 'Up', 'Up');
  await snap(page, 'ha-night');
  await m.press(page, s.net, 'Back', 'Down');
  await snap(page, 'ha-night-drawer');
  s.check();
});

test('Home Assistant: in German', async ({page}) => {
  const s = await m.open(page, Object.assign({prefs: {language: 'de'}}, HA));
  await snap(page, 'ha-de');
  await m.press(page, s.net, 'Down');
  await snap(page, 'ha-drawer-de');
  await m.moveTo(page, s.net, '#drawer .key', 'Einstellungen', true);
  await m.press(page, s.net, 'Enter');
  await m.moveTo(page, s.net, '#settings .row', 'Home Assistant');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'ha-sheet-de');
  s.check();
});
