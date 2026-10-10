// Language aliases and semantic colors share one source of truth.
// Add a grammar to syntax-highlighting.js before mapping a new language here.
export const syntaxConfig = {
	fallbackLanguage: "plaintext",
	maxHighlightLength: 160000,
	languages: {
		plaintext: {
			label: "TEXT",
			aliases: ["text", "txt", "plain", "console", "output", "nohighlight"],
		},
		python: { label: "PYTHON", aliases: ["py", "python3"] },
		javascript: { label: "JAVASCRIPT", aliases: ["js", "jsx", "mjs", "cjs"] },
		typescript: { label: "TYPESCRIPT", aliases: ["ts", "tsx"] },
		bash: { label: "SHELL", aliases: ["sh", "shell", "zsh", "shellscript"] },
		json: { label: "JSON", aliases: ["jsonc"] },
		yaml: { label: "YAML", aliases: ["yml"] },
		xml: { label: "HTML / XML", aliases: ["html", "svg", "vue", "astro"] },
		css: { label: "CSS", aliases: [] },
		sql: { label: "SQL", aliases: ["postgres", "postgresql", "mysql"] },
		go: { label: "GO", aliases: ["golang"] },
		rust: { label: "RUST", aliases: ["rs"] },
		java: { label: "JAVA", aliases: [] },
		cpp: { label: "C / C++", aliases: ["c", "c++", "h", "hpp"] },
		ini: { label: "CONFIG", aliases: ["toml", "conf", "properties"] },
		dockerfile: { label: "DOCKERFILE", aliases: ["docker"] },
		markdown: { label: "MARKDOWN", aliases: ["md", "mdx"] },
		diff: { label: "DIFF", aliases: ["patch"] },
	},
	colors: {
		text: "#b6ffd0",
		keyword: "#69ffd3",
		string: "#c9ff91",
		number: "#ffd89b",
		function: "#94e8ff",
		type: "#adceff",
		property: "#e0ffb9",
		variable: "#ebffcf",
		comment: "#b8d1c1",
		operator: "#ddfff0",
		meta: "#c9b5ff",
		error: "#ffb2bd",
		added: "#aaffbe",
	},
};

export const languageAliases = new Map(
	Object.entries(syntaxConfig.languages).flatMap(([name, config]) =>
		[name, ...config.aliases].map((alias) => [alias, name]),
	),
);
export const syntaxTheme = Object.fromEntries(
	Object.entries(syntaxConfig.colors).map(([name, color]) => [
		`--code-${name}`,
		color,
	]),
);
