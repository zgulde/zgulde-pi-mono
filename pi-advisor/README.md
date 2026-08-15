# pi-advisor

A pi extension that registers a single tool, `advisor`, which the main agent
can call to get a second opinion from a "smarter" advisor model: a design
critique, a critical review of the current plan or code, or pointed feedback —
mid-turn, without leaving the session.

An advisor call is **a single in-process model call, not an agent run**. No
subprocess, no separate context window, no tool access. The main agent sends
its situation as text and receives the advisor's answer as the tool result.

## Install

From the monorepo root:

```bash
make install
```

or, if pi-advisor is already registered:

```bash
pi install ./pi-advisor
```

Then `/reload` in pi (or restart).

## Usage

The main agent calls the `advisor` tool with:

- `question` (required) — the situation, plan, design, or code to react to,
  written in the agent's own words.
- `context` (optional) — code snippets, diffs, or background the advisor
  should consider. The advisor does **not** see conversation history; it only
  sees `question` plus whatever you put in `context`.

Example tool call:

```json
{
  "question": "Critique this plan to add a caching layer to the read path.",
  "context": "```ts\n// sketch\nexport function get(key) { ... }\n```"
}
```

## How it works

- Advisor persona (a terse senior-engineer second opinion) is baked in.
- The advisor model is `glm-5.2` on the `opencode-go` provider (matched by
  provider + id, since a bare model id can exist under multiple providers).
  If that model is unavailable, the tool falls back to the session's active
  model.
- Output is capped to 8192 tokens. Esc aborts the call.
- The returned `usage` is attributed to the tool result, so advisor spend
  flows into the footer, `/session`, and RPC session totals.

## Development

```bash
npm run typecheck -w pi-advisor
```

The extension is written against the peer deps in this monorepo
(`@earendil-works/pi-coding-agent`, `@earendil-works/pi-ai`,
`@earendil-works/pi-tui`) plus `typebox`. pi provides them at runtime; npm
auto-installs the peers so `tsc` can resolve the types.
