const STOPLIGHT_MODES = ["green", "yellow", "red"] as const;

export type StoplightMode = (typeof STOPLIGHT_MODES)[number];

export interface StoplightModeDefinition {
	emoji: string;
	label: string;
	statusText: string;
	systemPrompt: string;
}

export const DEFAULT_MODE: StoplightMode = "green";

export const MODE_DEFINITIONS: Readonly<
	Record<StoplightMode, StoplightModeDefinition>
> = {
	green: {
		emoji: "🟢",
		label: "Green",
		statusText: "🟢 Green: all tools",
		systemPrompt: [
			"[PI STOPLIGHT: GREEN]",
			"All tools enabled.",
		].join("\n"),
	},
	yellow: {
		emoji: "🟡",
		label: "Yellow",
		statusText: "🟡 Yellow: read only",
		systemPrompt: [
			"[PI STOPLIGHT: YELLOW]",
			"Read-only/planning/research mode is active. You may read files, grep, & websearch, but not make any changes. The subagent tool is also disabled — subagents cannot be spawned in this mode.",
		].join("\n"),
	},
	red: {
		emoji: "🔴",
		label: "Red",
		statusText: "🔴 Red: no tools",
		systemPrompt: [
			"[PI STOPLIGHT: RED]",
			"Discuss only - no tools are enabled.",
		].join("\n"),
	},
};

const YELLOW_DISABLED_TOOLS = new Set(["edit", "write", "bash", "subagent"]);

export function isStoplightMode(value: unknown): value is StoplightMode {
	return (
		typeof value === "string" &&
		STOPLIGHT_MODES.includes(value as StoplightMode)
	);
}

export function nextMode(mode: StoplightMode): StoplightMode {
	const index = STOPLIGHT_MODES.indexOf(mode);
	return STOPLIGHT_MODES[(index + 1) % STOPLIGHT_MODES.length] ?? DEFAULT_MODE;
}

export function getActiveToolsForMode(
	mode: StoplightMode,
	registeredToolNames: readonly string[],
): string[] {
	const uniqueNames = [...new Set(registeredToolNames)];

	if (mode === "red") return [];
	if (mode === "yellow") {
		return uniqueNames.filter((name) => !YELLOW_DISABLED_TOOLS.has(name));
	}
	return uniqueNames;
}

export function shouldBlockToolCall(
	mode: StoplightMode,
	toolName: string,
): boolean {
	if (mode === "red") return true;
	return mode === "yellow" && YELLOW_DISABLED_TOOLS.has(toolName);
}

export function getSystemPromptAddition(mode: StoplightMode): string {
	return MODE_DEFINITIONS[mode].systemPrompt;
}

export function getModeChangeMessage(
	from: StoplightMode,
	to: StoplightMode,
): string {
	const next = MODE_DEFINITIONS[to];
	let policy = "all tools disabled";
	if (to === "green") {
		policy = "all tools enabled";
	} else if (to === "yellow") {
		policy = "plan/research mode - no write, edit, bash, or subagent";
	}

	return `${next.emoji} Stoplight changed from ${MODE_DEFINITIONS[from].label} to ${next.label}: ${policy}.`;
}
