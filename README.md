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
**adding, editing and deleting games** and **managing images**. A game can have
several images: drop, pick, paste or fetch them from a URL, and mark one as the cover.

The **Game of the Month** and **Game of the Category** tabs are editable locally too:
add or edit months (games played with their status, bought count; the completed count
is worked out from the ✅ games), add or edit yearly awards and stats (a new year copies
last year's categories), The all-time top-5 lists are
worked out from the collection's ratings (ties go to the most recently completed game), so they
update by themselves. The static build has no API, so it's view-only.

## Where the data lives

Everything is plain files in the repo. There is no database.

| Path | What |
| --- | --- |
| `public/data/games.json` | The collection. Edited by the app, or by hand. |
| `public/images/` | Game images, named `<id>-<hash>.<ext>`. A game's `images` lists its files and `cover` picks one of them. |
| `public/data/gotm.json` | Game of the Month: every month's games played, completed and bought counts, and the winner. |
| `public/data/gotc.json` | Game of the Category: yearly awards and yearly stats. |
| `data/source/*.tsv` | Original spreadsheet exports. |

Commit the changes after editing to publish them.

## Scripts

- `npm run import:tsv [file]` rebuilds `games.json` from a spreadsheet export.
  Cover assignments are kept. It also fixes known data issues in the sheet (see the script).
- `npm run import:awards -- --force` rebuilds `gotm.json` and `gotc.json` from the Game of
  the Month and Game of the Category exports in `data/source/`. This was the one-time
  migration from the sheets: now that entries are added in the app, the JSON files are the
  source of truth, so it refuses to run without `--force`. Entries are linked to collection
  games by title and platform when the page loads.
- `npm run covers:fetch [N]` fetches box art from Wikipedia infoboxes for the top-N
  rated games that have no cover yet (default 60). `--ids 12,34` targets specific games.
  It only accepts close title matches, so it skips some games rather than guess.

## Publishing on GitHub Pages

Push to `main` on GitHub, then set **Settings → Pages → Source** to **GitHub Actions**.
`.github/workflows/deploy.yml` builds and deploys the site on each push.
The build uses relative paths, so it works under any repo name.
