import fs from "node:fs";
import { siteMeta } from "./src/matrix/config/site.js";
import path from "node:path";
import sitemap from "@astrojs/sitemap";
import { defineConfig } from "astro/config";
import rehypeAutolinkHeadings from "rehype-autolink-headings";
import rehypeComponents from "rehype-components"; /* Render the custom directive content */
import rehypeKatex from "rehype-katex";
import rehypeSlug from "rehype-slug";
import remarkDirective from "remark-directive"; /* Handle directives */
import remarkGithubAdmonitionsToDirectives from "remark-github-admonitions-to-directives";
import remarkMath from "remark-math";
import remarkSectionize from "remark-sectionize";
import { AdmonitionComponent } from "./src/plugins/rehype-component-admonition.mjs";
import { GithubCardComponent } from "./src/plugins/rehype-component-github-card.mjs";
import { rehypeMatrixMermaid } from "./src/plugins/rehype-matrix-mermaid.mjs";
import { parseDirectiveNode } from "./src/plugins/remark-directive-rehype.js";
import { remarkExcerpt } from "./src/plugins/remark-excerpt.js";
import { remarkMermaid } from "./src/plugins/remark-mermaid.js";
import { remarkReadingTime } from "./src/plugins/remark-reading-time.mjs";
import react from "@astrojs/react";
import { rehypeMatrixCode } from "./src/plugins/rehype-matrix-code.mjs";
import { matrixChatDev } from "./server/dev-chat.mjs";
function getPostLastmods() {
	const dir = path.resolve("./src/content/posts");
	const map = new Map();
	let files = [];
	try {
		files = fs.readdirSync(dir, { withFileTypes: true });
	} catch {
		return map;
	}
	for (const f of files) {
		if (!f.isFile() || !f.name.endsWith(".md")) continue;
		const head = fs.readFileSync(path.join(dir, f.name), "utf8").slice(0, 1500);
		const updated = head.match(/^updated:\s*["']?(\d{4}-\d{2}-\d{2})/m);
		const published = head.match(/^published:\s*["']?(\d{4}-\d{2}-\d{2})/m);
		const dateStr = updated?.[1] || published?.[1];
		if (dateStr)
			map.set(
				f.name.replace(/\.md$/, ""),
				new Date(`${dateStr}T12:00:00+08:00`),
			);
	}
	return map;
}
const postLastmods = getPostLastmods();

export default defineConfig({
	site: siteMeta.url,
	output: "static",
	base: "/",
	trailingSlash: "ignore",
	integrations: [
		{
			name: "matrix-vite-cache-isolation",
			hooks: {
				"astro:config:setup": ({ command, updateConfig }) => {
					updateConfig({
						vite: {
							cacheDir: path.resolve(`node_modules/.vite-matrix-${command}`),
						},
					});
				},
			},
		},
		react(),
		sitemap({
			filter: (page) => {
				const path = new URL(page).pathname.replace(/\/?$/, "/");
				return (
					["/", "/archive/", "/projects/", "/about/"].includes(path) ||
					path.startsWith("/posts/")
				);
			},
			serialize(item) {
				item.url = item.url.replace(/\/?$/, "/");
				const match = new URL(item.url).pathname.match(/^\/posts\/([^/]+)\/$/);
				const date = match && postLastmods.get(match[1]);
				if (date) item.lastmod = date.toISOString();
				return item;
			},
		}),
	],
	markdown: {
		syntaxHighlight: false,
		remarkPlugins: [
			[remarkMath, { singleDollarTextMath: false }],
			remarkReadingTime,
			remarkExcerpt,
			remarkGithubAdmonitionsToDirectives,
			remarkDirective,
			remarkSectionize,
			parseDirectiveNode,
			remarkMermaid,
		],
		rehypePlugins: [
			rehypeMatrixCode,
			rehypeKatex,
			rehypeSlug,
			rehypeMatrixMermaid,
			[
				rehypeComponents,
				{
					components: {
						github: GithubCardComponent,
						note: (x, y) => AdmonitionComponent(x, y, "note"),
						tip: (x, y) => AdmonitionComponent(x, y, "tip"),
						important: (x, y) => AdmonitionComponent(x, y, "important"),
						caution: (x, y) => AdmonitionComponent(x, y, "caution"),
						warning: (x, y) => AdmonitionComponent(x, y, "warning"),
					},
				},
			],
			[
				rehypeAutolinkHeadings,
				{
					behavior: "append",
					properties: {
						className: ["anchor"],
					},
					content: {
						type: "element",
						tagName: "span",
						properties: {
							className: ["anchor-icon"],
							"data-pagefind-ignore": true,
						},
						children: [
							{
								type: "text",
								value: "#",
							},
						],
					},
				},
			],
		],
	},
	vite: {
		plugins: [matrixChatDev()],
		optimizeDeps: {
			entries: [
				"src/matrix/MatrixApp.jsx",
				"src/pages/**/*.astro",
				"src/layouts/MatrixLayout.astro",
			],
		},
	},
});
