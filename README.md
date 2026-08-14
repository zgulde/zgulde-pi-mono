# zgulde-pi-mono

A monorepo of [pi](https://github.com/earendil-works/pi) extensions:

- **pi-md-preview** — open the latest assistant response as rendered Markdown
  in the browser (`/preview`)
- **pi-stoplight** — three-state tool access control (`Shift+Tab` to cycle)
- **pi-tok-per-sec** — output tokens/second in the status line

Each extension is a pi package with its own `package.json` and a `pi.extensions`
manifest pointing at a root `index.ts`, so all three install the same way and
show up by package name in the agent.

## Install

```bash
make install
```

This runs `npm install` (one lockfile for all workspaces) and then registers
each extension with pi:

```bash
npm run install:pi
```

Equivalent to:

```bash
pi install ./pi-md-preview
pi install ./pi-stoplight
pi install ./pi-tok-per-sec
```

Packages are added to `~/.pi/agent/settings.json` as local-path references (no
copying). Restart pi or run `/reload` to pick them up.

## Development

```bash
make check    # typecheck all workspaces + run pi-stoplight tests
make typecheck
make test
```
