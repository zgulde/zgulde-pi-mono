# pi-subagent

Delegate tasks to specialized subagents with isolated context windows.

Each subagent runs in a separate `pi` process (`--mode json -p --no-session`),
so its conversation — tool calls, thinking, intermediate results — never
pollutes the parent agent's context. The parent LLM calls it like any other
tool and receives back only the subagent's final answer.

## Install

```bash
make install          # npm install + pi install ./pi-subagent
```

Then `/reload` in pi, or restart.

The extension itself is registered via the package manifest. The sample
`agents/` and `prompts/` in this directory are **not** discovered from inside
the package — pi looks them up in `~/.pi/agent/agents/` and
`~/.pi/agent/prompts/` respectively. `make install` does not copy them; to
install (or refresh) the samples:

```bash
mkdir -p ~/.pi/agent/agents
cp -n pi-subagent/agents/*.md ~/.pi/agent/agents/
cp -n pi-subagent/prompts/*.md ~/.pi/agent/prompts/
```

`-n` keeps `cp` from clobbering any agents/prompts you already have with the
same name.

## Agents

Agents are markdown files with YAML frontmatter; the body is the subagent's
system prompt.

```markdown
---
name: my-agent
description: What this agent does
tools: read, grep, find, ls
model: claude-haiku-4-5
---

System prompt for the agent goes here.
```

- `name`, `description` — required.
- `tools` — comma-separated list (or YAML array); omit to inherit defaults.
- `model` — omit to inherit the dispatching session's active model.

Locations:

- `~/.pi/agent/agents/*.md` — user-level (always loaded)
- `.pi/agents/*.md` — project-level (only with `agentScope: "project"`/`"both"`)

## Tool modes

| Mode     | Parameter        | Description                                              |
|----------|------------------|----------------------------------------------------------|
| Single   | `{ agent, task }`| One agent, one task                                      |
| Parallel | `{ tasks: [...] }`| Multiple agents, concurrent (max 8, 4 at once)          |
| Chain    | `{ chain: [...] }`| Sequential, `{previous}` placeholder threads output forward |

## Sample content

- Agents: `scout` (fast recon), `planner`, `reviewer`, `worker`.
- Prompt templates: `/implement`, `/scout-and-plan`, `/implement-and-review`.

## Development

```bash
npm run typecheck -w pi-subagent
```

The extension is written against the peer deps in this monorepo
(`@earendil-works/pi-coding-agent` and siblings). pi provides them at runtime;
npm auto-installs the peers so `tsc` can resolve the types.
