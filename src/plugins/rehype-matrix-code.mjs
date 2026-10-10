import { visit, SKIP } from "unist-util-visit";
import { fromHtml } from "hast-util-from-html";
import { highlightCode } from "../matrix/syntax-highlighting.js";
const text = (node) =>
	node.type === "text" ? node.value : (node.children || []).map(text).join("");
export function rehypeMatrixCode() {
	return (tree) =>
		visit(tree, "element", (node, index, parent) => {
			if (node.tagName !== "pre" || !parent) return;
			const code = node.children.find((child) => child.tagName === "code");
			if (!code) return;
			const lang =
				(code.properties?.className || [])
					.find((value) => value.startsWith("language-"))
					?.slice(9) || "";
			const highlighted = highlightCode(text(code), lang);
			const html = `<section class="terminal-screen"><div class="terminal-bar"><span class="terminal-lights"><i></i><i></i><i></i></span><span>${highlighted.label}</span><button type="button" data-copy-code aria-label="复制代码">COPY</button></div><pre tabindex="0"><code class="hljs language-${highlighted.language}">${highlighted.html}</code></pre><div class="terminal-status"><span>READ / EXECUTE / UNDERSTAND</span><span>UTF-8</span></div></section>`;
			parent.children[index] = fromHtml(html, { fragment: true }).children[0];
			return SKIP;
		});
}
