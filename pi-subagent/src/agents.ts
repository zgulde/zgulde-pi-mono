/**
 * Agent discovery and configuration
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { CONFIG_DIR_NAME, getAgentDir, parseFrontmatter } from "@earendil-works/pi-coding-agent";

export type AgentScope = "user" | "project" | "both";

export interface AgentConfig {
	name: string;
	description: string;
	/** Optional author-curated one-liner for compact roster listings. */
	summary?: string;
	tools?: string[];
	model?: string;
	systemPrompt: string;
	source: "user" | "project";
	filePath: string;
}

export interface AgentDiscoveryResult {
	agents: AgentConfig[];
	projectAgentsDir: string | null;
}

/**
 * Raw agent frontmatter. Values are `unknown` because `parseFrontmatter` runs a
 * real YAML parser, so any scalar or collection can appear here.
 *
 * A type alias rather than an interface: `parseFrontmatter` constrains its
 * parameter to `Record<string, unknown>`, and only an alias picks up the
 * implicit index signature that satisfies it.
 */
type AgentFrontmatter = {
	name?: unknown;
	description?: unknown;
	summary?: unknown;
	tools?: unknown;
	model?: unknown;
};

/**
 * Normalize a frontmatter `tools` value to a list of tool names.
 *
 * Both spellings are valid YAML and both are in use:
 *
 *     tools: read, bash        # string
 *     tools: [read, bash]      # array
 *
 * so accept either. Anything else (a number, a map, a nested list) yields no
 * tools rather than throwing: this runs inside agent discovery, where a single
 * bad file must not take down every other agent in the same directory.
 */
function parseToolList(value: unknown): string[] | undefined {
	const raw = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
	const tools = raw
		.filter((t): t is string => typeof t === "string")
		.map((t) => t.trim())
		.filter(Boolean);
	return tools.length > 0 ? tools : undefined;
}

function loadAgentsFromDir(dir: string, source: "user" | "project"): AgentConfig[] {
	const agents: AgentConfig[] = [];

	if (!fs.existsSync(dir)) {
		return agents;
	}

	let entries: fs.Dirent[];
	try {
		entries = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return agents;
	}

	for (const entry of entries) {
		if (!entry.name.endsWith(".md")) continue;
		if (!entry.isFile() && !entry.isSymbolicLink()) continue;

		const filePath = path.join(dir, entry.name);
		let content: string;
		try {
			content = fs.readFileSync(filePath, "utf-8");
		} catch {
			continue;
		}

		const { frontmatter, body } = parseFrontmatter<AgentFrontmatter>(content);

		if (typeof frontmatter.name !== "string" || typeof frontmatter.description !== "string") {
			continue;
		}

		agents.push({
			name: frontmatter.name,
			description: frontmatter.description,
			summary: typeof frontmatter.summary === "string" ? frontmatter.summary : undefined,
			tools: parseToolList(frontmatter.tools),
			model: typeof frontmatter.model === "string" ? frontmatter.model : undefined,
			systemPrompt: body,
			source,
			filePath,
		});
	}

	return agents;
}

function isDirectory(p: string): boolean {
	try {
		return fs.statSync(p).isDirectory();
	} catch {
		return false;
	}
}

function findNearestProjectAgentsDir(cwd: string): string | null {
	let currentDir = cwd;
	while (true) {
		const candidate = path.join(currentDir, CONFIG_DIR_NAME, "agents");
		if (isDirectory(candidate)) return candidate;

		const parentDir = path.dirname(currentDir);
		if (parentDir === currentDir) return null;
		currentDir = parentDir;
	}
}

export function discoverAgents(cwd: string, scope: AgentScope): AgentDiscoveryResult {
	const userDir = path.join(getAgentDir(), "agents");
	const projectAgentsDir = findNearestProjectAgentsDir(cwd);

	const userAgents = scope === "project" ? [] : loadAgentsFromDir(userDir, "user");
	const projectAgents = scope === "user" || !projectAgentsDir ? [] : loadAgentsFromDir(projectAgentsDir, "project");

	const agentMap = new Map<string, AgentConfig>();

	if (scope === "both") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	} else if (scope === "user") {
		for (const agent of userAgents) agentMap.set(agent.name, agent);
	} else {
		for (const agent of projectAgents) agentMap.set(agent.name, agent);
	}

	return { agents: Array.from(agentMap.values()), projectAgentsDir };
}

/**
 * One-line roster entry for an agent: the curated `summary` frontmatter field
 * if present, else the first sentence of `description`, truncated to `max`
 * characters. The roster exists to prevent name-guessing, not to sell the
 * agent — keep it cheap.
 */
export function compactAgentDescription(agent: AgentConfig, max = 90): string {
	const text = (agent.summary ?? agent.description).trim();
	const firstSentence = text.split(/(?<=[.!?])\s/, 1)[0] ?? text;
	const trimmed = firstSentence.trim();
	if (trimmed.length <= max) return trimmed;
	return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Compact single-line roster text: one entry per agent, each entry the agent
 * name, source, and a one-line description (see `compactAgentDescription`).
 */
export function formatAgentList(
	agents: AgentConfig[],
	maxItems: number,
): { text: string; remaining: number } {
	if (agents.length === 0) return { text: "none", remaining: 0 };
	const listed = agents.slice(0, maxItems);
	const remaining = agents.length - listed.length;
	return {
		text: listed
			.map((a) => `${a.name} (${a.source}): ${compactAgentDescription(a)}`)
			.join("; "),
		remaining,
	};
}

function levenshtein(a: string, b: string): number {
	const dp = Array.from({ length: b.length + 1 }, (_, i) => i);
	for (let i = 1; i <= a.length; i++) {
		let prev = dp[0];
		dp[0] = i;
		for (let j = 1; j <= b.length; j++) {
			const tmp = dp[j];
			dp[j] = Math.min(
				dp[j] + 1,
				dp[j - 1] + 1,
				prev + (a[i - 1].toLowerCase() === b[j - 1].toLowerCase() ? 0 : 1),
			);
			prev = tmp;
		}
	}
	return dp[b.length];
}

/**
 * Suggest agent names similar to the given (unknown) name: case-insensitive
 * prefix/substring matches plus edit-distance matches, capped at 3.
 */
export function suggestSimilarAgents(
	name: string,
	agents: AgentConfig[],
	max = 3,
): string[] {
	const lower = name.toLowerCase();
	const scored = agents
		.map((a) => {
			const target = a.name.toLowerCase();
			let score: number;
			if (target === lower) score = 0;
			else if (target.startsWith(lower) || lower.startsWith(target)) score = 1;
			else if (target.includes(lower) || lower.includes(target)) score = 2;
			else score = levenshtein(lower, target);
			return { name: a.name, score };
		})
		// Ignore suggestions worse than a couple of edits; longer names get a
		// little more slack so e.g. "reviewer" vs "code-reviewer" still matches.
		.filter((s) => s.score <= Math.max(2, Math.floor(name.length / 4)))
		.sort((a, b) => a.score - b.score)
		.slice(0, max);
	return scored.map((s) => s.name);
}

/**
 * Resolve an agent name that may carry a scope prefix like "user:worker".
 * Scopes are directories, not part of the agent name, so models sometimes
 * pattern-match the scope docs into "scope:name" input. Accept it when the
 * suffix matches exactly; return undefined otherwise (caller falls through to
 * the unknown-agent error).
 */
export function resolveScopedAgentName(
	raw: string,
	agents: AgentConfig[],
): string | undefined {
	if (agents.some((a) => a.name === raw)) return raw;
	const colon = raw.indexOf(":");
	if (colon <= 0) return undefined;
	const scope = raw.slice(0, colon);
	if (scope !== "user" && scope !== "project") return undefined;
	const name = raw.slice(colon + 1);
	return agents.some((a) => a.name === name) ? name : undefined;
}

/**
 * Build the unknown-agent error message, including close-match suggestions
 * and a hint when the input looks like a scope-qualified name.
 */
export function unknownAgentMessage(
	name: string,
	agents: AgentConfig[],
): string {
	const available =
		agents.map((a) => `${a.name} (${a.source})`).join(", ") || "none";
	const suggestions = suggestSimilarAgents(name, agents);
	const lines = [`Unknown agent: "${name}". Available agents: ${available}.`];
	if (suggestions.length > 0)
		lines.push(`Did you mean: ${suggestions.map((s) => `"${s}"`).join(", ")}?`);
	if (name.includes(":"))
		lines.push(
			'Note: "user" and "project" are agent directories (scopes), not part of the agent name — use the plain name, e.g. agent: "worker".',
		);
	return lines.join(" ");
}
