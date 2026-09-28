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
update by themselves.

The **Map** tab shows where the games were bought. Each game has a **Bought in** country
(for a gift, where the giver bought it), set in the game's edit form. Hovering a country shows
how many games came from it, and clicking it lists them. The map opens on Europe; a button
switches to the whole world.

The **Gallery** tab holds free-form pictures: add a picture (drop, pick, paste or fetch it
from a URL), its date, a description and the games shown in it, if any. Pictures are resized
to 1600px. The static build has no API, so it's view-only.

**Other collections** that aren't games (for now, **Dylan Dog** comics) get their own tabs after
the game tabs, with their own colours. Each series is a checklist of issue numbers or book titles,
marked owned or missing. Locally, **Tick off issues** lets you click issues to switch them
(and **+** adds the next number), and each series' **Edit** sets its name and its owned and
missing issues as ranges like `1-10, 12`.

The **Vinyl** tab is a cover grid of records, with pictures like the games (the first one becomes
the cover). Each record keeps a listening log: one entry per side played (1, 2, A, B, …) with its
date. Locally, open a record to set or change dates, change sides, remove entries, or log a side
played today. **Needs dates** shows the records that still have listens without a date.

## Where the data lives

Everything is plain files in the repo. There is no database.

| Path | What |
| --- | --- |
| `public/data/games.json` | The collection. Edited by the app, or by hand. |
| `public/images/` | Game images, named `<id>-<hash>.<ext>`. A game's `images` lists its files and `cover` picks one of them. Gallery pictures are named `gallery-<id>-<hash>.jpg`. |
| `public/data/gotm.json` | Game of the Month: every month's games played, completed and bought counts, and the winner. |
| `public/data/gotc.json` | Game of the Category: yearly awards and yearly stats. |
| `public/data/gallery.json` | Gallery: each picture's image file, date, description and the games in it. |
| `public/data/dylan-dog.json` | Dylan Dog: each series and which of its issues are owned. |
| `public/data/vinyl.json` | Vinyl: each record's artist, album, images and listening log. Images are `vinyl-<id>-<hash>.<ext>`. |
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
