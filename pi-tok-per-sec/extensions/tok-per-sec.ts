/**
 * Display output-token throughput for the most recent assistant response.
 *
 * The measurement starts when an assistant message starts and ends when pi
 * receives the finalized message. The provider-reported output-token count is
 * used when available.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const STATUS_ID = "tok-per-sec";

export default function (pi: ExtensionAPI) {
	let responseStartedAt: number | undefined;

	pi.on("session_start", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_ID, undefined);
		responseStartedAt = undefined;
	});

	pi.on("message_start", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		responseStartedAt = Date.now();
		ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("dim", "Generating response..."));
	});

	pi.on("message_end", async (event, ctx) => {
		if (event.message.role !== "assistant") return;

		const startedAt = responseStartedAt;
		responseStartedAt = undefined;

		const outputTokens = event.message.usage?.output ?? 0;
		if (startedAt === undefined || outputTokens <= 0) {
			ctx.ui.setStatus(STATUS_ID, ctx.ui.theme.fg("dim", "tok/s unavailable"));
			return;
		}

		const elapsedSeconds = Math.max((Date.now() - startedAt) / 1000, 0.001);
		const tokensPerSecond = outputTokens / elapsedSeconds;
		const formattedRate = tokensPerSecond.toFixed(1);

		ctx.ui.setStatus(
			STATUS_ID,
			ctx.ui.theme.fg(
				"dim",
				`${outputTokens} output tokens · ${formattedRate} tok/s`,
			),
		);
	});
}
