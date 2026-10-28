// The LG home screen in Chromium, as the TV opens it: from file://, at 1920×1080, in Berlin. tests/run.sh builds it.
const {defineConfig} = require('@playwright/test');

module.exports = defineConfig({
  testDir: 'e2e',
  // One baseline for every system: the text snapshots don't depend on it, and screenshots run only where
  // FMTV_NO_SCREENSHOTS isn't set (their pixels do).
  snapshotPathTemplate: '{testDir}/__snapshots__/{testFileName}/{arg}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'line' : 'list',
  timeout: 60000,
  expect: {toHaveScreenshot: {maxDiffPixelRatio: 0.002, animations: 'disabled', caret: 'hide'}},
  use: {
    browserName: 'chromium',
    viewport: {width: 1920, height: 1080},
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'Europe/Berlin',
    // The TV reads appinfo.json beside index.html with an XMLHttpRequest from file://.
    launchOptions: {args: ['--allow-file-access-from-files']},
  },
});
