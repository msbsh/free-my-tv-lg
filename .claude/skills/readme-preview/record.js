// Records the home screen as PNG frames with their timestamps (a CDP screencast): an LG TV faked around the page (its
// apps with logos, its inputs), the real TMDB and Open-Meteo. make.sh runs it.
//
//   node record.js <out/webos/index.html> <frames dir> <time zone>
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');

const [APP, OUT, TZ] = process.argv.slice(2);

/** Runs in the page before its scripts: just enough of webOS for tv.js (as in tests/e2e/mock.js, without the checks). */
function fakeTV(points) {
  window.PalmSystem = {identifier: 'de.msbsh.freemytvlg 1', platformBack: function () {}, activate: function () {}};
  var ok = function (o) { o.returnValue = true; return o; };
  function answer(uri) {
    switch (uri) {
      case 'luna://com.webos.applicationManager/listLaunchPoints': return ok({launchPoints: points});
      case 'luna://com.webos.applicationManager/getAppLoadStatus': return ok({exist: false});
      case 'luna://com.webos.service.eim/getAllInputStatus':
        return ok({devices: [
          {appId: 'com.webos.app.hdmi1', connected: true, label: 'PS5'},
          {appId: 'com.webos.app.hdmi2', connected: true, label: 'Apple TV'},
          {appId: 'com.webos.app.hdmi3', connected: false, label: 'HDMI 3'},
          {appId: 'com.webos.app.hdmi4', connected: false, label: 'HDMI 4'}]});
      case 'luna://com.webos.service.tvpower/power/registerScreenSaverRequest': return ok({subscribed: true});
    }
    return ok({});
  }
  window.PalmServiceBridge = function () { this.onservicecallback = null; };
  window.PalmServiceBridge.prototype.call = function (uri) {
    var b = this, res = answer(uri);
    Promise.resolve().then(function () { if (b.onservicecallback) b.onservicecallback(JSON.stringify(res)); });
  };
}

// The shelf: our logos where web/icons has one, the name on the brand's color otherwise (as on a TV).
const POINTS = [
  {id: 'netflix', title: 'Netflix', icon: 'icons/netflix.svg', bgColor: '#000000'},
  {id: 'youtube.leanback.v4', title: 'YouTube', largeIcon: 'icons/youtube.png'},
  {id: 'amazon', title: 'Prime Video', icon: 'icons/prime.png'},
  {id: 'com.disney.disneyplus-prod', title: 'Disney+', iconColor: '#1838C8'},
  {id: 'com.wbd.stream', title: 'HBO Max', icon: 'icons/max.svg'},
  {id: 'com.apple.appletv', title: 'Apple TV', iconColor: '#1d1d1f'},
  {id: 'org.jellyfin.webos', title: 'Jellyfin', icon: 'icons/jellyfin.svg'},
  {id: 'spotify-beehive', title: 'Spotify', icon: 'icons/spotify.svg'},
  {id: 'com.webos.app.livetv', title: 'Live TV'},
  {id: 'com.webos.app.hdmi1', title: 'HDMI 1'},
];

(async () => {
  const browser = await chromium.launch({args: ['--allow-file-access-from-files']});
  const ctx = await browser.newContext({viewport: {width: 1920, height: 1080}, deviceScaleFactor: 1, locale: 'en-US', timezoneId: TZ});
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('page error: ' + e));
  await page.addInitScript(fakeTV, POINTS);
  await page.goto('file://' + path.resolve(APP));
  await page.waitForTimeout(9000);   // the picks, their posters and the weather arrive

  const key = async (k, wait) => { await page.keyboard.press('Arrow' + k); await page.waitForTimeout(wait || 650); };

  // A first round through the picks puts every poster and backdrop in the cache; opened again, the page starts on the shelf.
  for (const k of ['Up', 'Right', 'Right', 'Right', 'Left', 'Left', 'Left']) await key(k, 3000);
  await page.reload();
  await page.waitForTimeout(6000);

  const frames = [];
  const cdp = await ctx.newCDPSession(page);
  cdp.on('Page.screencastFrame', async (f) => {
    frames.push({t: f.metadata.timestamp, data: f.data});
    try { await cdp.send('Page.screencastFrameAck', {sessionId: f.sessionId}); } catch (e) { /* stopped */ }
  });
  await cdp.send('Page.startScreencast', {format: 'png', everyNthFrame: 1, maxWidth: 1920, maxHeight: 1080});

  // The tour: it ends where it starts (the first app), so the loop doesn't jump.
  await page.waitForTimeout(1400);
  await key('Right'); await key('Right', 800);               // along the shelf
  await key('Down', 2200);                                   // the drawer: weather, inputs, shortcuts
  await key('Right'); await key('Right', 1000);
  await key('Up', 900);                                      // the shelf
  await key('Up', 1200);                                     // the picks
  await key('Right', 2000);
  await key('Right', 2000);
  await key('Left', 350); await key('Left', 1600);           // the first pick
  await key('Down', 700);                                    // the shelf
  for (let i = 0; i < 4; i++) await key('Left', 300);        // the first app
  await page.waitForTimeout(600);

  await cdp.send('Page.stopScreencast');
  await page.waitForTimeout(300);
  await browser.close();

  fs.mkdirSync(OUT, {recursive: true});
  const list = frames.map((f, i) => {
    const name = 'f' + String(i).padStart(4, '0') + '.png';
    fs.writeFileSync(path.join(OUT, name), Buffer.from(f.data, 'base64'));
    return {name, t: f.t};
  });
  fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(list));
  console.log(list.length + ' frames, ' + (list[list.length - 1].t - list[0].t).toFixed(1) + ' s');
})();
