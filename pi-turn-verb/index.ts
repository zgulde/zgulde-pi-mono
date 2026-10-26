/**
 * "Sautéed for 26s · done 6:23 PM" — Claude Code-style end-of-turn line.
 *
 * After each agent run, appends a custom session entry (never sent to the
 * model) with a random cooking/thinking verb, the wall-clock duration of the
 * run, and the finish time.
 */

import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const DIM = "\x1b[2m";
const RESET = "\x1b[22m\x1b[39m";

interface VerbEntryData {
	verb: string;
	durationMs: number;
	doneAt: number;
}

const VERBS = [
	"Pondering", "Musing", "Brewing", "Simmering", "Sautéing", "Noodling",
	"Marinating", "Kneading", "Fermenting", "Decanting", "Whisking", "Steeping",
	"Percolating", "Infusing", "Proofing", "Folding", "Zesting", "Tempering",
	"Contemplating", "Ruminating", "Deliberating", "Cogitating", "Mulling",
	"Wrestling", "Untangling", "Weighing", "Consulting", "Conjuring",
];

function pick<T>(arr: T[]): T {
	return arr[Math.floor(Math.random() * arr.length)];
}

function formatDuration(ms: number): string {
	const s = Math.round(ms / 1000);
	if (s < 60) return `${s}s`;
	const m = Math.floor(s / 60);
	const rest = s % 60;
	return rest ? `${m}m ${rest}s` : `${m}m`;
}

export default function (pi: ExtensionAPI) {
	let startedAt = 0;
	let verb = pick(VERBS);

	const applyIndicator = (ctx: ExtensionContext) => {
		ctx.ui.setWorkingIndicator({
			frames: SPINNER_FRAMES.map(
				(frame) => `${frame}${DIM} ${verb}…${RESET}`,
			),
			intervalMs: 80,
		});
	};

	pi.on("session_start", async (_event, ctx) => {
		applyIndicator(ctx);
	});

	pi.on("agent_start", async (_event, ctx) => {
		startedAt = Date.now();
		verb = pick(VERBS);
		applyIndicator(ctx);
	});

	pi.on("agent_end", () => {
		const durationMs = startedAt ? Date.now() - startedAt : 0;
		pi.appendEntry<VerbEntryData>("turn-verb", {
			verb,
			durationMs,
			doneAt: Date.now(),
		});
	});

	pi.registerEntryRenderer<VerbEntryData>("turn-verb", (entry, _ctx, theme) => {
		const data = entry.data ?? { verb: "Worked", durationMs: 0, doneAt: Date.now() };
		const time = new Date(data.doneAt).toLocaleTimeString([], {
			hour: "numeric",
			minute: "2-digit",
		});
		const line = `${data.verb.replace(/ing$/, "ed")} for ${formatDuration(data.durationMs)} · done ${time}`;
		return new Text(theme.fg("dim", line), 0, 0);
	});
}
