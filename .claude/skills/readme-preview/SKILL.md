---
name: readme-preview
description: Re-records the README's animated preview (.github/preview.webp) from the current web/. Use when the person asks for it, or agreed to it after a change to what the preview shows (AGENTS.md, "Changing the repo").
---

# The README's preview

`make.sh` builds the app from this checkout (uncommitted changes included), opens it in Playwright's Chromium on a
faked LG TV with the real TMDB and Open-Meteo, tours it with the remote's arrows (`record.js`), and writes
`.github/preview.webp`: 960×540, looping, about 19 s.

1. **Record:** run `.claude/skills/readme-preview/make.sh` from the worktree. It reads the TMDB key from the main
   checkout's `config.properties`; the key stays in files, never in the output or the chat. Done when it prints
   `Wrote .github/preview.webp` and the contact sheet's path.
2. **Look:** open the contact sheet (and full frames from the printed folder where something looks off). Done when
   every settled frame shows its posters and logos, the weather card shows a daytime sky, the backdrop is free of
   blocks, and the first and last frames match (the first app focused, *Explore*). Cards that are empty or blended
   for a frame while a tab changes are the app's own fade.
3. **Fix the tour** when the screen changed under it (a new row, a key that lands elsewhere, a feature gone or added
   that the README names): edit the arrow sequence in `record.js` (*The tour*), keep it ending where it starts, and
   record again.
4. **Match the README:** the image's `alt` in `README.md` says what the tour shows.
5. **Commit** `.github/preview.webp`, with `record.js` and the README if they changed.

## Why it's built this way

- **Real data:** the tests' mock answers TMDB with one-color PNGs; the preview needs real posters.
- **Fake TV:** in a desktop browser, `tv.js` shows sample apps as names only. `record.js` answers Luna like a TV:
  the logos from `web/icons`, connected inputs, so the shelf and drawer look as they do on the TV.
- **A city where it's day:** the forecast is live, and a faked clock would pair the current night sky with daytime
  hours. `make.sh` picks the city from its list whose time is nearest 13:30, with its TMDB region (so the city, °C
  or °F and the picks vary between recordings).
- **Warm-up:** a first round through the tabs, then a reload, so every poster is cached before recording.
- **Encoding:** `img2webp` with a keyframe every 3 to 6 frames. Fewer keyframes leave blocks in the blurred backdrop.
- **Needs:** Python 3, Node with `tests/node_modules` (installed on first run), ImageMagick (`magick`), libwebp
  (`img2webp`).
