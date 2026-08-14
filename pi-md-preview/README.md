# pi-md-preview

A small pi extension that opens the latest assistant response as rendered
Markdown in the system browser.

## Install

From the monorepo root:

```bash
make install
```

or, if already installed:

```bash
pi install ./pi-md-preview
```

For a local extension, either pass it directly:

```bash
pi -e ./index.ts
```

or place the project under `~/.pi/agent/extensions/` and configure the package
as described in the pi extension documentation.

## Usage

After an assistant response, run:

```text
/preview
```

The extension finds the latest assistant message on the active session branch,
converts its text content with `marked`, writes a temporary standalone HTML
file, and opens that file in the default browser.

The generated page includes responsive typography, styled code blocks,
tables, blockquotes, images, and light/dark mode support.

## Development

```bash
npm install
npm run typecheck
```

The extension currently creates one temporary HTML file per preview. It does
not start a server, retain preview history, or watch for new responses.
