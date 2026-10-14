# Notes for agents

A personal site for a physical game collection (React + Vite, no backend), published to
GitHub Pages at collection.stevan.co.rs. The README is only the now-playing card; don't add docs to it.

## Data and publishing
- All data is JSON in `public/data/`; images are in `public/images/`. There is no database.
- Editing only works under `npm run dev`: `server/api.ts` mounts a local API that writes straight to those
  files. The built site is read-only. Publishing is a push to `main`; `.github/workflows/deploy.yml` builds and deploys.
- `public/data/casting-a-dream.json` is written by the Casting a Dream launcher (a separate repo). Never edit it
  by hand; the launcher overwrites it.
- `npm run import:awards` would overwrite `gotm.json`/`gotc.json` from old spreadsheet exports (it refuses
  without `--force`); the JSON files are the source of truth now. `npm run import:tsv` rebuilds `games.json`.
- Image names: `<id>-<hash>.<ext>` for games; `gallery-`, `console-`, `vinyl-` and `blog-` prefixes for the rest.
- Game of the Month, awards, gallery and launcher entries point to games by title and platform, not by id
  (`createLinker` in `src/lib/links.ts`, `matchLauncherGames` in `src/lib/castingADream.ts`). Renaming a game
  can quietly unlink it.
- The game status `Null` means a game with no ending (sports, party, arcade); `Built-in Console` in a game's
  condition means it's built into a console like the SNES Classic.

## Build steps
- `plugins/nowPlaying.ts` writes `dist/now-playing.svg` on every build (the README's card): the launcher game
  played in the last 7 days, else an in-progress Game of the Month game, else the latest Game of the Month.

## The owner's preferences
- Stats, Timeline and Year in Review cover games only; Vinyl and Dylan Dog are separate collections.
- Shelf view: no cover art. Spines are dark with white titles; the band on top is the platform's real box colour
  (`src/lib/bands.ts`), one colour per platform whether a copy is boxed or loose.
- Year in Review is built only from the Awards data (`gotc.json`).
- Buttons that sit together should be the same size.
