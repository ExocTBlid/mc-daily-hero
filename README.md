# Daily Hero

One Marvel Champions hero deck a day. The site is static. Each day is a JSON file in `decks/`. There is no database.

The deck is built by Grok from the player cards in [marvelsdb-json-data](https://github.com/zzorba/marvelsdb-json-data), then checked locally. If the list is still illegal after three tries, that day is a published [MarvelCDB](https://marvelcdb.com/) deck instead, with a link back to it.

## Run it locally

```bash
npm ci
npm test
npm run dev
```

`npm run generate` writes today's deck. It needs `XAI_API_KEY` in the environment. Without the key, the job uses a MarvelCDB fallback when it can find a legal list for the hero.

`npm run sync-cards` refreshes `data/player-cards.json` from the card-data repo.

## Deploy

The host is GitHub Pages, from this repo.

1. Make the repository public.
2. Settings → Pages → Build and deployment → GitHub Actions.
3. Add a repository secret named `XAI_API_KEY`.
4. For a project site (`username.github.io/repo`), add a variable `BASE_PATH` set to `/repo/`. A user site or a custom domain stays at `/`. `SITE_URL` is optional and should be the full origin, such as `https://username.github.io`.
5. Run the "Deck of the day" workflow once from the Actions tab.

The schedule runs at 07:05 and 08:05 UTC so midnight US Pacific is covered in both daylight time and standard time. The second run finds the day's file and leaves it. Both runs rebuild the site, so the front page date stays current. Card data refreshes on Mondays.

Heroes are shuffled once per year. A hero comes up again only after every hero has been used the same number of times.
