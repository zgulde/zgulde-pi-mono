# AGENTS.md

Instructions for coding agents working in this repository.

## What this is

A monorepo of extensions for [pi](https://pi.dev). Each `pi-*` subdirectory is a
standalone pi package that installs one or more extensions into the agent.

Current packages:

- `pi-md-preview` — `/preview` command that renders the latest assistant
  response as Markdown in the browser
- `pi-stoplight` — three-state tool access control (`Shift+Tab` to cycle)
- `pi-tok-per-sec` — output tokens/second in the status line

## Package structure convention

Every extension package follows the same shape. Treat `pi-md-preview` as the
reference implementation.

```text
pi-<name>/
├── index.ts        # entry point: default export (pi: ExtensionAPI) => ...
├── package.json    # pi manifest + deps + scripts
├── tsconfig.json   # typecheck config
├── README.md       # what it does, install and dev notes
└── src/            # optional helper modules (see pi-stoplight)
```

### package.json

Fields are kept uniform across packages:

```json
{
  "name": "pi-<name>",
  "version": "0.1.0",
  "description": "...",
  "type": "module",
  "license": "MIT",
  "keywords": ["pi-package"],
  "dependencies": {
    "marked": "^15.0.12"
  },
  "devDependencies": {
    "typescript": "^5.9.3"
  },
  "peerDependencies": {
    "@earendil-works/pi-coding-agent": "*"
  },
  "pi": {
    "extensions": ["./index.ts"]
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  }
}
```

Rules:

- `name` must match the directory name (`pi-md-preview` lives in
  `pi-md-preview/`).
- `pi.extensions` must point at the package-root `index.ts`. pi reads this
  manifest to find the entry point; don't use convention directories
  (`extensions/`) or nested `src/index.ts`.
- `@earendil-works/pi-coding-agent` is a peer dependency with `"*"`. pi
  provides it at runtime; never put it in `dependencies` or `devDependencies`.
  npm auto-installs the peer so `typecheck` can resolve the types.
- Runtime dependencies go in `dependencies`. npm workspaces resolves them from
  the single root lockfile and hoists them where possible; conflicting versions
  stay nested under their own package.
- Dev tooling (`typescript`, `tsx`, `@types/node`) goes in `devDependencies`.
- `type: module` is required — extensions are loaded as ESM.

### index.ts

The entry point exports a default factory:

```ts
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  // pi.on(...), pi.registerCommand(...), pi.registerTool(...), pi.registerShortcut(...)
}
```

- Helpers live in `src/` and are imported with an explicit `.ts` extension
  (`import ... from "./src/foo.ts"`). When using `.ts` imports, that package's
  `tsconfig.json` needs `"allowImportingTsExtensions": true`.
- pi loads TypeScript directly via jiti — there is no build step, and Node.js
  built-ins (`node:fs`, `node:path`, ...) are available.

### Why a root index.ts

The agent derives an extension's label from its entry path. A manifest that
points at a package-root `index.ts` yields the cleanest label — the package
name (npm/git installs) or the install path (local installs) — with no suffix.
Nested entries append a `:subpath` suffix: `extensions/foo.ts` shows as
`…:foo`, `src/index.ts` as `…:src`. Keep the entry at the root so names stay
clean.

## Install

`make install` runs `npm install` (all workspaces, one root lockfile) and then
registers each package with pi:

```bash
npm install
pi install ./pi-md-preview
pi install ./pi-stoplight
pi install ./pi-tok-per-sec
```

`pi install` writes local-path references into `~/.pi/agent/settings.json`
(no copying). Run `/reload` in pi to pick up changes.

## Adding an extension

1. Create `pi-<name>/` following the convention above.
2. Add `pi install ./pi-<name>` to the `install:pi` script in the root
   `package.json`. (The `pi-*` workspaces glob already covers dependency
   installs, but the install script enumerates packages explicitly.)
3. Run `make install`, then `make check`.

## Checks

- `make check` — typecheck all packages and run tests
- `make typecheck` — `tsc --noEmit` across all workspaces
- `make test` — run test scripts (`pi-stoplight` has the only suite)
- Per package: `npm run check -w pi-<name>`, `npm run typecheck -w pi-<name>`

Run `make check` before committing.
