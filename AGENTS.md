# Free My TV (LG): guide for agents

A home screen app for LG webOS TVs (webOS 6 and newer), installed through LG's Developer Mode: `web/` is the app
(plain HTML, CSS and JS), `webos/` packs and installs it, `assets/` holds the catalogues, symbols and font it
carries. Python 3 and OpenSSH on the computer; no LG tools, no frameworks.
It's a fork of [simbasjungles/free-my-tv](https://github.com/simbasjungles/free-my-tv), cut down to LG; Google TV,
Android TV and Samsung live upstream. Keep the upstream credit in README.md and the original notice in LICENSE.

The person you're helping may not be technical. Keep it short and friendly, say what you're about to do on their TV
before you do it, and let them do the taps on the TV.
Questions for them (open decisions before a change, anything you'd otherwise send as a list) go through your
ask-user-questions tool, if you have one, not as a list in the chat: it takes a few per call, so send them in rounds.

## Always

- Run `tools/check.sh` before you commit to `main`: the catalogues (`translate.py --check`), the package, `web/`
  against what webOS 6 can run, and `tests/run.sh`. Pull requests run it too (`.github/workflows/check.yml`), without
  screenshots.
- Your work ends on the local `main`. Pushing to a remote is theirs alone: never push.
- `tests/` holds the baseline the LG-only rework started from. A failing test is a regression until shown otherwise:
  update a baseline (`tests/run.sh -- --update-snapshots`, `python3 tests/test_package.py --update`) only for a change
  that is meant to show, and say which in the commit.
- Never commit `config.properties`, `*.keystore` or any key.
- The TMDB key is theirs and secret: they paste it after `tmdb_key=` in `config.properties` themselves, or type it on
  the TV (*Settings* → *TMDB key*). Don't ask for it in the chat, never print it, never commit it. If they paste
  it in the chat anyway, put it only in `config.properties`. Without a key everything works except TMDB's picks (ARD
  Mediathek's, KiKA's and ARTE's still come).
- The Home Assistant token (`ha_token`) is secret like the TMDB key, and stronger: Home Assistant has no read-only
  tokens. They create it themselves (profile → *Security* → *Long-lived access tokens*, best for a user without admin
  rights) and paste it into `config.properties`; it can't be typed on the TV. Same rules as the TMDB key.
- Don't change the TV's picture, sound, network or account settings.

## Changing the repo

Each agent works in its own git worktree and lands its change on `main` itself, once it's tested. History stays
linear: no merge commits. The main checkout may hold someone's uncommitted work; leave it as it is.

1. **Start:** from the main checkout, `git worktree add .worktrees/<topic> -b <topic> main`, and work only there.
   The tests bring their own settings (`tests/fixtures/config.properties`); `tests/run.sh` installs
   `tests/node_modules` on its first run.
2. **Test:** `tools/check.sh` passes in the worktree. Commit there.
3. **Catch up:** if `main` moved while you worked (`git log --oneline HEAD..main` lists commits), `git rebase main`
   and run `tools/check.sh` again. Anything that fails now is a regression and fixing it is part of your task, whether
   it comes from your change or from the other one. Where it's unclear which behaviour is wanted (two changes that
   contradict each other, a baseline that changes in a way neither commit explains), ask the person you're helping
   (with your ask-user-questions tool, if you have one) before you choose.
4. **Land:** from the main checkout, `git merge --ff-only <topic>`. If `main` moved again, go back to step 3; if
   their uncommitted changes are in the way, ask them.
5. **Clean up:** `git worktree remove .worktrees/<topic>` and `git branch -d <topic>`.

Installing on the TV stays in the main checkout: that's where their `config.properties` lives.

The README's preview (`.github/preview.webp`) is an animated tour of the home screen: the header, the picks, the
shelf, and the drawer with the weather, the inputs and the shortcuts. When your change alters how any of these look,
or adds or removes one, ask the person whether to record it again. On a yes, run the `readme-preview`
skill (`.claude/skills/readme-preview/`) in your worktree and commit the new preview with your change.

## Installing it on an LG TV

1. **Ask** for the TV's IP address and their city, if they didn't say. Tools: Python 3 and OpenSSH (`ssh`,
   `ssh-keygen`), already on macOS, Linux and Windows 10+.
2. **On the TV** (they do it): LG Content Store → *Developer Mode* → sign in with a free LG developer account
   (webostv.developer.lge.com) → *Dev Mode Status* on (the TV restarts) → *Key Server* on. It shows the IP and a
   passphrase.
3. **Settings:** the first `python3 webos/build.py` creates `config.properties`. Fill in `latitude` and `longitude`
   (decimal degrees) and `city`, `tmdb_region` (two-letter country) and `temperature` to match. The TMDB key rules
   above apply. Home Assistant (optional): `ha_url`, `ha_token` (their part, as above), `ha_top` and `ha_panel`
   (entity ids); they can pick the entities on the TV later.
4. **Build:** `python3 webos/build.py` must end with `Built FreeMyTV-webos.ipk`.
5. **Install:** the first time needs the TV's passphrase, typed by them: ask them to run
   `python3 webos/install.py <IP>` in their own terminal (yours can't answer its prompt, and the passphrase doesn't go
   in the chat). It builds first (`--generic` and `--config` go to `build.py`, `--no-build` skips it). It keeps the
   unlocked key in `~/.ssh/freemytv_webos_<IP>` (dots as underscores), so later updates run from your terminal with
   the same command.
6. **Tell them:** while the app is open, holding a number key pins it to that key (it's also in LG's app list).
   Developer Mode lasts about 40 days; *EXTEND* in that app renews it (if it runs out, the TV removes developer apps,
   and installing again brings it back). `--uninstall` removes the app. With Home Assistant set up, *Settings* →
   *Home Assistant* picks its values and their order on the TV.
7. **App list:** webOS 6 denies `listLaunchPoints` to Developer Mode apps. Until the TV allows the remote control API
   (it asks once, on the TV), the shelf shows the known apps `getAppLoadStatus` finds. Tell them to allow it; the full
   list shows from the next start.

The app id is `de.msbsh.freemytvlg`, not upstream's `io.freemytv`: a TV with upstream's app gets a second one. Have
them remove the old one (LG's app list, edit mode) before the first install.

## The code

- **webOS 6 runs Chromium 79 and Node 12.** `web/` and `webos/service` stay within ES2019 (no `?.` or `??`) and the
  calls and CSS Chromium 79 has; `tools/check.sh` greps for the ones that came later. Wrap newer APIs in a feature
  check (`strings.js` tries `Intl.DisplayNames`, from Chromium 81, only for a language `NAMES` lacks). Only transform
  and opacity animate; no backdrop-filter (too heavy for the TVs' GPUs).
- `web/tv.js` is the TV's side, through Luna (`PalmServiceBridge`): the apps (`listLaunchPoints`; where it's denied,
  the remote control API on `ws://127.0.0.1:3000` once the TV allowed it, else `getAppLoadStatus` over the known ids
  in `KNOWN`, with the logo bundled in `web/icons/` where there is one, otherwise the name on the brand's color),
  opening apps and inputs (`applicationManager/launch`), the inputs' state (`eim/getAllInputStatus`, subscribed: the
  drawer shows only inputs with a device on them), About this TV, and the TV's screensaver (`tvpower`: it waits while
  ours will show). Firmware that gives the page its own origin (`file://<app id>-webos`) gets 1008 "invalid origin"
  from the remote control API: then `webos/service`, a JS service in the package whose handshake says `file://`, makes
  the call. In a desktop browser, `tv.js` is a stand-in with sample apps.
- `web/home.js` draws the screen and handles the remote (arrows, OK, Back 461, the Magic Remote's pointer);
  `web/data.js` has the picks (TMDB, and the top rows and live streams of ARD Mediathek, KiKA and ARTE from ARD's page
  gateway and ARTE's API: not public APIs, so a source that fails keeps its last list; ARTE's cache sometimes holds a
  row's error inside the JSON, `mendArte` takes it out), mixed in an order of their own every hour, weather
  (Open-Meteo) and `Prefs` (Settings, in localStorage, winning over `config.properties`). A pick's OK opens its
  app only: tried on a webOS 6 TV, none of the three opened a title given at launch (ARTE's declared `contentTarget`
  neither, as id, URL or `arte://program/…`).
- `web/ha.js` is Home Assistant, read only: its WebSocket API (`subscribe_entities`, `history/history_during_period`,
  `get_states`), because Home Assistant answers the page's `file://` origin there without a CORS setting. The values sit
  at the top right (`Prefs.haTop()`, up to 3, OK shows their 24 hours) and in a drawer card (`Prefs.haPanel()`); the
  last ones stay in `fmtv.ha` for when it can't be reached. No connection while another app is in front. Never log the
  token.
- TMDB is reached at `api.tmdb.org`, TMDB's own mirror of `api.themoviedb.org` on the images' domain: some ISPs block
  the other name.
- The TMDB key typed on the TV (`Prefs.tmdbKey()`) wins over `CONFIG.tmdbKey`; `Data.keyChanged()` fetches the picks
  again. Never log it.
- Settings come from `config.properties` through the generated `config.js` (`tools/webapp.py`). Built with
  `--generic`, the place values are empty and `web/zones.js` (`tools/make_zones.py`, from the tz database) turns the
  TV's time zone into the city and the region.
- On-screen text: the catalogues in `assets/i18n/<lang>.json`, keyed by the English, packed into `i18n.js` (only the
  keys `web/` uses): `tr('Live TV')`, `trf('{n} min ago', {n: 12})`, `plural('plural|one:{n} season|other:{n} seasons', n)`
  and `formatDate('format|h:mm a', at)` (a SimpleDateFormat pattern, written by `web/strings.js`). Never concatenate
  words. A key `"context|Text"` is the same English where a language may need another word. Each catalogue gives one
  plural form per CLDR category of its language. Portuguese, Spanish, German, Russian, Thai and Turkish are hand
  translations: edit them by hand, never replace them with machine ones (`--fill` leaves them alone unless `--lang`
  names one). After changing text, run `python3 tools/translate.py`: it rebuilds `en.json` from `web/` and lists what
  each language lacks; translate those in every catalogue (or `--fill` with `ANTHROPIC_API_KEY`, which sends only the
  strings), and keep placeholders as they are. No right-to-left languages yet.
- The quote at the top comes from `assets/quotes/<lang>.json`, packed into `quotes.js`: public-domain aphorisms in the
  language they were written in (German or English on a German TV, English everywhere else), at most 110 characters (two lines),
  each with its `source` (the Project Gutenberg id or URL it was checked against). Never a translation, never one from
  a quote website or from memory: copy it from the text and keep its wording. German ones are in today's spelling, and
  any text that differs from the source keeps the source's in `original`.
- Comments in English, short, only where the why isn't obvious.
- Preview: `python3 webos/build.py --preview`, then open `out/webos/index.html` in a browser.
