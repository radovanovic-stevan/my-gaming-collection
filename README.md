# Game Collection

A browsable showcase of my physical game collection: a cover grid and a table view,
with search, filters (status, platform, genre, condition, rating, cover art) and a
multi-level custom sort. Filter and sort state is kept in the URL, so any view can be shared.

## Running it

```sh
npm install
npm run dev      # http://localhost:5173 — viewing + editing
```

When it runs through `npm run dev`, the app has a small local API that allows
**adding, editing and deleting games** and **managing cover art** (drop, pick, paste
or fetch from a URL). The static build has no API, so it's view-only.

## Where the data lives

Everything is plain files in the repo. There is no database.

| Path | What |
| --- | --- |
| `public/data/games.json` | The collection. Edited by the app, or by hand. |
| `public/covers/` | Cover images, named `<id>-<hash>.<ext>`. |
| `data/source/games-1.5.tsv` | Original spreadsheet export. |

Commit the changes after editing to publish them.

## Scripts

- `npm run import:tsv [file]` rebuilds `games.json` from a spreadsheet export.
  Cover assignments are kept. It also fixes known data issues in the sheet (see the script).
- `npm run covers:fetch [N]` fetches box art from Wikipedia infoboxes for the top-N
  rated games that have no cover yet (default 60). `--ids 12,34` targets specific games.
  It only accepts close title matches, so it skips some games rather than guess.

## Publishing on GitHub Pages

Push to `main` on GitHub, then set **Settings → Pages → Source** to **GitHub Actions**.
`.github/workflows/deploy.yml` builds and deploys the site on each push.
The build uses relative paths, so it works under any repo name.
