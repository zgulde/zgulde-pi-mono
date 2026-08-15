# pi-stoplight

A pi extension that controls agent tools with three modes:

- 🟢 Green: all tools enabled
- 🟡 Yellow: `edit`, `write`, and `bash` disabled
- 🔴 Red: no tools enabled
- `/stoplight` command cycles modes (pi-web friendly)

Press `Shift+Tab` to cycle modes — web users can use `/stoplight` instead.

## Install

From the monorepo root:

```bash
make install
```

or, if already installed:

```bash
pi install ./pi-stoplight
```

## Development

```bash
npm install
npm run check
```
