import { test } from "node:test";
import assert from "node:assert/strict";
import { fromHtml } from "hast-util-from-html";
import { rehypeMatrixCode } from "../src/plugins/rehype-matrix-code.mjs";
import { rehypeMatrixMermaid } from "../src/plugins/rehype-matrix-mermaid.mjs";

test("code frames retain syntax tokens, escaped source and copy controls", () => {
	const tree = fromHtml(
		'<pre><code class="language-javascript">const answer = "&lt;script&gt;";</code></pre>',
		{ fragment: true },
	);
	rehypeMatrixCode()(tree);
	const frame = tree.children[0];
	assert.deepEqual(frame.properties.className, ["terminal-screen"]);
	const source = JSON.stringify(frame);
	assert.ok(source.includes("hljs-keyword"));
	assert.ok(source.includes("dataCopyCode"));
	assert.ok(source.includes("<script>"));
	assert.ok(!source.includes('"tagName":"script"'));
});

test("Mermaid source remains inert text until the reader renders it", () => {
	const tree = {
		type: "root",
		children: [
			{
				type: "element",
				tagName: "div",
				properties: {
					className: ["mermaid-container"],
					"data-mermaid-code": "graph TD; A-->B",
				},
				children: [],
			},
		],
	};
	rehypeMatrixMermaid()(tree);
	assert.deepEqual(tree.children[0].properties.className, ["mermaid"]);
	assert.deepEqual(tree.children[0].children, [
		{ type: "text", value: "graph TD; A-->B" },
	]);
});
