# Contributing to ride2fde

Thank you for wanting to help. ride2fde is a small community tool that helps people heading to
[FDE Summit](https://fdesummit.dev/) share a ride to IIT Hyderabad. Bug reports, ideas, docs, design, testing on
real devices and code are all welcome, whatever your experience level.

By taking part you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Contributions are released under the
[MIT License](LICENSE).

## Ways to help

- **Report a bug** or something confusing: [open an issue](../../issues/new/choose).
- **Suggest an idea.** Check the [ideas list](README.md#known-limitations-and-ideas) first, then open an issue.
- **Improve the docs**, including the README and this file.
- **Test it** on your own phone or browser and tell us what broke.
- **Pick up an issue** labelled [`good first issue`](../../labels/good%20first%20issue) or
  [`help wanted`](../../labels/help%20wanted).

For anything bigger than a small fix, **open an issue first** so we can agree on the approach before you spend time on
it. A short comment on an existing issue saying "I'd like to take this" is enough to claim it.

## The principles behind the project

Changes that fit these are easy to accept:

- **Keep it simple.** This is a one-event tool, not a platform. Prefer small, clear changes over new machinery.
- **Privacy first.** Don't collect data we don't need. Never store street addresses. Think about what a new field
  would expose to anyone with the link.
- **Works on a phone.** Touch targets of at least 44 px, visible keyboard focus, and layouts that work at 390 px wide.
- **Few dependencies.** The app is plain TypeScript with Vite and no UI framework. Please discuss before adding a
  library.
- **No secrets in the repo.** Ever. See below.

## Getting set up

The full walkthrough is in the [README](README.md#run-it-yourself). You need **Node.js 22.12 or newer**. The short
version:

```bash
git clone https://github.com/<your-username>/ride2fde.git   # your fork
cd ride2fde
npm install
npm run map:assets              # downloads the map data for the region (~38 MB), once
npm run db:migrate:local        # creates the local database, no Cloudflare account needed
npm run build                   # once
npm run pages:dev               # terminal 1: the API on :8788
npm run dev                     # terminal 2: the app on :5173
```

No map API key is needed: the map, search and routing use free OpenStreetMap services. For local work you can leave
the `database_id` in `wrangler.toml` as it is.

## Making a change

1. **Fork** the repo and create a **branch** from `main`, for example `fix/route-fallback` or `feat/departure-time`.
2. Make your change. A few conventions:
   - TypeScript in strict mode, 2-space indentation, double quotes, semicolons. An `.editorconfig` is included.
   - Code that both the browser and the server use lives in `shared/`. Keep it free of browser-only and
     server-only APIs.
   - **Database changes need a new migration** in `migrations/`, numbered in order (`0005_...sql`). **Never edit a
     migration that already exists**, because it may already have run on the live database.
   - If you change behaviour, update the README (and the API section if you touched `/api`).
3. **Check it** before you push:

   ```bash
   npm run typecheck     # type-checks the app and the server function
   npm run build
   ```

   There is no automated test suite yet, so please also **try your change in the browser**, at desktop and phone
   width, on the map view(s) it touches. Adding tests for the code in `shared/` would be a very welcome contribution.
4. **Commit** with a clear message in the imperative: `Add departure time to the form`, not `added stuff`.
5. **Open a pull request** against `main` and fill in the template. For visible changes, add before and after
   screenshots.

### Pull request checklist

- [ ] `npm run typecheck` and `npm run build` pass (CI runs both for you).
- [ ] I tried it in a browser, on desktop and on a phone-sized window.
- [ ] No secrets, API keys, `.env` files or real people's details are included.
- [ ] Screenshots use made-up demo data, not real attendees.
- [ ] Docs are updated if behaviour changed.
- [ ] Any database change is a new migration file.

## What a review looks like

The maintainer ([@eshwarsgithub](https://github.com/eshwarsgithub)) reviews every pull request, usually within a few
days. Expect questions and requests for small changes: that is normal, not a rejection. Once CI is green and the
review is approved, the change is merged. **Merging does not deploy the live site**; the maintainer does that
separately.

## Things to avoid

- **Don't commit `.env`** or any key. If you do by accident, tell the maintainer straight away so the key can be
  rotated, because deleting it in a later commit does not remove it from history.
- **Don't test against the live site's API.** Anything you submit there becomes a real entry visible to real people.
  Use your local copy.
- **Don't include real people's names, numbers or locations** in issues, screenshots or test data.

## Security

Please **don't report security problems in a public issue.** See [SECURITY.md](SECURITY.md) for how to report them
privately.

## Questions

Open an issue with the `question` label. Nobody minds being asked.
