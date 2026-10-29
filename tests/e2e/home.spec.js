// The home screen in the browser stand-in (tv.js's sample apps): what it shows and how the remote moves through it.
const {test, expect} = require('@playwright/test');
const m = require('./mock');

async function snap(page, name) {
  expect(await m.dom(page)).toMatchSnapshot(name + '.txt');
  await m.screenshot(page, name + '.png');
}

/** From the shelf to Home Settings, through the drawer. */
async function openSettings(page, net) {
  await m.press(page, net, 'Down');
  await m.moveTo(page, net, '#drawer .key', 'Home Settings', true);
  await m.press(page, net, 'Enter');
}

test('start: picks, shelf and weather', async ({page}) => {
  const s = await m.open(page);
  await snap(page, 'start');
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

test('the remote moves through the shelf, the picks and the tabs', async ({page}) => {
  const s = await m.open(page);
  await m.press(page, s.net, 'Right', 'Right', 'Right');
  await snap(page, 'shelf-right-3');
  await m.press(page, s.net, 'Left', 'Up');
  await snap(page, 'cards');
  await m.press(page, s.net, 'Right', 'Up');
  await snap(page, 'tabs');
  await m.press(page, s.net, 'Right');
  await snap(page, 'tab-movies');
  await m.press(page, s.net, 'Right');
  await snap(page, 'tab-shows');
  await m.press(page, s.net, 'Right');
  await snap(page, 'tab-last');
  await m.press(page, s.net, 'Down', 'Down');
  await snap(page, 'back-down');
  s.check();
});

test('without a TMDB key nothing above the shelf takes the focus', async ({page}) => {
  const s = await m.open(page, {prefs: {tmdbKey: ''}});
  await m.press(page, s.net, 'Up');
  await expect(page.locator('#tiles .focus')).toHaveCount(1);
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

test('Home Settings: every row and its values', async ({page}) => {
  const s = await m.open(page);
  await openSettings(page, s.net);
  await snap(page, 'settings');
  await m.moveTo(page, s.net, '#settings .row', 'Temperature');
  await m.press(page, s.net, 'Right');
  await m.moveTo(page, s.net, '#settings .row', 'Theme');
  await m.press(page, s.net, 'Right');
  await snap(page, 'settings-light');
  await m.moveTo(page, s.net, '#settings .row', 'Picks per tab');
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

test('Home Settings: weather widget off', async ({page}) => {
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

test('Home Settings: language', async ({page}) => {
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

test('Home Settings: city', async ({page}) => {
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

test('Home Settings: TMDB key', async ({page}) => {
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

test('Home Settings: shelf editor', async ({page}) => {
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

test('screensaver: the clock goes to another corner with every photo', async ({page}) => {
  const s = await m.open(page);
  await page.clock.runFor(5.4 * 60000);   // the screensaver starts; the look is 6 s into its first photo
  await m.settle(page, s.net);
  const corner = () => page.evaluate(() => {
    const c = document.querySelector('#saver .clock');
    return {at: ['bl', 'tl', 'br', 'tr'].filter((k) => c.classList.contains(k)), up: document.getElementById('saver').classList.contains('up')};
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
  s.check();
});

test('screensaver: OK watches the title when Home Settings allows it', async ({page}) => {
  const s = await m.open(page, {prefs: {saverWatch: true}});
  await page.clock.runFor(5.4 * 60000);   // the screensaver starts; the look is 6 s into its first photo
  await m.settle(page, s.net);
  await snap(page, 'saver-watch');
  await m.press(page, s.net, 'Enter');
  await snap(page, 'saver-watch-ok');
  s.check();
});

test('opened again: back to the shelf, the first tab', async ({page}) => {
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
