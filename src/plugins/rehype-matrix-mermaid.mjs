import { visit } from "unist-util-visit";
export function rehypeMatrixMermaid() {
	return (tree) =>
		visit(tree, "element", (node) => {
			if (!node.properties?.className?.includes("mermaid-container")) return;
			const source = node.properties["data-mermaid-code"] || "";
			node.properties = { className: ["mermaid"], "data-mermaid-code": source };
			node.children = [{ type: "text", value: source }];
		});
}
