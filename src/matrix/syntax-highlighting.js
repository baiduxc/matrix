import hljs from "highlight.js/lib/core";
import plaintext from "highlight.js/lib/languages/plaintext";
import python from "highlight.js/lib/languages/python";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import bash from "highlight.js/lib/languages/bash";
import json from "highlight.js/lib/languages/json";
import yaml from "highlight.js/lib/languages/yaml";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import sql from "highlight.js/lib/languages/sql";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import cpp from "highlight.js/lib/languages/cpp";
import ini from "highlight.js/lib/languages/ini";
import dockerfile from "highlight.js/lib/languages/dockerfile";
import markdown from "highlight.js/lib/languages/markdown";
import diff from "highlight.js/lib/languages/diff";
import { syntaxConfig, languageAliases } from "./config/syntax-highlighting.js";

const grammars = {
	plaintext,
	python,
	javascript,
	typescript,
	bash,
	json,
	yaml,
	xml,
	css,
	sql,
	go,
	rust,
	java,
	cpp,
	ini,
	dockerfile,
	markdown,
	diff,
};
Object.entries(grammars).forEach(([name, grammar]) =>
	hljs.registerLanguage(name, grammar),
);
const escapeHTML = (value) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;");

export function highlightCode(source, info = "") {
	const requested = info.trim().split(/\s+/)[0].toLowerCase();
	const language =
		languageAliases.get(requested) || syntaxConfig.fallbackLanguage;
	const label = syntaxConfig.languages[language].label;
	// Unknown fences and large logs remain readable without speculative language detection.
	if (
		language === "plaintext" ||
		source.length > syntaxConfig.maxHighlightLength
	)
		return { html: escapeHTML(source), language, label };
	try {
		return {
			html: hljs.highlight(source, { language, ignoreIllegals: true }).value,
			language,
			label,
		};
	} catch {
		return { html: escapeHTML(source), language: "plaintext", label: "TEXT" };
	}
}
