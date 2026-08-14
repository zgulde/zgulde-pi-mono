import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import stoplightExtension from "../index.ts";
import {
	DEFAULT_MODE,
	getActiveToolsForMode,
	getModeChangeMessage,
	getSystemPromptAddition,
	isStoplightMode,
	nextMode,
	shouldBlockToolCall,
	type StoplightMode,
} from "../src/stoplight.ts";

type RuntimeHandler = (
	event: Record<string, unknown>,
	ctx: ExtensionContext,
) => unknown;
type ShortcutHandler = (ctx: ExtensionContext) => unknown;

interface CustomEntryData {
	mode?: unknown;
}

interface BranchEntry {
	type: string;
	customType?: string;
	data?: CustomEntryData;
}

interface SentMessage {
	message: {
		customType: string;
		content: unknown;
		display: boolean;
		details?: unknown;
	};
	options: { deliverAs?: string; triggerTurn?: boolean } | undefined;
}

function createHarness(
	options: { tools?: string[]; branch?: BranchEntry[] } = {},
) {
	const handlers = new Map<string, unknown>();
	const appendedEntries: Array<{ customType: string; data: unknown }> = [];
	const sentMessages: SentMessage[] = [];
	const activeToolUpdates: string[][] = [];
	const statuses: Array<{ key: string; text: string | undefined }> = [];
	let branch = options.branch ?? [];
	let tools = options.tools ?? ["read", "bash", "edit", "write", "custom_tool"];
	let shortcutHandler: ShortcutHandler | undefined;

	const pi = {
		appendEntry(customType: string, data: unknown) {
			appendedEntries.push({ customType, data });
		},
		getAllTools() {
			return tools.map((name) => ({ name }));
		},
		on(eventName: string, handler: unknown) {
			handlers.set(eventName, handler);
		},
		registerShortcut(_key: string, options: { handler: ShortcutHandler }) {
			shortcutHandler = options.handler;
		},
		sendMessage(
			message: SentMessage["message"],
			messageOptions?: SentMessage["options"],
		) {
			sentMessages.push({ message, options: messageOptions });
		},
		setActiveTools(names: string[]) {
			activeToolUpdates.push([...names]);
		},
	} as unknown as ExtensionAPI;

	const ctx = {
		sessionManager: {
			getBranch: () => branch,
		},
		ui: {
			setStatus(key: string, text: string | undefined) {
				statuses.push({ key, text });
			},
			theme: {
				fg(color: string, text: string) {
					return `${color}:${text}`;
				},
			},
		},
	} as unknown as ExtensionContext;

	stoplightExtension(pi);

	async function emit(eventName: string, event: Record<string, unknown> = {}) {
		const handler = handlers.get(eventName) as RuntimeHandler | undefined;
		assert.ok(handler, `Expected a handler for ${eventName}`);
		return handler(event, ctx);
	}

	async function pressShortcut() {
		assert.ok(
			shortcutHandler,
			"Expected the Shift+Tab shortcut to be registered",
		);
		return shortcutHandler(ctx);
	}

	return {
		activeToolUpdates,
		appendedEntries,
		ctx,
		emit,
		pressShortcut,
		sentMessages,
		setBranch(nextBranch: BranchEntry[]) {
			branch = nextBranch;
		},
		setTools(nextTools: string[]) {
			tools = nextTools;
		},
		statuses,
	};
}

describe("stoplight policy", () => {
	it("defaults to yellow and cycles in traffic-light order", () => {
		assert.equal(DEFAULT_MODE, "yellow");
		assert.equal(nextMode("green"), "yellow");
		assert.equal(nextMode("yellow"), "red");
		assert.equal(nextMode("red"), "green");
	});

	it("recognizes only valid stoplight modes", () => {
		for (const mode of ["green", "yellow", "red"]) {
			assert.equal(isStoplightMode(mode), true);
		}
		assert.equal(isStoplightMode("blue"), false);
		assert.equal(isStoplightMode(undefined), false);
	});

	it("enables all unique tools in green", () => {
		assert.deepEqual(
			getActiveToolsForMode("green", ["read", "bash", "read", "custom"]),
			["read", "bash", "custom"],
		);
	});

	it("disables only edit, write, and bash in yellow", () => {
		assert.deepEqual(
			getActiveToolsForMode("yellow", [
				"read",
				"edit",
				"write",
				"bash",
				"custom",
			]),
			["read", "custom"],
		);
	});

	it("disables every tool in red", () => {
		assert.deepEqual(getActiveToolsForMode("red", ["read", "custom"]), []);
	});

	it("blocks tool calls according to the active mode", () => {
		assert.equal(shouldBlockToolCall("green", "write"), false);
		assert.equal(shouldBlockToolCall("yellow", "write"), true);
		assert.equal(shouldBlockToolCall("yellow", "custom"), false);
		assert.equal(shouldBlockToolCall("red", "read"), true);
	});

	it("provides a prompt and transition message for every mode", () => {
		const modes: StoplightMode[] = ["green", "yellow", "red"];
		for (const mode of modes) {
			assert.match(getSystemPromptAddition(mode), new RegExp(mode, "i"));
		}
		assert.match(getModeChangeMessage("yellow", "red"), /Yellow to Red/);
	});
});

describe("stoplight extension", () => {
	it("starts new sessions in yellow without announcing a transition", async () => {
		const harness = createHarness();

		await harness.emit("session_start");

		assert.deepEqual(harness.activeToolUpdates.at(-1), ["read", "custom_tool"]);
		assert.match(harness.statuses.at(-1)?.text ?? "", /Yellow/);
		assert.deepEqual(harness.appendedEntries, []);
		assert.deepEqual(harness.sentMessages, []);
	});

	it("restores the latest valid state from the active branch", async () => {
		const harness = createHarness({
			branch: [
				{
					type: "custom",
					customType: "pi-stoplight-state",
					data: { mode: "green" },
				},
				{ type: "custom", customType: "other", data: { mode: "red" } },
				{
					type: "custom",
					customType: "pi-stoplight-state",
					data: { mode: "red" },
				},
			],
		});

		await harness.emit("session_start");

		assert.deepEqual(harness.activeToolUpdates.at(-1), []);
		assert.match(harness.statuses.at(-1)?.text ?? "", /Red/);
		assert.deepEqual(harness.sentMessages, []);
	});

	it("restores state again after tree navigation", async () => {
		const harness = createHarness({
			branch: [
				{
					type: "custom",
					customType: "pi-stoplight-state",
					data: { mode: "green" },
				},
			],
		});
		await harness.emit("session_start");
		harness.setBranch([
			{
				type: "custom",
				customType: "pi-stoplight-state",
				data: { mode: "red" },
			},
		]);

		await harness.emit("session_tree");

		assert.deepEqual(harness.activeToolUpdates.at(-1), []);
		assert.match(harness.statuses.at(-1)?.text ?? "", /Red/);
	});

	it("cycles and persists without immediately injecting a message", async () => {
		const harness = createHarness();
		await harness.emit("session_start");

		await harness.pressShortcut();

		assert.deepEqual(harness.activeToolUpdates.at(-1), []);
		assert.deepEqual(harness.appendedEntries.at(-1), {
			customType: "pi-stoplight-state",
			data: { mode: "red" },
		});
		assert.deepEqual(harness.sentMessages, []);
	});

	it("reports the mode before queued changes and the final mode", async () => {
		const harness = createHarness();
		await harness.emit("session_start");

		await harness.pressShortcut();
		await harness.pressShortcut();

		const result = (await harness.emit("before_agent_start", {
			systemPrompt: "Base prompt",
		})) as {
			message?: SentMessage["message"];
			systemPrompt: string;
		};

		assert.deepEqual(harness.sentMessages, []);
		assert.deepEqual(result.message, {
			customType: "pi-stoplight",
			content: getModeChangeMessage("yellow", "green"),
			display: true,
			details: { from: "yellow", to: "green" },
		});
		assert.match(result.systemPrompt, /STOPLIGHT: GREEN/);

		const nextResult = (await harness.emit("before_agent_start", {
			systemPrompt: "Base prompt",
		})) as { message?: SentMessage["message"] };
		assert.equal(nextResult.message, undefined);
	});

	it("wraps from red to green and enables dynamically registered tools", async () => {
		const harness = createHarness();
		await harness.emit("session_start");
		await harness.pressShortcut();
		harness.setTools(["read", "bash", "edit", "write", "late_tool"]);

		await harness.pressShortcut();

		assert.deepEqual(harness.activeToolUpdates.at(-1), [
			"read",
			"bash",
			"edit",
			"write",
			"late_tool",
		]);
	});

	it("reapplies the tool policy and appends the mode to the system prompt", async () => {
		const harness = createHarness();
		await harness.emit("session_start");
		harness.setTools(["read", "bash", "late_tool"]);

		const result = (await harness.emit("before_agent_start", {
			systemPrompt: "Base prompt",
		})) as { systemPrompt: string };

		assert.deepEqual(harness.activeToolUpdates.at(-1), ["read", "late_tool"]);
		assert.match(result.systemPrompt, /^Base prompt/);
		assert.match(result.systemPrompt, /STOPLIGHT: YELLOW/);
	});

	it("blocks stale calls that violate yellow or red mode", async () => {
		const harness = createHarness();
		await harness.emit("session_start");

		const yellowBlocked = await harness.emit("tool_call", { toolName: "bash" });
		const yellowAllowed = await harness.emit("tool_call", { toolName: "read" });
		await harness.pressShortcut();
		const redBlocked = await harness.emit("tool_call", { toolName: "read" });

		assert.deepEqual(yellowBlocked, {
			block: true,
			reason: "🟡 Yellow stoplight mode blocks the bash tool.",
		});
		assert.equal(yellowAllowed, undefined);
		assert.deepEqual(redBlocked, {
			block: true,
			reason: "🔴 Red stoplight mode blocks the read tool.",
		});
	});
});
