import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_MODE,
	getActiveToolsForMode,
	getModeChangeMessage,
	getSystemPromptAddition,
	isStoplightMode,
	MODE_DEFINITIONS,
	nextMode,
	shouldBlockToolCall,
	type StoplightMode,
} from "./src/stoplight.ts";

const STATE_ENTRY_TYPE = "pi-stoplight-state";
const MESSAGE_TYPE = "pi-stoplight";
const STATUS_KEY = "pi-stoplight";

interface StoplightState {
	mode: StoplightMode;
}

const STATUS_COLORS = {
	green: "success",
	yellow: "warning",
	red: "error",
} as const;

export default function stoplightExtension(pi: ExtensionAPI): void {
	let mode: StoplightMode = DEFAULT_MODE;
	let pendingAnnouncement:
		| { from: StoplightMode; to: StoplightMode }
		| undefined;

	function applyToolPolicy(): void {
		const registeredNames = pi.getAllTools().map((tool) => tool.name);
		pi.setActiveTools(getActiveToolsForMode(mode, registeredNames));
	}

	function updateStatus(ctx: ExtensionContext): void {
		const definition = MODE_DEFINITIONS[mode];
		ctx.ui.setStatus(
			STATUS_KEY,
			ctx.ui.theme.fg(STATUS_COLORS[mode], definition.statusText),
		);
	}

	function persistState(): void {
		pi.appendEntry<StoplightState>(STATE_ENTRY_TYPE, { mode });
	}

	function queueAnnouncement(from: StoplightMode, to: StoplightMode): void {
		pendingAnnouncement = { from: pendingAnnouncement?.from ?? from, to };
	}

	function setMode(
		next: StoplightMode,
		ctx: ExtensionContext,
		options: { announce: boolean; persist: boolean },
	): void {
		const previous = mode;
		mode = next;
		applyToolPolicy();
		updateStatus(ctx);

		if (previous === next) return;
		if (options.persist) persistState();
		if (options.announce) queueAnnouncement(previous, next);
	}

	function restoreFromBranch(ctx: ExtensionContext): void {
		pendingAnnouncement = undefined;
		let restoredMode = DEFAULT_MODE;

		for (const entry of ctx.sessionManager.getBranch()) {
			if (entry.type !== "custom" || entry.customType !== STATE_ENTRY_TYPE)
				continue;

			const savedMode = (entry.data as Partial<StoplightState> | undefined)
				?.mode;
			if (isStoplightMode(savedMode)) restoredMode = savedMode;
		}

		setMode(restoredMode, ctx, { announce: false, persist: false });
	}

	pi.registerShortcut("shift+tab", {
		description: "Cycle pi stoplight mode",
		handler: async (ctx) => {
			setMode(nextMode(mode), ctx, { announce: true, persist: true });
		},
	});

	pi.registerCommand("stoplight", {
		description: "Cycle the stoplight mode (green → yellow → red)",
		handler: async (_args, ctx) => {
			setMode(nextMode(mode), ctx, { announce: true, persist: true });
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});

	pi.on("session_tree", async (_event, ctx) => {
		restoreFromBranch(ctx);
	});

	pi.on("before_agent_start", (event) => {
		// Reapply the policy so tools registered dynamically follow the current mode.
		applyToolPolicy();

		const announcement = pendingAnnouncement;
		pendingAnnouncement = undefined;

		return {
			...(announcement
				? {
						message: {
							customType: MESSAGE_TYPE,
							content: getModeChangeMessage(announcement.from, announcement.to),
							display: true,
							details: announcement,
						},
					}
				: {}),
			systemPrompt: `${event.systemPrompt}\n\n${getSystemPromptAddition(mode)}`,
		};
	});

	pi.on("tool_call", (event) => {
		if (!shouldBlockToolCall(mode, event.toolName)) return;

		return {
			block: true,
			reason: `${MODE_DEFINITIONS[mode].emoji} ${MODE_DEFINITIONS[mode].label} stoplight mode blocks the ${event.toolName} tool.`,
		};
	});
}
