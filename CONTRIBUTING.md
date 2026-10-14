# Contributing

Thanks for your interest in improving Trading Chart SDK.

## Setup

```bash
npm install
npm run dev        # playground at http://localhost:5180
```

Node.js 20.19 or newer is required.

## Before opening a pull request

```bash
npm run verify     # architecture, lint, format, types, unit tests, build, bundle size
npm run test:e2e   # Chromium, Firefox and WebKit
```

Add tests for behavior you change: unit tests next to the module under `packages/*/test`, end-to-end tests under `e2e` for anything that depends on real input or rendering.

## Code guidelines

- Read [the architecture notes](docs/architecture.md) first; the layering is enforced by `npm run check:architecture`.
- Validate input at the API boundary and throw a `ChartError` that names the bad value. Do not silently correct input or fall back to defaults that hide mistakes.
- API calls must not emit events; only user actions do.
- Keep caches owned by a chart instance, keyed by revisions and bounded.
- No compatibility shims, commented-out code, `TODO` markers or suppression comments.

## Commit messages

Use the [Conventional Commits](https://www.conventionalcommits.org/) style, e.g. `feat(core): add pitchfork drawing`.
