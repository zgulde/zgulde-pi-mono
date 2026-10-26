# pi-turn-verb

Claude Code-style flavor text for pi: a random-verb spinner while pi works
(`⠹ Fermenting…`) and an end-of-turn transcript line
(`Fermented for 26s · done 6:23 PM`).

The end-of-turn lines are stored as custom session entries — visible in the
transcript and on `/resume`, but never sent to the model.

## Install

From the monorepo root:

```bash
make install
```

or, if already installed:

```bash
pi install ./pi-turn-verb
```

## Development

```bash
npm run typecheck -w pi-turn-verb
```
