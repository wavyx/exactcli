# Contributing

Thanks for your interest in `exactcli`.

## Setup

```sh
git clone https://github.com/wavyx/exactcli.git
cd exactcli
npm install
./bin/dev.js --help      # run from source, no build
```

Node.js 20 or newer. `exactcli` is JavaScript ESM on oclif v4. No TypeScript; JSDoc
types where they help.

## Workflow

1. Branch from `main`: `feat-<topic>`, `fix-<topic>`, `docs-<topic>`.
2. Write the failing test first, then the code. Tests live under `test/` and mirror
   `src/` one to one (vitest + nock).
3. Keep coverage at 100% on the files you touch: `npm run test:coverage`.
4. Run `npm run lint` (ESLint + Prettier) before every commit. `npm run lint:fix`
   formats for you.
5. Use Conventional Commits with a scope when useful: `feat(auth): ...`,
   `fix(client): ...`, `docs: ...`. Keep the subject under 55 characters.
6. Open a pull request. CI runs lint, tests on Node 20/22/24 across three operating
   systems, and a smoke build.

## Rules that keep the CLI safe

- Secrets go to the keychain only. Never log, print or store a token or a client
  secret.
- Every HTTP call to the API goes through `src/lib/client.js`; the only exception is the
  OAuth token endpoint in `src/lib/auth.js` (no retries by design). Do not call `fetch`
  anywhere else.
- Never retry a 4xx except the single 401 refresh and 429. Keep API calls sequential.
- New commands extend `BaseCommand`, spread the shared flags, and end with
  `outputResults` or `outputAction` so `--output`, `--jq` and `--fields` work.
- `docs/commands.md` is generated: run `npm run docs:commands`, do not edit it by hand.
  The same run writes the command reference of the site.
- The site lives in `website/` (Astro and Starlight): `cd website && npm install && npm
run dev`. The docs workflow deploys it to GitHub Pages on a push to `main`.
- A typed command names the calls it makes at the end of its description, for example
  `(POST crm/Accounts)`. `npm run docs:coverage` reads these names to generate
  `docs/coverage.md`. After a live check of a write call on a test administration, add
  the call to `scripts/live-writes.json`.
- Prose in files: plain English, ASCII only.

## Release

Maintainers bump `package.json`, update `CHANGELOG.md`, tag `vX.Y.Z` and push the tag.
The release workflow publishes to npm (OIDC trusted publishing), creates the GitHub
release from the changelog section, and pushes the Homebrew formula to
`wavyx/homebrew-tap` when the `TAP_TOKEN` secret is set.
