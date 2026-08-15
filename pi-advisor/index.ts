import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { getMarkdownTheme } from "@earendil-works/pi-coding-agent";
import type { AssistantMessage, Usage } from "@earendil-works/pi-ai";
import { Container, Markdown, Spacer, Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

/**
 * Default advisor model. A single in-process model call, not an agent run.
 *
 * Selection priority (see resolveAdvisorModel):
 *   1. The configured advisor model — matched by provider id AND model id when
 *      `ADVISOR_PROVIDER` is set, so a bare model id that happens to exist under
 *      multiple providers (e.g. `glm-5.2` on both `opencode` and `opencode-go`)
 *      resolves to the intended one rather than whichever sorts first.
 *   2. The session's active model (`ctx.model`) when the configured model is
 *      unavailable in the live catalog.
 *   3. A thrown error when no model can be resolved.
 */
const ADVISOR_PROVIDER = "opencode-go";
const ADVISOR_MODEL = "glm-5.2";

/** Cap on the advisor's output tokens per call. */
const MAX_TOKENS = 8192;

/** Advisor persona: direct, specific, actionable; no praise inflation. */
const PERSONA_SYSTEM_PROMPT = [
	"You are a senior engineer acting as a second opinion for another engineering agent.",
	"Your job is to give direct, specific, and actionable feedback on the plan, design, or code",
	"you are shown. Push back when the approach is wrong or under-specified. Do not flatter;",
	"call out real risks, edge cases, assumptions, and cheaper/simpler alternatives. Be",
	"concrete: reference the material you were given and prefer named recommendations over",
	"general advice. Keep the response focused and as short as the situation allows.",
].join(" ");

function getTextContent(message: AssistantMessage): string {
	return message.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

function formatTokens(count: number): string {
	if (count < 1000) return count.toString();
	if (count < 10000) return `${(count / 1000).toFixed(1)}k`;
	return `${Math.round(count / 1000)}k`;
}

function formatUsage(usage: Usage): string {
	const parts: string[] = [];
	if (usage.input) parts.push(`↑${formatTokens(usage.input)}`);
	if (usage.output) parts.push(`↓${formatTokens(usage.output)}`);
	if (usage.cost?.total) parts.push(`$${usage.cost.total.toFixed(4)}`);
	return parts.join(" ");
}

const AdvisorParams = Type.Object({
	question: Type.String({
		description:
			"The situation, plan, design, or code for the advisor to react to",
	}),
	context: Type.Optional(
		Type.String({
			description:
				"Code snippets, diffs, or background the advisor should consider (opt-in; the advisor does not see conversation history)",
		}),
	),
});

interface AdvisorDetails {
	model: string;
	usage?: Usage;
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "advisor",
		label: "Advisor",
		description:
			"Get a second opinion from the advisor model: a design critique, a critical review of a plan, or feedback on code — mid-turn. A single model call, not a subagent.",
		promptSnippet:
			"Get feedback on a plan, design decision, or code from the advisor model",
		promptGuidelines: [
			"Use advisor when a design decision is subtle or high-stakes, before committing to an approach, or when the user asks for review.",
			"Use advisor to pressure-test a plan for holes, assumptions, and cheaper alternatives before executing.",
		],
		parameters: AdvisorParams,

		async execute(_toolCallId, params, signal, onUpdate, ctx) {
			const resolveAdvisorModel = () => {
				const all = ctx.modelRegistry.getAll();
				// Prefer an exact provider+model match; a bare model id is ambiguous
				// because several providers can carry the same id.
				const configured =
					all.find(
						(m) => m.provider === ADVISOR_PROVIDER && m.id === ADVISOR_MODEL,
					) ??
					all.find(
						(m) => m.id === ADVISOR_MODEL && ctx.modelRegistry.hasConfiguredAuth(m),
					);
				if (configured) return configured;
				if (ctx.model) return ctx.model;
				const available = ctx.modelRegistry
					.getAvailable()
					.map((m) => `${m.provider}/${m.id}`)
					.join(", ");
				throw new Error(
					`No advisor model available. Configured (${ADVISOR_PROVIDER}/${ADVISOR_MODEL}) and the session model are both unavailable. Available: ${available || "none"}`,
				);
			};

			const model = resolveAdvisorModel();
			const modelLabel = `${model.provider}/${model.id}`;

			const stagedDetails: AdvisorDetails = { model: modelLabel };
			onUpdate?.({
				content: [{ type: "text", text: `Consulting ${modelLabel}...` }],
				details: stagedDetails,
			});

			const userContent = params.context
				? `${params.question}\n\n<context>\n${params.context}\n</context>`
				: params.question;

			let response: AssistantMessage;
			try {
				response = await ctx.modelRegistry.complete(
					model,
					{
						systemPrompt: PERSONA_SYSTEM_PROMPT,
						messages: [{ role: "user", content: userContent, timestamp: Date.now() }],
					},
					{
						maxTokens: MAX_TOKENS,
						// `glm-5.x` on opencode-go serves the openai-completions API, whose
						// options use `reasoningEffort` (not the generic `reasoning` field).
						// The model's `thinkingLevelMap` maps "high" -> "high", so this is sent
						// as `reasoning_effort: "high"` to the backend.
						reasoningEffort: "high",
						signal,
					},
				);
			} catch (error) {
				if (signal?.aborted) {
					throw new Error(`Advisor consulted interrupted: ${modelLabel}`);
				}
				const message = error instanceof Error ? error.message : String(error);
				throw new Error(`Advisor call failed (${modelLabel}): ${message}`);
			}

			const answer = getTextContent(response);
			if (!answer.trim()) {
				if (response.stopReason === "error" && response.errorMessage) {
					throw new Error(`Advisor ${modelLabel} failed: ${response.errorMessage}`);
				}
				throw new Error(
					`Advisor ${modelLabel} returned no text (stopReason: ${response.stopReason})`,
				);
			}

			return {
				content: [{ type: "text", text: answer }],
				details: {
					model: modelLabel,
					usage: response.usage,
				} satisfies AdvisorDetails,
				usage: response.usage,
			};
		},

		renderCall(args, theme, _context) {
			const preview =
				args.question.length > 60
					? `${args.question.slice(0, 60)}…`
					: args.question;
			let text =
				theme.fg("toolTitle", theme.bold("advisor ")) +
				theme.fg("accent", ADVISOR_MODEL);
			text += `\n  ${theme.fg("dim", preview)}`;
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded }, theme) {
			const details = result.details as
				| { model?: string; usage?: Usage }
				| undefined;
			const text = result.content[0];
			const raw = text?.type === "text" ? text.text : "";
			const body =
				(expanded ? raw : raw.split("\n").slice(0, 20).join("\n")) || "";

			const mdTheme = getMarkdownTheme();
			const container = new Container();
			container.addChild(
				new Text(
					theme.fg("toolTitle", theme.bold("advisor ")) +
						theme.fg("muted", details?.model ?? ""),
					0,
					0,
				),
			);
			container.addChild(new Spacer(1));
			container.addChild(new Markdown(body, 0, 0, mdTheme));
			if (details?.usage) {
				const usageStr = formatUsage(details.usage);
				if (usageStr) {
					container.addChild(new Spacer(1));
					container.addChild(new Text(theme.fg("dim", usageStr), 0, 0));
				}
			}
			return container;
		},
	});
}
