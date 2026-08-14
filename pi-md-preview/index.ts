import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
	ExtensionAPI,
	ExtensionCommandContext,
} from "@earendil-works/pi-coding-agent";
import { marked } from "marked";

const execFileAsync = promisify(execFile);

function getTextContent(message: { content: unknown }): string {
	if (typeof message.content === "string") return message.content;
	if (!Array.isArray(message.content)) return "";

	return message.content
		.filter(
			(block): block is { type: "text"; text: string } =>
				typeof block === "object" &&
				block !== null &&
				(block as { type?: unknown }).type === "text" &&
				typeof (block as { text?: unknown }).text === "string",
		)
		.map((block) => block.text)
		.join("\n");
}

function createDocument(markdown: string): string {
	const rendered = marked.parse(markdown, { async: false });
	const html = typeof rendered === "string" ? rendered : "";

	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Pi response</title>
  <style>
    :root { color-scheme: light dark; }
    body {
      max-width: 900px;
      margin: 0 auto;
      padding: 2rem 1.25rem 4rem;
      color: #24292f;
      background: #fff;
      font: 16px/1.6 system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
    }
    @media (prefers-color-scheme: dark) {
      body { color: #e6edf3; background: #0d1117; }
      code, pre { background: #161b22; }
      blockquote { color: #8b949e; border-color: #30363d; }
      a { color: #58a6ff; }
      hr { border-color: #30363d; }
    }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin-top: 1.5em; }
    pre { overflow-x: auto; padding: 1rem; border-radius: 8px; }
    code { padding: .15em .3em; border-radius: 4px; }
    pre code { padding: 0; }
    blockquote { border-left: 4px solid #d0d7de; margin-left: 0; padding-left: 1rem; }
    img { max-width: 100%; height: auto; }
    table { border-collapse: collapse; display: block; overflow-x: auto; }
    th, td { border: 1px solid #d0d7de; padding: .4rem .7rem; }
  </style>
</head>
<body>
${html}
</body>
</html>
`;
}

async function openInBrowser(filePath: string): Promise<void> {
	if (process.platform === "darwin") {
		await execFileAsync("open", [filePath]);
	} else if (process.platform === "win32") {
		await execFileAsync("cmd", ["/c", "start", "", filePath]);
	} else {
		await execFileAsync("xdg-open", [filePath]);
	}
}

async function previewLatest(ctx: ExtensionCommandContext): Promise<void> {
	const entry = [...ctx.sessionManager.getBranch()]
		.reverse()
		.find(
			(
				candidate,
			): candidate is typeof candidate & {
				message: { role: "assistant"; content: unknown };
			} => "message" in candidate && candidate.message?.role === "assistant",
		);

	if (!entry?.message || entry.message.role !== "assistant") {
		ctx.ui.notify("No assistant response is available to preview.", "warning");
		return;
	}

	const markdown = getTextContent(entry.message);
	if (!markdown.trim()) {
		ctx.ui.notify(
			"The latest assistant response contains no Markdown text.",
			"warning",
		);
		return;
	}

	const directory = await mkdtemp(join(tmpdir(), "pi-md-preview-"));
	const filePath = join(directory, "response.html");
	await writeFile(filePath, createDocument(markdown), "utf8");
	await openInBrowser(filePath);
	ctx.ui.notify(`Opened response in browser: ${filePath}`, "info");
}

export default function (pi: ExtensionAPI) {
	pi.registerCommand("preview", {
		description: "Open the latest assistant response as Markdown in the browser",
		handler: async (_args, ctx) => {
			try {
				await previewLatest(ctx);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				ctx.ui.notify(`Could not open preview: ${message}`, "error");
			}
		},
	});
}
