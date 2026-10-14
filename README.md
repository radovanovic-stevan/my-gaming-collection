# Game Collection

A browsable showcase of my physical game collection: a cover grid and a table view,
with search, filters (status, platform, genre, condition, rating, cover art) and a
multi-level custom sort. Filter and sort state is kept in the URL, so any view can be shared.

The **Shelf** view shows the games as spines on a shelf, one shelf per platform with the biggest first,
in the current sort order. Platforms with fewer than 10 boxed games in the collection share one **Other
platforms** shelf. Each spine is a plain colour taken from the game's title, and the band on top is the
platform's colour. Its height follows the platform's case: DVD cases, then Blu-ray and UMD cases, then
handheld boxes. Games built into a console (condition **Built-in Console**) aren't spines. Each console
stands on a last **Built into consoles** shelf, and clicking one opens its home screen with its games. Hovering
a spine or a game (or focusing it with the keyboard) shows the game's details, and clicking it opens the game.
Previous and Next follow the shelf order.

## Running it

```sh
npm install
npm run dev      # http://localhost:5173 — viewing + editing
```

When it runs through `npm run dev`, the app has a small local API that allows
**adding, editing and deleting games** and **managing images**. A game can have
several images: drop, pick, paste or fetch them from a URL, and mark one as the cover.

The **Game of the Month** and **Awards** tabs are editable locally too:
add or edit months (games played with their status, bought count; the completed count
is worked out from the ✅ games), add or edit yearly awards and stats (a new year copies
last year's categories), The all-time top-5 lists are
worked out from the collection's ratings (ties go to the most recently completed game), so they
update by themselves.

A game's **Last played** is the latest Game of the Month entry that lists it. It's worked out when
the page loads, so nothing needs to be set on the game.

The **Stats** tab charts the game collection (not the other collections). It shows this year's
acquired and completed games against the same date last year, plus the completion rate, how many games
are complete in box, and the play time tracked. It also has charts for acquired and completed games per
year, platforms by status, ratings, genres, what came in the box, and the most-played games. It's all
worked out from `games.json` when the page loads, so there's nothing to edit. Clicking a bar opens the
collection filtered to those games, or the game itself for **Most played**.

The **Timeline** tab puts the game side of the site in date order, newest first, grouped by year and month:
games acquired and completed, Game of the Month and Game of the Year winners, Casting a Dream trophies,
gallery pictures and blog posts (not drafts). Games acquired or completed on the same day share one entry.
Acquired dates written as text ("Late 2013 - Early 2014") sit at the end of their year or month, and
"Before 2012" comes last. The chips at the top switch kinds of events on and off. **On this day** at the top
lists what happened on today's date in earlier years. Its arrows step through other days. Like Stats, it's
worked out when the page loads.

Each year on the **Awards** tab has a **Year in Review**: a story to tap through, built only from that year's
awards and stats. It shows the numbers against the year before, the best game of each quarter, platform and
genre champions, the biggest surprise and disappointment, the most memorable moment, the special awards, rating
changes, the Console of the Year and, last, a countdown to the Game of the Year. Slides with nothing in them
are skipped. Click or tap the right of the card (or press →) to go on, and the left (or ←) to go back. The
link to a review (`?tab=gotc&review=2025`) opens it straight away.

The **Map** tab shows where the games were bought. Each game has a **Bought in** country
(for a gift, where the giver bought it), set in the game's edit form. Hovering a country shows
how many games came from it, and clicking it lists them. The map opens on Europe; a button
switches to the whole world.

The **Gallery** tab holds free-form pictures: add a picture (drop, pick, paste or fetch it
from a URL), its date, a description and the games shown in it, if any. Pictures are resized
to 1600px. The static build has no API, so it's view-only.

The **Consoles** tab lists the consoles, grouped by maker. Each one names the platform its games
are filed under, so it shows how many games it has and links to them in the collection. A console
can list the **models** owned (say, a PS2 Fat and a PS2 Slim), each with one of its pictures. It
also has a maker, when it was acquired, and notes. The console pictures come from the internet.

The **Blog** tab holds short posts: a title, a date, an optional cover image and plain text.
Leave a blank line between paragraphs; links are clickable. Tick **Draft** to keep a post to yourself: drafts only show while
editing locally, not on the published site (they're still in `blog.json`, so they're in the repo). Locally, **+ New post** writes one and **Edit** changes or deletes it.

The **Casting a Dream** tab is about [Casting a Dream](https://github.com/radovanovic-stevan/casting-a-dream),
the Mac launcher I play my emulated games with. It lists every game in the launcher by system, with its play time
and last played date, and each game's trophies (earned ones dated; secret ones hidden until earned). The data comes
from `public/data/casting-a-dream.json`, which the launcher rewrites whenever its library, play time or trophies
change. For the games it plays, the launcher's play time replaces the game's **Playtime** across the site, and a
game with launcher trophies gets a **Trophies** link to its list on this tab. Launcher games are found in the
collection with the same search the launcher's collection link uses (title plus platform).

**Other collections** that aren't games (for now, **Dylan Dog** comics) get their own tabs after
the game tabs, with their own colours. Each series is a checklist of issue numbers or book titles,
marked owned or missing. Locally, **Tick off issues** lets you click issues to switch them
(and **+** adds the next number), and each series' **Edit** sets its name and its owned and
missing issues as ranges like `1-10, 12`.

The **Vinyl** tab is a cover grid of records, with pictures like the games (the first one becomes
the cover). Each record keeps a listening log: one entry per side played (1, 2, A, B, …) with its
date. Locally, open a record to set or change dates, change sides, remove entries, or log a side
played today. **Needs dates** shows the records that still have listens without a date.

**What's new**: on the published site, a returning visitor gets a pop-up listing what changed since
their last visit: new and updated games (with what changed, like a rating or status), Game of the
Month, awards, pictures, consoles, blog posts, Dylan Dog issues and records. Removed items aren't
listed. It works from a copy of the data saved in the visitor's browser, so a first visit (or one after
clearing site data) shows nothing. It's off while editing locally.

## Where the data lives

Everything is plain files in the repo. There is no database.

| Path | What |
| --- | --- |
| `public/data/games.json` | The collection. Edited by the app, or by hand. |
| `public/images/` | Game images, named `<id>-<hash>.<ext>`. A game's `images` lists its files and `cover` picks one of them. Gallery pictures are named `gallery-<id>-<hash>.jpg`. |
| `public/data/gotm.json` | Game of the Month: every month's games played, completed and bought counts, and the winner. |
| `public/data/gotc.json` | Awards: yearly awards and yearly stats. |
| `public/data/gallery.json` | Gallery: each picture's image file, date, description and the games in it. |
| `public/data/dylan-dog.json` | Dylan Dog: each series and which of its issues are owned. |
| `public/data/vinyl.json` | Vinyl: each record's artist, album, images and listening log. Images are `vinyl-<id>-<hash>.<ext>`. |
| `public/data/consoles.json` | Consoles: name, maker, platform, acquired, notes, models and images. Images are `console-<id>-<hash>.jpg`. |
| `public/data/blog.json` | Blog posts, newest first. Cover images are `blog-<id>-<hash>.jpg`. |
| `public/data/casting-a-dream.json` | Written by the Casting a Dream launcher: its games, play time and trophies. Don't edit by hand; the launcher overwrites it. |
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
