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
4. Open Settings → Secrets and variables → Actions → the Variables tab (not Secrets). Add two repository variables. This repo is published at `https://exoctblid.github.io/mc-daily-hero/`, so the values are `BASE_PATH` = `/mc-daily-hero` and `SITE_URL` = `https://exoctblid.github.io`. `BASE_PATH` starts with a slash and has no slash at the end. Leave both unset only if the repository itself is named `ExocTBlid.github.io` or the site uses a custom domain at the root of that domain.
5. Run the "Deck of the day" workflow once from the Actions tab. That commits the first deck. The Test workflow publishes the site after its tests pass on `main`.

The schedule runs at 07:05 and 08:05 UTC so midnight US Pacific is covered in both daylight time and standard time. The second run finds the day's file and leaves it. A push to `main`, including that new deck, is published only after the Test workflow succeeds. On `main`, that workflow runs semantic-release after the tests and then builds and deploys. Card data refreshes on Mondays.

semantic-release reads [Conventional Commits](https://www.conventionalcommits.org/). `fix:` raises the patch version, `feat:` raises the minor version, and `feat!:` or a `BREAKING CHANGE:` footer raises the major version. Other commits leave the version as it is. The daily deck and card-snapshot commits are written that way on purpose. A release updates `package.json`, tags the commit, and opens a GitHub release. The package is private, so nothing is published to npm. The version at the bottom of the page is the `version` in `package.json`. The site is built after the release step, so a new version is the one that deploys. The package starts at 1.0.0; the first conventional commit on `main` publishes that version when no release exists yet.

Heroes are shuffled once per year. A hero comes up again only after every hero has been used the same number of times. A second form of the same hero, such as Archangel or another Ironheart armor, shares that hero's turn. Aspects are dealt the same way: the one furthest behind comes up next, and a hero who plays two aspects gets the two furthest behind.
